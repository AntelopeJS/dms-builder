import fs from "node:fs";
import type { InterfaceConnection } from "@antelopejs/interface-core";
import {
  Node,
  type ObjectLiteralExpression,
  Project,
  SyntaxKind,
} from "ts-morph";
import { configObject, findConfigFile, propertyNamed } from "./modules";
import { ownConnections } from "./own-connections";
import { existingOverrides } from "./project-config";

const DMS_INTERFACE = "@antelopejs/interface-dms";
const DATABASE_INTERFACE = "@antelopejs/interface-database";
const DEFAULT_PRIORITY = 0;

/**
 * The `interface-database` pin the DMS module needs once a module that uses it pins another
 * database: core passes that pin on to the DMS, which would then be reached with two bindings.
 */
export interface DatabasePin {
  module: string;
  provider: string;
}

type ConnectionLookup = (interfaceId: string) => InterfaceConnection[];

function providerOf(connections: InterfaceConnection[]): string | undefined {
  const connection =
    connections.find((candidate) => candidate.selected) ?? connections[0];
  return connection?.provider;
}

function priorityValue(node: Node | undefined): number {
  if (Node.isNumericLiteral(node)) {
    return node.getLiteralValue();
  }
  if (
    Node.isPrefixUnaryExpression(node) &&
    node.getOperatorToken() === SyntaxKind.MinusToken &&
    Node.isNumericLiteral(node.getOperand())
  ) {
    return -Number(node.getOperand().getText());
  }
  return DEFAULT_PRIORITY;
}

function moduleEntry(
  modules: ObjectLiteralExpression,
  id: string,
): ObjectLiteralExpression | undefined {
  const entry = propertyNamed(modules, id);
  return Node.isObjectLiteralExpression(entry) ? entry : undefined;
}

function databasePriority(entry: ObjectLiteralExpression | undefined): number {
  const priorities = entry && propertyNamed(entry, "exportPriority");
  return Node.isObjectLiteralExpression(priorities)
    ? priorityValue(propertyNamed(priorities, DATABASE_INTERFACE))
    : DEFAULT_PRIORITY;
}

/** Core's default provider: the highest `exportPriority`, the first id on a tie. */
function defaultProvider(
  modules: ObjectLiteralExpression,
  providers: string[],
): string | undefined {
  const ranked = providers
    .map((id) => ({ id, priority: databasePriority(moduleEntry(modules, id)) }))
    .sort(
      (left, right) =>
        right.priority - left.priority || left.id.localeCompare(right.id),
    );
  return ranked[0]?.id;
}

function pinsDatabase(entry: ObjectLiteralExpression): boolean {
  return existingOverrides(propertyNamed(entry, "importOverrides")).some(
    (override) => override.interface === DATABASE_INTERFACE,
  );
}

function configModules(): ObjectLiteralExpression | undefined {
  const configPath = findConfigFile();
  if (!configPath) {
    return undefined;
  }
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    configPath,
    fs.readFileSync(configPath, "utf8"),
  );
  const root = configObject(file);
  const modules = root && propertyNamed(root, "modules");
  return Node.isObjectLiteralExpression(modules) ? modules : undefined;
}

/**
 * The DMS module's pin to the project's default database, when it needs one: nothing when the
 * DMS already pins `interface-database`, provides it, or the project has no database of its own.
 */
export function dmsDatabasePin(
  lookup: ConnectionLookup = ownConnections,
): DatabasePin | undefined {
  const dms = providerOf(lookup(DMS_INTERFACE));
  const modules = configModules();
  const entry = dms && modules && moduleEntry(modules, dms);
  if (!dms || !modules || !entry || pinsDatabase(entry)) {
    return undefined;
  }
  const providers = lookup(DATABASE_INTERFACE)
    .map((connection) => connection.provider)
    .filter((provider): provider is string => provider !== undefined);
  if (providers.includes(dms)) {
    return undefined;
  }
  const provider = defaultProvider(modules, [...new Set(providers)]);
  return provider ? { module: dms, provider } : undefined;
}
