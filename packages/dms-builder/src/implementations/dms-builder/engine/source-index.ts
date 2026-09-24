import type {
  CategorySummary,
  PageSummary,
} from "@antelopejs/interface-dms-builder";
import {
  createProject,
  resolveProjectRoot,
  sourcesChanged,
  stampSources,
} from "./project";
import {
  type CategoryRecord,
  type PageRecord,
  type ScanResult,
  scanProject,
} from "./scan";

let cached: ScanResult | undefined;
let stamps: Map<string, number> | undefined;

/**
 * The pages and categories of the app, as its files are right now.
 *
 * The scan is kept because parsing an app is not something to redo per lookup,
 * but it is dropped the moment a file it describes has been written by someone
 * other than the engine — an editor, a formatter, a `git checkout`. Holding on
 * to it through that would hand every reader a page that is no longer there,
 * and, worse, a `version` no write can ever match: a mutation re-reads the disk
 * before it checks, so a scan that does not would refuse every save as `stale`
 * against a file the builder itself was never shown.
 */
function getSourceIndex(): ScanResult {
  if (cached && stamps && !sourcesChanged(stamps)) {
    return cached;
  }
  const project = createProject(resolveProjectRoot());
  cached = scanProject(project);
  stamps = stampSources(project);
  return cached;
}

export function invalidateSourceIndex(): void {
  cached = undefined;
  stamps = undefined;
}

export function findPageRecord(ref: string): PageRecord | undefined {
  return getSourceIndex().pages.get(ref);
}

export function findCategoryRecord(ref: string): CategoryRecord | undefined {
  return getSourceIndex().categories.get(ref);
}

export function listPageRecords(): PageRecord[] {
  return Array.from(getSourceIndex().pages.values());
}

export function listCategoryRecords(): CategoryRecord[] {
  return Array.from(getSourceIndex().categories.values());
}

export function listPageSummaries(): PageSummary[] {
  return Array.from(getSourceIndex().pages.values()).map((page) => ({
    ref: page.ref,
    id: page.id,
    displayName: page.displayName,
    category: page.categoryRef,
    moduleId: page.moduleId,
    filepath: page.filepath,
  }));
}

export function listCategorySummaries(): CategorySummary[] {
  return Array.from(getSourceIndex().categories.values()).map((category) => ({
    ref: category.ref,
    displayName: category.displayName,
    parent: category.parentRef,
  }));
}
