// Reading a page's trees back: the routes that hand their levels to the DMS's
// tree helper, found by what they are rather than where they sit.

import type {
  TreeLevelInput,
  TreePeriod,
  TreeStructure,
} from "@antelopejs/interface-dms-builder";
import {
  type ClassDeclaration,
  type Expression,
  type MethodDeclaration,
  Node,
  type ObjectLiteralExpression,
  SyntaxKind,
} from "ts-morph";
import { stringLiteralValue } from "./literals";
import { MODEL_DECORATORS } from "./query-structure";
import { findResourceBySymbol } from "./resource-index";
import { LEVEL_KEYS, TREE_HELPER, TREE_PERIODS } from "./tree-constants";

export interface TreeRoute {
  method: MethodDeclaration;
  name: string;
  endpoint: string;
  /** The helper's call, which holds everything the tree is. */
  call: Node;
}

/** What a route returns, once an `await` is seen through. */
function returned(method: MethodDeclaration): Expression | undefined {
  const statements = method
    .getBody()
    ?.asKind(SyntaxKind.Block)
    ?.getStatements();
  if (statements?.length !== 1) {
    return undefined;
  }
  const value = statements[0]
    ?.asKind(SyntaxKind.ReturnStatement)
    ?.getExpression();
  return value && Node.isAwaitExpression(value) ? value.getExpression() : value;
}

/** The helper's call a route returns, if that is all it does. */
function helperCall(method: MethodDeclaration): Node | undefined {
  const value = returned(method);
  if (!value || !Node.isCallExpression(value)) {
    return undefined;
  }
  return value.getExpression().getText() === TREE_HELPER ? value : undefined;
}

/** Every route on the page answering a tree from its tables. */
export function findTreeRoutes(pageClass: ClassDeclaration): TreeRoute[] {
  const routes: TreeRoute[] = [];
  for (const method of pageClass.getMethods()) {
    const endpoint = stringLiteralValue(
      method.getDecorator("Get")?.getCallExpression()?.getArguments()[0],
    );
    const call = endpoint === undefined ? undefined : helperCall(method);
    if (endpoint !== undefined && call) {
      routes.push({ method, name: method.getName(), endpoint, call });
    }
  }
  return routes;
}

export function findTreeRoute(
  pageClass: ClassDeclaration,
  name: string,
): TreeRoute | undefined {
  return findTreeRoutes(pageClass).find((route) => route.name === name);
}

/** The table each of the route's model parameters holds, by parameter name. */
function injectedTables(method: MethodDeclaration): Map<string, string> {
  const tables = new Map<string, string>();
  for (const parameter of method.getParameters()) {
    const decorator = MODEL_DECORATORS.map((name) =>
      parameter.getDecorator(name),
    ).find(Boolean);
    const model = decorator?.getCallExpression()?.getArguments()[0]?.getText();
    const found = model ? findResourceBySymbol(model) : undefined;
    if (found?.as === "model") {
      tables.set(parameter.getName(), found.ref);
    }
  }
  return tables;
}

function property(
  object: ObjectLiteralExpression,
  name: string,
): Node | undefined {
  return object
    .getProperty(name)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer();
}

/** The names of an object literal's properties, or nothing when one is not plain. */
function propertyNames(object: ObjectLiteralExpression): string[] | undefined {
  const names: string[] = [];
  for (const entry of object.getProperties()) {
    if (!Node.isPropertyAssignment(entry)) {
      return undefined;
    }
    names.push(entry.getName());
  }
  return names;
}

function stringList(node: Node | undefined): string[] | undefined {
  if (!node || !Node.isArrayLiteralExpression(node)) {
    return undefined;
  }
  const values = node
    .getElements()
    .map((element) => stringLiteralValue(element));
  return values.every((value) => value !== undefined)
    ? (values as string[])
    : undefined;
}

/** One level as written: `{ table: model.table, by: "status", … }`. */
function readLevel(
  node: Node,
  tables: Map<string, string>,
): TreeLevelInput | undefined {
  if (!Node.isObjectLiteralExpression(node)) {
    return undefined;
  }
  const names = propertyNames(node);
  const allowed = new Set<string>(["table", ...LEVEL_KEYS]);
  if (!names || names.some((name) => !allowed.has(name))) {
    return undefined;
  }
  const table = property(node, "table");
  if (
    !table ||
    !Node.isPropertyAccessExpression(table) ||
    table.getName() !== "table"
  ) {
    return undefined;
  }
  const resource = tables.get(table.getExpression().getText());
  if (!resource) {
    return undefined;
  }
  const level: TreeLevelInput = { resource };
  for (const key of ["by", "parent", "link", "icon"] as const) {
    const value = property(node, key);
    if (value) {
      const text = stringLiteralValue(value);
      if (text === undefined) {
        return undefined;
      }
      level[key] = text;
    }
  }
  const every = property(node, "every");
  if (every) {
    const period = stringLiteralValue(every);
    if (!period || !TREE_PERIODS.includes(period as TreePeriod)) {
      return undefined;
    }
    level.every = period as TreePeriod;
  }
  const label = property(node, "label");
  if (label) {
    const fields = stringList(label);
    if (!fields) {
      return undefined;
    }
    level.label = fields;
  }
  return level;
}

/** The levels and laziness a helper's first argument hands it, if they read. */
function readSource(
  node: Node | undefined,
  tables: Map<string, string>,
): Pick<TreeStructure, "levels" | "lazy"> | undefined {
  if (!node || !Node.isObjectLiteralExpression(node)) {
    return undefined;
  }
  const names = propertyNames(node);
  if (!names || names.some((name) => name !== "levels" && name !== "lazy")) {
    return undefined;
  }
  const list = property(node, "levels");
  if (!list || !Node.isArrayLiteralExpression(list)) {
    return undefined;
  }
  const levels: TreeLevelInput[] = [];
  for (const element of list.getElements()) {
    const level = readLevel(element, tables);
    if (!level) {
      return undefined;
    }
    levels.push(level);
  }
  const lazy = property(node, "lazy");
  if (lazy && lazy.getKind() !== SyntaxKind.TrueKeyword) {
    return undefined;
  }
  return lazy ? { levels, lazy: true } : { levels };
}

export function buildTreeStructure(route: TreeRoute): TreeStructure {
  const base: TreeStructure = { name: route.name, endpoint: route.endpoint };
  const call = route.call.asKind(SyntaxKind.CallExpression);
  const read = readSource(
    call?.getArguments()[0],
    injectedTables(route.method),
  );
  return read ? { ...base, ...read } : { ...base, opaque: true };
}

export function buildTreeStructures(
  pageClass: ClassDeclaration,
): TreeStructure[] {
  return findTreeRoutes(pageClass).map((route) => buildTreeStructure(route));
}
