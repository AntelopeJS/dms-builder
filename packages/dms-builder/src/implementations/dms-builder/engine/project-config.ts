import fs from "node:fs";
import type {
  CreateLocalModuleStep,
  ImportOverrideInput,
  ModuleEntryInput,
} from "@antelopejs/interface-dms-builder";
import {
  type ArrayLiteralExpression,
  Node,
  type ObjectLiteralExpression,
  Project,
  type PropertyAssignment,
  type SourceFile,
} from "ts-morph";
import { configObject, propertyKey } from "./modules";
import { indentationText, resolveProjectRoot } from "./project";
import { keyText, literalText } from "./project-config-text";
import { type Scaffold, scaffoldLocalModule } from "./project-scaffold";

export const ENV_OVERRIDES = "envOverrides";
export const MODULES = "modules";
export const IMPORT_OVERRIDES = "importOverrides";

/**
 * The configuration being edited, in memory until every step has been accepted. Edits are text
 * edits, after which every node is found again by its path from the configuration's root.
 */
export interface ConfigDraft {
  path: string;
  before: string;
  file: SourceFile;
  unit: string;
  scaffolds: Scaffold[];
  variables: string[];
  /** Files other than the configuration a step rewrites, with their content before. */
  edits: FileEdit[];
}

/** A file a step rewrites whole. */
export interface FileEdit {
  path: string;
  before: string;
  content: string;
}

/** A step the configuration cannot take, with the reason the caller is told. */
export class StepRefusal extends Error {}

export function refuse(message: string): never {
  throw new StepRefusal(message);
}

export function propertyNamed(
  owner: ObjectLiteralExpression,
  name: string,
): PropertyAssignment | undefined {
  return owner
    .getProperties()
    .filter(Node.isPropertyAssignment)
    .find((property) => propertyKey(property.getNameNode()) === name);
}

function plainObject(
  node: Node | undefined,
  name: string,
): ObjectLiteralExpression {
  if (
    !Node.isObjectLiteralExpression(node) ||
    node.getProperties().some(Node.isSpreadAssignment)
  ) {
    refuse(`"${name}" in the configuration is not a plain object literal`);
  }
  return node;
}

function rootObject(draft: ConfigDraft): ObjectLiteralExpression {
  return plainObject(configObject(draft.file), "export default");
}

/** The object literal at `path` from the configuration's root, or nothing when a key is absent. */
export function objectAt(
  draft: ConfigDraft,
  path: string[],
): ObjectLiteralExpression | undefined {
  let current = rootObject(draft);
  for (const key of path) {
    const property = propertyNamed(current, key);
    if (!property) {
      return undefined;
    }
    current = plainObject(property.getInitializer(), key);
  }
  return current;
}

/**
 * The indent unit the configuration itself uses: a tab when its lines are tab-indented, else its
 * smallest run of spaces. The file's own layout outranks the project's, which may say nothing.
 */
function configIndent(text: string): string | undefined {
  const indents = text
    .split("\n")
    .map((line) => /^([\t ]+)\S/.exec(line)?.[1])
    .filter((indent): indent is string => indent !== undefined);
  if (indents.length === 0) {
    return undefined;
  }
  if (indents.some((indent) => indent.startsWith("\t"))) {
    return "\t";
  }
  return " ".repeat(Math.min(...indents.map((indent) => indent.length)));
}

/** Opens the configuration for editing, refusing one the builder cannot edit safely. */
export function openDraft(configPath: string): ConfigDraft {
  const before = fs.readFileSync(configPath, "utf8");
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    configPath,
    before,
  );
  const draft: ConfigDraft = {
    path: configPath,
    before,
    file,
    unit: configIndent(before) ?? indentationText(resolveProjectRoot()),
    scaffolds: [],
    variables: [],
    edits: [],
  };
  if (!configObject(file)) {
    refuse("the configuration is not an exported defineConfig({ … }) literal");
  }
  if (!objectAt(draft, [MODULES])) {
    refuse("the configuration has no modules literal");
  }
  return draft;
}

function lineIndent(draft: ConfigDraft, node: Node): string {
  const text = draft.file.getFullText();
  const lineStart = text.lastIndexOf("\n", node.getStart() - 1) + 1;
  return /^[\t ]*/.exec(text.slice(lineStart))?.[0] ?? "";
}

export function replace(
  draft: ConfigDraft,
  start: number,
  end: number,
  text: string,
): void {
  draft.file.replaceText([start, end], text);
}

/** A literal written for a property line starting with `base`. */
function rebased(value: string, base: string): string {
  return value.replace(/\n/g, `\n${base}`);
}

/** The object rewritten over several lines, so a property can be added below the others. */
function expanded(
  draft: ConfigDraft,
  owner: ObjectLiteralExpression,
  extra: string,
): string {
  const base = lineIndent(draft, owner);
  const inner = base + draft.unit;
  const lines = [
    ...owner.getProperties().map((property) => property.getText()),
    extra,
  ];
  return `{\n${lines.map((line) => `${inner}${line},`).join("\n")}\n${base}}`;
}

function isMultiline(owner: ObjectLiteralExpression): boolean {
  return owner.getStartLineNumber() !== owner.getEndLineNumber();
}

/** Adds `key: value` as the last property of the object at `path`, in the file's own layout. */
function addProperty(
  draft: ConfigDraft,
  path: string[],
  key: string,
  value: string,
): void {
  const owner =
    objectAt(draft, path) ?? refuse(`could not find ${path.join(".")}`);
  const properties = owner.getProperties();
  if (properties.length === 0 || !isMultiline(owner)) {
    const inner = lineIndent(draft, owner) + draft.unit;
    const property = `${keyText(key)}: ${rebased(value, inner)}`;
    replace(
      draft,
      owner.getStart(),
      owner.getEnd(),
      expanded(draft, owner, property),
    );
    return;
  }
  const last = properties[properties.length - 1];
  const indent = lineIndent(draft, last);
  const following = /^\s*,/.exec(draft.file.getFullText().slice(last.getEnd()));
  const at = following ? last.getEnd() + following[0].length : last.getEnd();
  const lead = following ? "" : ",";
  replace(
    draft,
    at,
    at,
    `${lead}\n${indent}${keyText(key)}: ${rebased(value, indent)},`,
  );
}

/** Sets `key` on the object at `path`, replacing its value when present. */
export function setProperty(
  draft: ConfigDraft,
  path: string[],
  key: string,
  value: unknown,
): void {
  const owner =
    objectAt(draft, path) ?? refuse(`could not find ${path.join(".")}`);
  const existing = propertyNamed(owner, key);
  const literal = literalText(value, draft.unit);
  if (!existing) {
    addProperty(draft, path, key, literal);
    return;
  }
  const initializer = existing.getInitializerOrThrow();
  const text = rebased(literal, lineIndent(draft, existing));
  replace(draft, initializer.getStart(), initializer.getEnd(), text);
}

function ensureObject(draft: ConfigDraft, path: string[]): void {
  if (!objectAt(draft, path)) {
    setProperty(draft, path.slice(0, -1), path[path.length - 1], {});
  }
}

export function stringOf(node: Node | undefined): string | undefined {
  return Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
    ? node.getLiteralValue()
    : undefined;
}

function mergeValues(
  draft: ConfigDraft,
  path: string[],
  values: Record<string, unknown> | undefined,
): void {
  if (!values || Object.keys(values).length === 0) {
    return;
  }
  ensureObject(draft, path);
  for (const [key, value] of Object.entries(values)) {
    setProperty(draft, path, key, value);
  }
}

/** Names each variable in `envOverrides`, refusing one that already supplies another path. */
function bindVariables(
  draft: ConfigDraft,
  id: string,
  env: Record<string, string> | undefined,
): void {
  if (!env || Object.keys(env).length === 0) {
    return;
  }
  ensureObject(draft, [ENV_OVERRIDES]);
  for (const [configPath, variable] of Object.entries(env)) {
    const target = `${MODULES}.${id}.config.${configPath}`;
    const overrides =
      objectAt(draft, [ENV_OVERRIDES]) ??
      refuse("could not write envOverrides");
    const current = stringOf(
      propertyNamed(overrides, variable)?.getInitializer(),
    );
    if (current !== undefined && current !== target) {
      refuse(
        `${variable} already supplies ${current}; choose another variable for ${target}`,
      );
    }
    setProperty(draft, [ENV_OVERRIDES], variable, target);
    draft.variables.push(variable);
  }
}

/** The overrides a module already declares, from either spelling `importOverrides` takes. */
export function existingOverrides(
  initializer: Node | undefined,
): ImportOverrideInput[] {
  if (Node.isObjectLiteralExpression(initializer)) {
    return initializer
      .getProperties()
      .filter(Node.isPropertyAssignment)
      .map((property) => ({
        interface: propertyKey(property.getNameNode()),
        source: stringOf(property.getInitializer()),
      }));
  }
  return Node.isArrayLiteralExpression(initializer)
    ? overridesOfArray(initializer)
    : [];
}

function overridesOfArray(
  array: ArrayLiteralExpression,
): ImportOverrideInput[] {
  return array.getElements().map((element) => {
    const entry = plainObject(element, IMPORT_OVERRIDES);
    return {
      interface:
        stringOf(propertyNamed(entry, "interface")?.getInitializer()) ?? "",
      source: stringOf(propertyNamed(entry, "source")?.getInitializer()),
      id: stringOf(propertyNamed(entry, "id")?.getInitializer()),
    };
  });
}

function describeBinding(entry: ImportOverrideInput): string {
  return entry.id ? `${entry.interface} (${entry.id})` : entry.interface;
}

/** The overrides after adding `added`, refusing a pin or connection that contradicts one. */
function mergedOverrides(
  module: string,
  current: ImportOverrideInput[],
  added: ImportOverrideInput[],
): ImportOverrideInput[] {
  const merged = [...current];
  for (const entry of added) {
    const existing = merged.find(
      (candidate) =>
        candidate.interface === entry.interface && candidate.id === entry.id,
    );
    if (existing && existing.source !== entry.source) {
      refuse(
        `module "${module}" already binds ${describeBinding(entry)} to "${existing.source}", not "${entry.source}"`,
      );
    }
    if (!existing) {
      merged.push(entry);
    }
  }
  return merged;
}

/** The pins-only spelling when nothing needs more, the array spelling otherwise. */
export function overridesValue(
  entries: ImportOverrideInput[],
): Record<string, string | undefined> | ImportOverrideInput[] {
  if (
    entries.every(
      (entry) => entry.id === undefined && entry.source !== undefined,
    )
  ) {
    return Object.fromEntries(
      entries.map((entry) => [entry.interface, entry.source]),
    );
  }
  return entries.map((entry) => ({
    interface: entry.interface,
    source: entry.source,
    id: entry.id,
  }));
}

function mergeOverrides(
  draft: ConfigDraft,
  id: string,
  added: ImportOverrideInput[],
): void {
  if (added.length === 0) {
    return;
  }
  const entry =
    objectAt(draft, [MODULES, id]) ??
    refuse(`the project has no module "${id}"`);
  const current = existingOverrides(
    propertyNamed(entry, IMPORT_OVERRIDES)?.getInitializer(),
  );
  const merged = mergedOverrides(id, current, added);
  setProperty(draft, [MODULES, id], IMPORT_OVERRIDES, overridesValue(merged));
}

export function writeEntry(
  draft: ConfigDraft,
  id: string,
  entry: ModuleEntryInput,
): void {
  if (!objectAt(draft, [MODULES, id])) {
    refuse(`the project has no module "${id}"`);
  }
  if (entry.source) {
    setProperty(draft, [MODULES, id], "source", entry.source);
  }
  mergeValues(draft, [MODULES, id, "config"], entry.config);
  mergeOverrides(draft, id, entry.importOverrides ?? []);
  mergeValues(draft, [MODULES, id, "exportPriority"], entry.exportPriority);
  bindVariables(draft, id, entry.env);
}

export function addModule(
  draft: ConfigDraft,
  id: string,
  entry: ModuleEntryInput,
): void {
  const modules =
    objectAt(draft, [MODULES]) ??
    refuse("the configuration has no modules literal");
  if (propertyNamed(modules, id)) {
    refuse(`the project already has a module "${id}"`);
  }
  if (!entry.source) {
    refuse(`module "${id}" needs a source`);
  }
  setProperty(draft, [MODULES], id, {});
  writeEntry(draft, id, entry);
}

export function createLocalModule(
  draft: ConfigDraft,
  step: CreateLocalModuleStep,
): void {
  const scaffold = scaffoldLocalModule(step.id, step.path);
  draft.scaffolds.push(scaffold);
  addModule(draft, step.id, { ...step.entry, source: scaffold.source });
}

/** Each module entry of the configuration written as an object literal, by id. */
export function moduleEntries(
  draft: ConfigDraft,
): [string, ObjectLiteralExpression][] {
  const entries: [string, ObjectLiteralExpression][] = [];
  const modules = objectAt(draft, [MODULES]);
  for (const property of modules?.getProperties() ?? []) {
    if (!Node.isPropertyAssignment(property)) {
      continue;
    }
    const id = propertyKey(property.getNameNode());
    const entry = objectAt(draft, [MODULES, id]);
    if (entry) {
      entries.push([id, entry]);
    }
  }
  return entries;
}

/** The `importOverrides` a module entry declares. */
export function overridesOf(entry: ObjectLiteralExpression) {
  return existingOverrides(
    propertyNamed(entry, IMPORT_OVERRIDES)?.getInitializer(),
  );
}
