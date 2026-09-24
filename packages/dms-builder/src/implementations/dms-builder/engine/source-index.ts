import type {
  CategorySummary,
  PageSummary,
} from "@antelopejs/interface-dms-builder";
import { createProject, resolveProjectRoot } from "./project";
import {
  type CategoryRecord,
  type PageRecord,
  type ScanResult,
  scanProject,
} from "./scan";

let cached: ScanResult | undefined;

function getSourceIndex(): ScanResult {
  if (!cached) {
    cached = scanProject(createProject(resolveProjectRoot()));
  }
  return cached;
}

export function invalidateSourceIndex(): void {
  cached = undefined;
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
