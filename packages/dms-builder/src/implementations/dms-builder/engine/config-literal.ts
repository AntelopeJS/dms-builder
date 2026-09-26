import {
  Node,
  type PropertyAssignment,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";
import { blockDescriptor, buildCatalog } from "./catalog";
import { findResourceBySymbol } from "./resource-index";

export interface LiteralResult {
  value: unknown;
  fullyLiteral: boolean;
  /**
   * The named constants the value was read from, each with where it sits in
   * it: a writer puts a name back at that place, never wherever the same value
   * happens to turn up.
   */
  constants?: NamedConstant[];
}

/** A value a `const` can hold that the writer can put back as its name. */
type ConstantValue = string | number | boolean | null;

/** A named constant a value was read from. */
export interface NamedConstant {
  /** The keys and indexes leading to it from the top of the value read. */
  path: (string | number)[];
  name: string;
  value: ConstantValue;
}

/** The constants of a value read inside another, placed within that other. */
function nestedConstants(
  inner: LiteralResult | undefined,
  ...keys: (string | number)[]
): NamedConstant[] {
  return (inner?.constants ?? []).map((constant) => ({
    ...constant,
    path: [...keys, ...constant.path],
  }));
}

function opaqueExpr(node: Node): LiteralResult {
  return { value: { $expr: node.getText() }, fullyLiteral: false };
}

function isLocallyDeclared(callee: Node): boolean {
  if (!Node.isIdentifier(callee)) {
    return false;
  }
  return callee
    .getDefinitionNodes()
    .some(
      (definition) =>
        definition.getSourceFile() === callee.getSourceFile() &&
        !Node.isImportSpecifier(definition) &&
        !Node.isImportClause(definition),
    );
}

/**
 * A DataType instantiation inside a config value — a Form field's `type`. Read
 * back as a `$dataType` sentinel so the value stays editable and re-emittable
 * rather than falling through to an opaque expression.
 */
function dataTypeCall(node: Node): LiteralResult | undefined {
  if (!Node.isNewExpression(node)) {
    return undefined;
  }
  const callee = node.getExpression().getText();
  const descriptor = buildCatalog().dataTypes.find(
    (candidate) => candidate.import.name === callee,
  );
  if (!descriptor) {
    return undefined;
  }
  const args = node.getArguments();
  // The emitter writes a DataType back as `new X(config)` and nothing else, so
  // a second argument would be dropped on the next write. Falling through to
  // an opaque expression keeps it.
  if (args.length > 1) {
    return undefined;
  }
  const arg = args[0];
  if (arg && !Node.isObjectLiteralExpression(arg)) {
    return undefined;
  }
  const config = arg ? objectLiteralToValue(arg) : undefined;
  const value: Record<string, unknown> = { $dataType: descriptor.id };
  if (config && Object.keys(config.value as object).length > 0) {
    value.config = config.value;
  }
  return {
    value,
    fullyLiteral: config ? config.fullyLiteral : true,
    constants: nestedConstants(config, "config"),
  };
}

/**
 * A nested factory call inside a config value — a ChartCard's `chart`. Read back
 * as a `$block` sentinel so the value stays editable rather than opaque.
 */
function blockCall(node: Node): LiteralResult | undefined {
  if (!Node.isCallExpression(node)) {
    return undefined;
  }
  const callee = node.getExpression();
  if (!Node.isIdentifier(callee) || !blockDescriptor(callee.getText())) {
    return undefined;
  }
  // A local declaration shadowing a catalog name is not that block: reading it
  // back as one would have the emitter import a factory the file never used.
  if (isLocallyDeclared(callee)) {
    return undefined;
  }
  const args = node.getArguments();
  if (args.length > 1) {
    return undefined;
  }
  const arg = args[0];
  if (arg && !Node.isObjectLiteralExpression(arg)) {
    return undefined;
  }
  const config = arg ? objectLiteralToValue(arg) : undefined;
  return {
    value: {
      $block: {
        type: callee.getText(),
        config: (config?.value as Record<string, unknown>) ?? {},
      },
    },
    fullyLiteral: config ? config.fullyLiteral : true,
    constants: nestedConstants(config, "$block", "config"),
  };
}

/**
 * A table's DataAPI class inside a config value — a relation field's
 * `dataApiController`. Read back as the `$ref` the builder writes it from, so
 * the table stays chosen in the panel rather than the whole block turning
 * opaque on its first save.
 */
function resourceRef(node: Node): LiteralResult | undefined {
  if (!Node.isIdentifier(node) || isLocallyDeclared(node)) {
    return undefined;
  }
  const found = findResourceBySymbol(node.getText());
  if (found?.as !== "dataApi") {
    return undefined;
  }
  return { value: { $ref: { resource: found.ref } }, fullyLiteral: true };
}

/**
 * The value of a `const` declared in the same file with a plain value —
 * `id: PERIOD_SCOPE` — or `undefined` for anything else.
 *
 * Only a plain value: an object held in a constant is one instance shared by
 * every reader, and writing it back as a copy would quietly split it. And only
 * the same file, so the name the writer puts back never depends on an import it
 * does not manage.
 */
function constantValue(node: Node): { value: ConstantValue } | undefined {
  if (!Node.isIdentifier(node)) {
    return undefined;
  }
  const definitions = node.getDefinitionNodes();
  const definition = definitions[0];
  if (
    definitions.length !== 1 ||
    !definition ||
    !Node.isVariableDeclaration(definition) ||
    definition.getSourceFile() !== node.getSourceFile() ||
    definition.getVariableStatement()?.getDeclarationKind() !==
      VariableDeclarationKind.Const
  ) {
    return undefined;
  }
  const initializer = literalToValue(definition.getInitializer());
  const { value } = initializer;
  if (
    !initializer.fullyLiteral ||
    value === undefined ||
    (typeof value === "object" && value !== null)
  ) {
    return undefined;
  }
  return { value: value as ConstantValue };
}

/**
 * A constant inside a config value, read as the value it holds, so one named
 * string does not lock the whole block. It is reported with its name, and the
 * page writer puts that back where it stood while the value there is unchanged.
 */
function constantRef(node: Node): LiteralResult | undefined {
  const constant = constantValue(node);
  if (!constant) {
    return undefined;
  }
  const { value } = constant;
  return {
    value,
    fullyLiteral: true,
    constants: [{ path: [], name: node.getText(), value }],
  };
}

function propertyName(prop: PropertyAssignment): string {
  const nameNode = prop.getNameNode();
  if (
    Node.isStringLiteral(nameNode) ||
    Node.isNoSubstitutionTemplateLiteral(nameNode)
  ) {
    return nameNode.getLiteralValue();
  }
  return prop.getName();
}

function literalToValue(node: Node | undefined): LiteralResult {
  if (!node) {
    return { value: undefined, fullyLiteral: true };
  }
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return { value: node.getLiteralValue(), fullyLiteral: true };
  }
  if (Node.isNumericLiteral(node)) {
    return { value: node.getLiteralValue(), fullyLiteral: true };
  }
  if (Node.isPrefixUnaryExpression(node)) {
    const operand = node.getOperand();
    const token = node.getOperatorToken();
    if (
      Node.isNumericLiteral(operand) &&
      (token === SyntaxKind.MinusToken || token === SyntaxKind.PlusToken)
    ) {
      const magnitude = operand.getLiteralValue();
      return {
        value: token === SyntaxKind.MinusToken ? -magnitude : magnitude,
        fullyLiteral: true,
      };
    }
  }
  if (Node.isTrueLiteral(node)) {
    return { value: true, fullyLiteral: true };
  }
  if (Node.isFalseLiteral(node)) {
    return { value: false, fullyLiteral: true };
  }
  if (node.getKind() === SyntaxKind.NullKeyword) {
    return { value: null, fullyLiteral: true };
  }
  if (Node.isObjectLiteralExpression(node)) {
    return objectLiteralToValue(node);
  }
  if (Node.isArrayLiteralExpression(node)) {
    return arrayLiteralToValue(node);
  }
  return (
    dataTypeCall(node) ??
    blockCall(node) ??
    resourceRef(node) ??
    constantRef(node) ??
    opaqueExpr(node)
  );
}

export function objectLiteralToValue(node: Node): LiteralResult {
  if (!Node.isObjectLiteralExpression(node)) {
    return opaqueExpr(node);
  }
  const result: Record<string, unknown> = {};
  const constants: NamedConstant[] = [];
  let fullyLiteral = true;
  for (const prop of node.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) {
      fullyLiteral = false;
      continue;
    }
    const key = propertyName(prop);
    const child = literalToValue(prop.getInitializer());
    result[key] = child.value;
    constants.push(...nestedConstants(child, key));
    fullyLiteral = fullyLiteral && child.fullyLiteral;
  }
  return { value: result, fullyLiteral, constants };
}

function arrayLiteralToValue(node: Node): LiteralResult {
  if (!Node.isArrayLiteralExpression(node)) {
    return opaqueExpr(node);
  }
  const items: unknown[] = [];
  const constants: NamedConstant[] = [];
  let fullyLiteral = true;
  for (const [index, element] of node.getElements().entries()) {
    const child = literalToValue(element);
    items.push(child.value);
    constants.push(...nestedConstants(child, index));
    fullyLiteral = fullyLiteral && child.fullyLiteral;
  }
  return { value: items, fullyLiteral, constants };
}
