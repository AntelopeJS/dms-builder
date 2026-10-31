import path from "node:path";
import type {
  BuilderError,
  FileChange,
  MapResourcesInput,
  MappedResult,
  OpResult,
  OpWarning,
} from "@antelopejs/interface-dms-builder";
import type { TabConfig } from "./column-display";
import { getStringProperty } from "./literals";
import type { MappingPlan, PlannedResource } from "./map-resources-plan";
import { addBlock, configureBlock } from "./ops";
import { configurePage, createPage } from "./ops-blocks";
import { createCategory } from "./ops-categories";
import { deletePage } from "./page-delete";
import { joinSlug } from "./scan";
import { findCategoryRecord, findPageRecord } from "./source-index";

/** The name of the TableView block a mapped relation's page holds. */
export const TABLE_BLOCK = "table";

/** A refusal in words, for a warning a person reads. */
function errorText(error: BuilderError): string {
  switch (error.code) {
    case "invalid_config":
      return error.issues.map((issue) => issue.message).join("; ");
    case "typecheck_failed":
      return `the page would not typecheck (${error.diagnostics.map((item) => item.message).join("; ")})`;
    case "unsupported":
      return error.detail;
    case "not_found":
      return `${error.ref} was not found`;
    case "duplicate_name":
      return `the name ${error.name} is taken in its ${error.scope}`;
    case "stale":
      return `${error.ref} changed on disk since it was read`;
    case "referential_integrity":
      return `still used by ${error.blockedBy.join(", ")}`;
    default:
      return error.code.replace(/_/g, " ");
  }
}

type TableConfig = {
  caption: string;
  labelKey?: string;
  tabs?: TabConfig[] | undefined;
};

/**
 * The table block's caption and, when the relation has them, the label its rows are named by and
 * its tabs. A relation without tabs leaves the `tabs` a page holds as they are.
 */
function tableConfig(resource: PlannedResource): TableConfig {
  const config: TableConfig = { caption: resource.displayName };
  if (resource.label) {
    config.labelKey = resource.label;
  }
  if (resource.tabs) {
    config.tabs = resource.tabs;
  }
  return config;
}

function pageName(resource: PlannedResource): string {
  return path
    .relative(path.dirname(path.dirname(resource.folder)), resource.folder)
    .split(path.sep)
    .join("-");
}

/** The connection's category in the module, created the first time a TableView needs it. */
function ensureCategory(input: MapResourcesInput): OpResult<string> {
  const ref = `pages.${input.connection}`;
  if (findCategoryRecord(ref)) {
    return { ok: true, data: ref, changes: [] };
  }
  const created = createCategory({
    name: input.connection,
    displayName: input.connection.toUpperCase(),
    module: input.module,
  });
  return created.ok ? { ...created, data: created.data.ref } : created;
}

function addPage(
  input: MapResourcesInput,
  category: string,
  resource: PlannedResource,
): OpResult<string> {
  const page = createPage({
    name: pageName(resource),
    displayName: resource.displayName,
    category,
    module: input.module,
  });
  if (!page.ok) {
    return page;
  }
  const config = tableConfig(resource);
  const block = addBlock({
    page: page.data.ref,
    name: TABLE_BLOCK,
    type: "TableView",
    controller: resource.ref,
    config,
  });
  return block.ok
    ? {
        ok: true,
        data: page.data.ref,
        changes: [...page.changes, ...block.changes],
      }
    : block;
}

interface PagesWritten {
  changes: FileChange[];
  warnings: OpWarning[];
  category?: string;
}

function pageRefOf(category: string, resource: PlannedResource): string {
  const record = findCategoryRecord(category);
  return joinSlug(record?.fullSlug ?? "", pageName(resource));
}

/**
 * Whether the page's title is the one the builder wrote and the new choices change: a title
 * written any other way, a constant or a call, is the page's own and left as it is.
 */
function retitles(ref: string, resource: PlannedResource): boolean {
  const options = findPageRecord(ref)?.optionsNode;
  const title = options && getStringProperty(options, "displayName");
  return title !== undefined && title !== resource.displayName;
}

/**
 * A remapped TableView keeps its page, with the caption and label the new choices give its table
 * and, when they change it, the title. Its tabs follow the choices when they set tabs, or turn
 * the ones the mapping wrote off; tabs left out keep the page's.
 */
function updatePage(ref: string, resource: PlannedResource): OpResult<string> {
  const patch = tableConfig(resource);
  if (resource.clearTabs) {
    patch.tabs = undefined;
  }
  const configured = configureBlock(`${ref}#${TABLE_BLOCK}`, patch);
  if (!configured.ok || !retitles(ref, resource)) {
    return configured.ok ? { ...configured, data: ref } : configured;
  }
  const renamed = configurePage(ref, { displayName: resource.displayName });
  if (!renamed.ok) {
    return {
      ok: true,
      data: ref,
      changes: configured.changes,
      warnings: [
        {
          code: "page_not_written",
          message: `${resource.relation}: the title stays as it was: ${errorText(renamed.error)}`,
        },
      ],
    };
  }
  return {
    ok: true,
    data: ref,
    changes: [...configured.changes, ...renamed.changes],
  };
}

/** The page a relation's choices call for: created, updated, or removed when it lost its TableView. */
function syncPage(
  input: MapResourcesInput,
  category: string,
  resource: PlannedResource,
): OpResult<string | undefined> {
  const ref = pageRefOf(category, resource);
  const existing = findPageRecord(ref);
  if (!resource.tableView) {
    if (!existing) {
      return { ok: true, data: undefined, changes: [] };
    }
    const removed = deletePage(ref);
    return removed.ok ? { ...removed, data: undefined } : removed;
  }
  return existing
    ? updatePage(ref, resource)
    : addPage(input, category, resource);
}

export function writePages(
  input: MapResourcesInput,
  plan: MappingPlan,
  mapped: MappedResult[],
): PagesWritten {
  const written: PagesWritten = { changes: [], warnings: [] };
  const category = `pages.${input.connection}`;
  const needsCategory = plan.resources.some((resource) => resource.tableView);
  if (!needsCategory && !findCategoryRecord(category)) {
    return written;
  }
  const ensured = ensureCategory(input);
  if (!ensured.ok) {
    written.warnings.push({
      code: "page_not_written",
      message: JSON.stringify(ensured.error),
    });
    return written;
  }
  written.changes.push(...ensured.changes);
  written.category = ensured.data;
  for (const resource of plan.resources) {
    const page = syncPage(input, ensured.data, resource);
    if (!page.ok) {
      written.warnings.push({
        code: "page_not_written",
        message: `${resource.relation}: ${JSON.stringify(page.error)}`,
      });
      continue;
    }
    written.changes.push(...page.changes);
    written.warnings.push(...(page.warnings ?? []));
    const entry = mapped.find(
      (candidate) => candidate.relation === resource.relation,
    );
    if (entry && page.data) {
      entry.page = page.data;
    }
  }
  return written;
}
