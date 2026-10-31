import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import type { ColumnDisplay } from "@antelopejs/interface-dms-builder";
import { displayOfDataType, tabsOf } from "./column-display";
import { TABLE_BLOCK } from "./map-resources-pages";
import { buildPageStructure } from "./page-structure";
import type { ResourceRecord } from "./resource-index";
import { buildResourceStructure } from "./resource-structure";
import { type PageRecord, joinSlug } from "./scan";
import { findCategoryRecord, findPageRecord } from "./source-index";

const QUOTES = /^["']|["']$/g;

/** A property name as the code holds it, without the quotes a name that is not an identifier needs. */
export function propertyName(name: string): string {
  return name.replace(QUOTES, "");
}

/** The page of a mapped relation's TableView, when the connection's category holds it. */
export function pageOf(
  connection: string,
  record: ResourceRecord,
): PageRecord | undefined {
  const folder = path.dirname(record.databaseFile);
  const name = path
    .relative(path.dirname(path.dirname(folder)), folder)
    .split(path.sep)
    .join("-");
  const category = findCategoryRecord(`pages.${connection}`);
  return category && findPageRecord(joinSlug(category.fullSlug, name));
}

/** The display each column of a mapped relation's controller is drawn with, for the ones with one. */
export function currentDisplays(
  record: ResourceRecord,
): Map<string, ColumnDisplay> {
  const structure = buildResourceStructure(record.ref);
  const displays = new Map<string, ColumnDisplay>();
  for (const field of structure.ok ? structure.data.fields : []) {
    const display = displayOfDataType(field.dataType);
    if (display) {
      displays.set(propertyName(field.name), display);
    }
  }
  return displays;
}

/**
 * The column whose badge the tabs of the page's TableView were written from: tabs edited by hand
 * are not the mapping's, so no column is answered for them.
 */
export function tabsColumnOf(
  page: PageRecord | undefined,
  displays: ReadonlyMap<string, ColumnDisplay>,
): string | undefined {
  const structure = page && buildPageStructure(page.ref);
  const table = structure?.ok
    ? structure.data.blocks.find((block) => block.name === TABLE_BLOCK)
    : undefined;
  const stored = table?.config?.tabs;
  return [...displays].find(
    ([column, display]) =>
      display.kind === "badge" &&
      isDeepStrictEqual(stored, tabsOf(column, display)),
  )?.[0];
}
