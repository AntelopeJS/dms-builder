import fs from "node:fs";
import path from "node:path";
import type {
  BlockTypeDescriptor,
  ConfigSchema,
  DataTypeDescriptor,
  OptionSchema,
} from "@antelopejs/interface-dms-builder";
import {
  type FunctionTypeNode,
  type InterfaceDeclaration,
  Node,
  Project,
  type SourceFile,
  type TypeAliasDeclaration,
  type TypeNode,
  type TypeParameterDeclaration,
} from "ts-morph";

const BASE_MODULE = "@antelopejs/interface-dms/base";
const DATATYPE_MODULE = `${BASE_MODULE}/data-types/default-types`;
const DATATYPE_ACCESSOR = "DefaultDataTypes";
const BUILDER_RETURN = /^(ComponentBuilder|FormBuilder)\b/;
const MAX_DEPTH = 4;

interface TypeIndex {
  interfaces: Map<string, InterfaceDeclaration>;
  aliases: Map<string, TypeAliasDeclaration>;
}

/** The declarations `loadBaseProject` will read, under `dir` at any depth. */
function hasDeclarations(dir: string): boolean {
  return fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .some((entry) => entry.endsWith(".d.ts"));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Where the DMS base interface ships its declarations.
 *
 * Resolved through the interface package's own subpath rather than a path built
 * from the runtime package: the runtime blocks `./interfaces/*`, and the
 * interface package is free to move its build output as long as the subpath
 * keeps resolving.
 *
 * Checked rather than trusted. `require.resolve` answers with a file, and the
 * tree around it is the declaration tree only by convention: a package that
 * bundles `base` into one file, or ships none, leaves the glob below with
 * nothing to read. That failure is invisible -- an empty catalog looks exactly
 * like a DMS that declares no blocks -- so it is raised here instead, where the
 * reason is still known.
 */
function resolveDmsBaseDir(): string {
  let entry: string;
  try {
    entry = require.resolve(BASE_MODULE);
  } catch (error) {
    throw new Error(
      `Cannot resolve "${BASE_MODULE}". The builder reads the block factories and DataTypes off its declarations: ${describe(error)}`,
    );
  }
  const baseDir = path.dirname(entry);
  if (!fs.statSync(baseDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(
      `"${BASE_MODULE}" resolved to ${entry}, which is not inside a directory the builder can read.`,
    );
  }
  if (!hasDeclarations(baseDir)) {
    throw new Error(
      `"${BASE_MODULE}" resolved to ${baseDir}, which ships no .d.ts declarations. The builder infers the block factories and DataTypes from them, so it cannot build a catalog from this package.`,
    );
  }
  return baseDir;
}

function loadBaseProject(baseDir: string): SourceFile[] {
  const project = new Project({
    useInMemoryFileSystem: false,
    compilerOptions: { allowJs: true, skipLibCheck: true },
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths(path.join(baseDir, "**/*.d.ts"));
  return project.getSourceFiles();
}

function collectTypes(sourceFiles: SourceFile[]): TypeIndex {
  const interfaces = new Map<string, InterfaceDeclaration>();
  const aliases = new Map<string, TypeAliasDeclaration>();
  for (const sourceFile of sourceFiles) {
    for (const declaration of sourceFile.getInterfaces()) {
      interfaces.set(declaration.getName(), declaration);
    }
    for (const declaration of sourceFile.getTypeAliases()) {
      aliases.set(declaration.getName(), declaration);
    }
  }
  return { interfaces, aliases };
}

function baseName(text: string): string {
  return text.replace(/<.*$/, "").trim();
}

function describeTypeText(text: string): OptionSchema {
  const trimmed = text.trim();
  if (trimmed === "string") return { type: "string" };
  if (trimmed === "number") return { type: "number" };
  if (trimmed === "boolean") return { type: "boolean" };
  if (trimmed.endsWith("[]") || trimmed.startsWith("Array<")) {
    return { type: "array" };
  }
  const literalUnion = /^(["'][^"']*["']\s*\|?\s*)+$/.test(trimmed);
  if (literalUnion) {
    return {
      type: "string",
      enum: trimmed
        .split("|")
        .map((part) => part.trim().replace(/^["']|["']$/g, "")),
    };
  }
  if (trimmed.includes("|")) return { type: "string" };
  if (/DataType\b/.test(trimmed)) return { type: "object", "x-dataType": true };
  if (/^Component(Builder)?\b/.test(trimmed)) {
    return { type: "object", "x-component": true };
  }
  return { type: "object" };
}

function schemaFromTypeNode(
  typeNode: TypeNode | undefined,
  index: TypeIndex,
  seen: Set<string>,
  depth = 0,
): ConfigSchema {
  if (!typeNode) return {};
  if (Node.isTypeLiteral(typeNode)) {
    return membersToSchema(typeNode.getProperties(), index, seen, depth);
  }
  const name = baseName(typeNode.getText());
  const declaration = index.interfaces.get(name);
  if (declaration) {
    if (seen.has(name)) return {};
    seen.add(name);
    const schema: ConfigSchema = {};
    for (const base of declaration.getExtends()) {
      Object.assign(schema, schemaFromTypeNode(base, index, seen, depth));
    }
    Object.assign(
      schema,
      membersToSchema(declaration.getProperties(), index, seen, depth),
    );
    return schema;
  }
  const alias = index.aliases.get(name);
  if (alias && !seen.has(name)) {
    seen.add(name);
    return schemaFromTypeNode(alias.getTypeNode(), index, seen, depth);
  }
  return {};
}

function arrayElementNode(typeNode: TypeNode): TypeNode | undefined {
  if (Node.isArrayTypeNode(typeNode)) return typeNode.getElementTypeNode();
  if (
    Node.isTypeReference(typeNode) &&
    typeNode.getTypeName().getText() === "Array"
  ) {
    return typeNode.getTypeArguments()[0];
  }
  return undefined;
}

function describeUnion(
  members: TypeNode[],
  index: TypeIndex,
  seen: Set<string>,
  depth: number,
): OptionSchema {
  const isStringLiteral = (node: TypeNode) =>
    Node.isLiteralTypeNode(node) && /^["']/.test(node.getText().trim());
  if (members.every(isStringLiteral)) {
    return {
      type: "string",
      enum: members.map((node) =>
        node
          .getText()
          .trim()
          .replace(/^["']|["']$/g, ""),
      ),
    };
  }
  const expandable = members.some(
    (node) =>
      Node.isTypeLiteral(node) ||
      index.interfaces.has(baseName(node.getText())),
  );
  if (expandable) {
    return {
      type: "object",
      oneOf: members.map((node) =>
        describeTypeNode(node, index, new Set(seen), depth + 1),
      ),
    };
  }
  return describeTypeText(members.map((node) => node.getText()).join(" | "));
}

function describeTypeNode(
  typeNode: TypeNode | undefined,
  index: TypeIndex,
  seen: Set<string>,
  depth: number,
): OptionSchema {
  if (!typeNode) return { type: "object" };
  if (depth >= MAX_DEPTH) return describeTypeText(typeNode.getText());
  if (Node.isTypeLiteral(typeNode)) {
    return {
      type: "object",
      properties: membersToSchema(
        typeNode.getProperties(),
        index,
        seen,
        depth + 1,
      ),
    };
  }
  const element = arrayElementNode(typeNode);
  if (element) {
    return {
      type: "array",
      items: describeTypeNode(element, index, seen, depth + 1),
    };
  }
  if (Node.isUnionTypeNode(typeNode)) {
    return describeUnion(typeNode.getTypeNodes(), index, seen, depth);
  }
  const name = baseName(typeNode.getText());
  if (/DataType\b/.test(name)) return { type: "object", "x-dataType": true };
  if (index.interfaces.has(name)) {
    if (seen.has(name)) return { type: "object" };
    return {
      type: "object",
      properties: schemaFromTypeNode(typeNode, index, new Set(seen), depth + 1),
    };
  }
  const alias = index.aliases.get(name);
  if (alias && !seen.has(name)) {
    const next = new Set(seen);
    next.add(name);
    return describeTypeNode(alias.getTypeNode(), index, next, depth);
  }
  return describeTypeText(typeNode.getText());
}

function membersToSchema(
  properties: Array<{
    getName(): string;
    hasQuestionToken(): boolean;
    getTypeNode(): TypeNode | undefined;
  }>,
  index: TypeIndex,
  seen: Set<string>,
  depth: number,
): ConfigSchema {
  const schema: ConfigSchema = {};
  for (const property of properties) {
    schema[property.getName()] = {
      ...describeTypeNode(property.getTypeNode(), index, seen, depth),
      optional: property.hasQuestionToken(),
    };
  }
  return schema;
}

interface FactoryShape {
  name: string;
  returnText: string;
  optionsType?: TypeNode;
  controllerArg: boolean;
}

/** The type parameters that stand for a table's DataAPI class. */
function controllerParams(
  typeParameters: TypeParameterDeclaration[],
): Set<string> {
  return new Set(
    typeParameters
      .filter((tp) =>
        /\bControllerClass\b/.test(tp.getConstraint()?.getText() ?? ""),
      )
      .map((tp) => tp.getName()),
  );
}

function controllerLeading(
  typeParameters: TypeParameterDeclaration[],
  firstParamType: TypeNode | undefined,
): boolean {
  if (!firstParamType) return false;
  return controllerParams(typeParameters).has(firstParamType.getText().trim());
}

function factoryShape(
  name: string,
  returnText: string,
  typeParameters: TypeParameterDeclaration[],
  parameters: Array<{ getTypeNode(): TypeNode | undefined }>,
): FactoryShape {
  const isControllerLeading = controllerLeading(
    typeParameters,
    parameters[0]?.getTypeNode(),
  );
  return {
    name,
    returnText,
    optionsType: parameters[isControllerLeading ? 1 : 0]?.getTypeNode(),
    controllerArg: isControllerLeading,
  };
}

function functionShapes(sourceFile: SourceFile): FactoryShape[] {
  const shapes: FactoryShape[] = [];
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name || !fn.isExported()) continue;
    shapes.push(
      factoryShape(
        name,
        fn.getReturnTypeNode()?.getText() ?? "",
        fn.getTypeParameters(),
        fn.getParameters(),
      ),
    );
  }
  for (const variable of sourceFile.getVariableDeclarations()) {
    if (!variable.getVariableStatement()?.isExported()) continue;
    const typeNode = variable.getTypeNode();
    if (!typeNode || !Node.isFunctionTypeNode(typeNode)) continue;
    const fnType = typeNode as FunctionTypeNode;
    shapes.push(
      factoryShape(
        variable.getName(),
        fnType.getReturnTypeNode()?.getText() ?? "",
        fnType.getTypeParameters(),
        fnType.getParameters(),
      ),
    );
  }
  return shapes;
}

function discoverBlocks(
  sourceFiles: SourceFile[],
  index: TypeIndex,
): BlockTypeDescriptor[] {
  const blocks: BlockTypeDescriptor[] = [];
  for (const sourceFile of sourceFiles) {
    for (const shape of functionShapes(sourceFile)) {
      if (!BUILDER_RETURN.test(shape.returnText.trim())) continue;
      blocks.push({
        type: shape.name,
        import: { name: shape.name, module: BASE_MODULE },
        container: true,
        config: schemaFromTypeNode(shape.optionsType, index, new Set()),
        shapeSource: "inferred",
        controllerArg: shape.controllerArg,
      });
    }
  }
  return blocks;
}

/**
 * The registered id of every DataType class, read off the emitted decorator
 * call: the id lives in a decorator argument, which the declarations do not
 * carry.
 *
 * The module holding `RegisterDataType` is matched by shape rather than by
 * name. TypeScript names the require binding after the specifier it came from,
 * so moving the decorator one file sideways renames it -- and a pattern pinned
 * to yesterday's name matches nothing, which reads as "this DMS registers no
 * DataTypes" rather than as a broken scrape.
 */
function readDataTypeIds(baseDir: string): Map<string, string> {
  const file = path.join(baseDir, "data-types/default-types.js");
  const source = fs.readFileSync(file, "utf8");
  const pattern =
    /(\w+) = __decorate\(\[\s*\(0, \w+\.RegisterDataType\)\("([^"]+)"\)/g;
  const ids = new Map<string, string>();
  for (const match of source.matchAll(pattern)) {
    ids.set(match[1], match[2]);
  }
  if (ids.size === 0 && source.includes("RegisterDataType")) {
    throw new Error(
      `${file} registers DataTypes in a shape this build does not recognise, so none could be read. The emitted decorator call has changed.`,
    );
  }
  return ids;
}

/**
 * Marks the options a DataType is handed a table's DataAPI class in — a
 * relation's `dataApiController`.
 *
 * Their type is the class's own parameter, `T`, and the text alone does not
 * say what `T` is: read as an object, the option was offered as JSON to type
 * in, for a value no one can write as JSON. The constraint on the parameter is
 * what says it is a table.
 */
function markControllerOptions(
  config: ConfigSchema,
  optionsType: TypeNode | undefined,
  controllers: Set<string>,
): ConfigSchema {
  if (!optionsType || !Node.isTypeLiteral(optionsType) || !controllers.size) {
    return config;
  }
  const marked: ConfigSchema = { ...config };
  for (const property of optionsType.getProperties()) {
    const text = property.getTypeNode()?.getText().trim() ?? "";
    if (controllers.has(text)) {
      marked[property.getName()] = {
        type: "unknown",
        optional: property.hasQuestionToken(),
        "x-controller": true,
      };
    }
  }
  return marked;
}

function discoverDataTypes(
  sourceFiles: SourceFile[],
  index: TypeIndex,
  baseDir: string,
): DataTypeDescriptor[] {
  const ids = readDataTypeIds(baseDir);
  const descriptors: DataTypeDescriptor[] = [];
  for (const sourceFile of sourceFiles) {
    const namespace = sourceFile.getModule(DATATYPE_ACCESSOR);
    if (!namespace) continue;
    for (const cls of namespace.getClasses()) {
      const id = ids.get(cls.getName() ?? "");
      if (!id) continue;
      const optionsProp = cls.getProperty("options");
      const optionsType =
        optionsProp && Node.isPropertyDeclaration(optionsProp)
          ? optionsProp.getTypeNode()
          : undefined;
      descriptors.push({
        id,
        import: {
          name: `${DATATYPE_ACCESSOR}.${cls.getName()}`,
          module: DATATYPE_MODULE,
        },
        config: markControllerOptions(
          schemaFromTypeNode(optionsType, index, new Set()),
          optionsType,
          controllerParams(cls.getTypeParameters()),
        ),
      });
    }
  }
  return descriptors;
}

interface BaseSources {
  sourceFiles: SourceFile[];
  index: TypeIndex;
  baseDir: string;
}

let sources: BaseSources | undefined;

function loadSources(): BaseSources {
  if (!sources) {
    const baseDir = resolveDmsBaseDir();
    const sourceFiles = loadBaseProject(baseDir);
    sources = { sourceFiles, index: collectTypes(sourceFiles), baseDir };
  }
  return sources;
}

/** Block factories read off the `dms-base` type declarations. */
export function inferBlocks(): BlockTypeDescriptor[] {
  const loaded = loadSources();
  return discoverBlocks(loaded.sourceFiles, loaded.index);
}

/** DataTypes read off the `dms-base` type declarations and registrations. */
export function inferDataTypes(): DataTypeDescriptor[] {
  const loaded = loadSources();
  return discoverDataTypes(loaded.sourceFiles, loaded.index, loaded.baseDir);
}

export function invalidateInference(): void {
  sources = undefined;
}
