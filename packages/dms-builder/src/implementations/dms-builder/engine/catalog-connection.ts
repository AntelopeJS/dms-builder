import {
  GetInterfaceInstances,
  GetResponsibleModule,
  type InterfaceConnection,
  RunWithResponsibleModule,
} from "@antelopejs/interface-core";
import type * as Catalog from "@antelopejs/interface-database-catalog";

const CATALOG_INTERFACE = "@antelopejs/interface-database-catalog";

/**
 * The module this file belongs to, read while the module evaluates it. A route handler runs in
 * the context of the module serving HTTP, so a lookup made there would answer that module's
 * connections, not this one's.
 */
const OWN_MODULE = GetResponsibleModule();

function catalogConnections(): InterfaceConnection[] {
  const lookup = () => GetInterfaceInstances(CATALOG_INTERFACE);
  return OWN_MODULE === undefined
    ? lookup()
    : RunWithResponsibleModule(OWN_MODULE, lookup);
}

/** The catalog functions of one connection, as its provider answers them. */
export type CatalogConnection = typeof Catalog;

type CatalogResolver = (id: string) => CatalogConnection | undefined;
type ConnectionLister = () => string[];

function declaredConnections(): string[] {
  return catalogConnections()
    .map((connection) => connection.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

function declaredCatalog(id: string): CatalogConnection | undefined {
  const connection = catalogConnections().find(
    (candidate) => candidate.id === id,
  );
  return connection
    ? (require(connection.path) as CatalogConnection)
    : undefined;
}

let listConnectionIds: ConnectionLister = declaredConnections;
let resolveCatalog: CatalogResolver = declaredCatalog;

/**
 * The catalog connections the project declares for dms-builder: `importOverrides` entries of
 * `@antelopejs/interface-database-catalog` with an id on the builder's module entry.
 */
export function listCatalogConnections(): string[] {
  return listConnectionIds();
}

/** The catalog of one of the builder's connections; nothing for an unknown one. */
export function catalogOf(id: string): CatalogConnection | undefined {
  return resolveCatalog(id);
}

/** Replaces the declared connections, for specs that run without a provider. */
export function setCatalogConnectionsForTests(
  catalogs?: Record<string, Partial<CatalogConnection>>,
): void {
  listConnectionIds = catalogs
    ? () => Object.keys(catalogs)
    : declaredConnections;
  resolveCatalog = catalogs
    ? (id) => catalogs[id] as CatalogConnection | undefined
    : declaredCatalog;
}
