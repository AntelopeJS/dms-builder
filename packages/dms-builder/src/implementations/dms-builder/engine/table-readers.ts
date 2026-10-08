import { Schema } from "@antelopejs/interface-database";
import type { BlockNode } from "@antelopejs/interface-dms-builder";
import { buildPageBlocks } from "./block-tree";
import { isPerTenantSchema } from "./query-emit";
import { routeModelBinding, findQueryRoutes } from "./query-structure";
import { listResourceRecords } from "./resource-index";
import { listPageRecords } from "./source-index";

/** A page that reads a table, and how many of its blocks and sources do. */
export interface TableReader {
  page: string;
  displayName: string;
  /** The blocks bound to the table, or pointing at its API. */
  blocks: number;
  /** The data sources of the page measuring the table. */
  queries: number;
}

function stringsIn(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    found.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      stringsIn(entry, found);
    }
  } else if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      stringsIn(entry, found);
    }
  }
  return found;
}

function walk(blocks: BlockNode[], visit: (block: BlockNode) => void): void {
  for (const block of blocks) {
    visit(block);
    walk(block.children ?? [], visit);
  }
}

/**
 * Every page reading each table, by the table's ref: what a change to a table
 * reaches, said before it is made — "orders · 3 pages".
 *
 * A page reads a table through a block bound to it, a block pointing at its
 * API (a form submitting to it, a list fetching from it), or a data source
 * measuring it. Pages the scan cannot read are left out rather than guessed.
 */
export function tableReaders(): Record<string, TableReader[]> {
  const resources = listResourceRecords();
  const readers: Record<string, Map<string, TableReader>> = {};
  const count = (
    table: string,
    page: { ref: string; displayName: string },
    kind: "blocks" | "queries",
  ): void => {
    const pages = (readers[table] ??= new Map());
    const entry = pages.get(page.ref) ?? {
      page: page.ref,
      displayName: page.displayName,
      blocks: 0,
      queries: 0,
    };
    entry[kind] += 1;
    pages.set(page.ref, entry);
  };
  for (const record of listPageRecords()) {
    let blocks: BlockNode[] = [];
    try {
      blocks = buildPageBlocks(record);
    } catch {
      continue;
    }
    walk(blocks, (block) => {
      if (block.controller) {
        count(block.controller, record, "blocks");
        return;
      }
      const urls = stringsIn(block.config);
      const read = resources.find((resource) =>
        urls.some(
          (url) =>
            url === resource.route || url.startsWith(`${resource.route}/`),
        ),
      );
      if (read) {
        count(read.ref, record, "blocks");
      }
    });
    for (const route of findQueryRoutes(record.classNode)) {
      const binding = routeModelBinding(route.method);
      if (binding) {
        count(binding.resource, record, "queries");
      }
    }
  }
  return Object.fromEntries(
    Object.entries(readers).map(([table, pages]) => [
      table,
      [...pages.values()],
    ]),
  );
}

/** The count a table stream answers, awaited the way any query is. */
interface CountableTable {
  count(): PromiseLike<unknown>;
}

/**
 * How many rows each table holds, by its ref, read at the request's tenant for
 * a per-tenant schema. A table the database cannot be asked about — no schema
 * registered, no connection — is left out, never counted as empty.
 */
export async function tableRowCounts(
  tenant: string | undefined,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const record of listResourceRecords()) {
    const schema = Schema.get(record.schema);
    if (!schema) {
      continue;
    }
    try {
      const instance =
        tenant && isPerTenantSchema(record.schema)
          ? schema.instance(tenant)
          : schema.instance();
      const table: unknown = instance.table(record.tableName);
      const rows = await (table as CountableTable).count();
      if (typeof rows === "number") {
        counts[record.ref] = rows;
      }
    } catch {
      // Unreadable is not empty: the list simply says nothing about it.
    }
  }
  return counts;
}

/** What deleting a page takes with it, and what it leaves pointing nowhere. */
export interface PageImpact {
  /** How many blocks the page holds. */
  blocks: number;
  /** The data sources the page declares, which go with it. */
  queries: string[];
  /** The pages with a block pointing at its address. */
  linkedFrom: Array<{ page: string; displayName: string }>;
}

function countBlocks(blocks: BlockNode[]): number {
  let count = 0;
  walk(blocks, () => {
    count += 1;
  });
  return count;
}

/**
 * What a page's deletion reaches, said before it is asked: its blocks and data
 * sources go with it, and the links other pages hold to it are left pointing
 * at an address nothing answers. Undefined for a page the scan does not know.
 */
export function pageImpact(ref: string): PageImpact | undefined {
  const pages = listPageRecords();
  const page = pages.find((record) => record.ref === ref);
  if (!page) {
    return undefined;
  }
  let blocks = 0;
  try {
    blocks = countBlocks(buildPageBlocks(page));
  } catch {
    // A page the scan cannot read still goes; its count goes unsaid.
  }
  const queries = findQueryRoutes(page.classNode).map((route) => route.name);
  const points = (url: string): boolean =>
    url === ref ||
    [`${ref}/`, `${ref}?`, `${ref}#`].some((start) => url.startsWith(start));
  const linkedFrom: PageImpact["linkedFrom"] = [];
  for (const other of pages) {
    if (other.ref === ref) {
      continue;
    }
    let found = false;
    try {
      walk(buildPageBlocks(other), (block) => {
        found ||= stringsIn(block.config).some(points);
      });
    } catch {
      continue;
    }
    if (found) {
      linkedFrom.push({ page: other.ref, displayName: other.displayName });
    }
  }
  return { blocks, queries, linkedFrom };
}
