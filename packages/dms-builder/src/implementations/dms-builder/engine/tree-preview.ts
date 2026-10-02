// Running a draft's tree against the real tables, so the canvas shows the
// branches a tree will have before anything is written.
//
// The nodes come from the DMS's own helper, the one the route will call, handed
// the same levels over the same tables: a preview and the saved page cannot
// disagree about what the tree holds.

import { Schema } from "@antelopejs/interface-database";
import type {
  AddTreeInput,
  OpResult,
  TreePreview,
  TreePreviewRequest,
} from "@antelopejs/interface-dms-builder";
import { invalidConfig, unsupported } from "./ops";
import { RESPONSE_MODULE } from "./query-emit";
import { previewInstance } from "./query-preview";
import { TREE_HELPER } from "./tree-constants";
import { compileTree } from "./tree-emit";

type TreeHelper = (
  source: { levels: Array<Record<string, unknown>>; lazy?: boolean },
  request: { url?: string; branch?: string },
) => Promise<TreePreview>;

/**
 * The helper the route will call, from the DMS this app runs. Resolved at call
 * time: a DMS older than the helper cannot save such a route either, and the
 * preview says so rather than answering nodes the page never would.
 */
function treeHelper(): TreeHelper | undefined {
  try {
    const published = require(RESPONSE_MODULE) as Record<string, unknown>;
    const helper = published[TREE_HELPER];
    return typeof helper === "function" ? (helper as TreeHelper) : undefined;
  } catch {
    return undefined;
  }
}

function openTable(
  schemaId: string,
  tableName: string,
  tenant: string | undefined,
): unknown {
  const schema = Schema.get(schemaId);
  if (!schema) {
    return undefined;
  }
  const instance = tenant ? schema.instance(tenant) : schema.instance();
  return instance.table(tableName);
}

/** The parameters a GET of the tree preview carries the tree and its branch in. */
export const TREE_PREVIEW_PARAMETER = "tree";
const BRANCH_PARAMETER = "branch";

/**
 * A preview asked for by address, the way a tree on the canvas reads it: the
 * tree as JSON, and the branch its items ask for. The address a branch is asked
 * for at is this one, the branch left out, so each one opens here too.
 */
export function treePreviewRequestFromUrl(
  url: URL,
  tenant: string | undefined,
): OpResult<TreePreviewRequest> {
  const encoded = url.searchParams.get(TREE_PREVIEW_PARAMETER);
  let tree: unknown;
  try {
    tree = encoded ? JSON.parse(encoded) : undefined;
  } catch {
    tree = undefined;
  }
  const input = tree as Partial<AddTreeInput> | undefined;
  if (
    typeof input !== "object" ||
    input === null ||
    !Array.isArray(input.levels)
  ) {
    return invalidConfig<TreePreviewRequest>(
      `"${TREE_PREVIEW_PARAMETER}" must be a tree as JSON, listing its levels`,
    );
  }
  const own = new URLSearchParams(url.searchParams);
  own.delete(BRANCH_PARAMETER);
  return {
    ok: true,
    data: {
      tree: { name: "preview", ...input } as AddTreeInput,
      branch: url.searchParams.get(BRANCH_PARAMETER) ?? undefined,
      url: `${url.pathname}?${own.toString()}`,
      tenant,
    },
    changes: [],
  };
}

/** Run a tree that has not been written, and answer the nodes its route would. */
export async function runTreePreview(
  request: TreePreviewRequest,
): Promise<OpResult<TreePreview>> {
  const tree = compileTree(request.tree);
  if ("ok" in tree) {
    return tree;
  }
  const helper = treeHelper();
  if (!helper) {
    return unsupported<TreePreview>(
      `this DMS does not publish "${TREE_HELPER}", so a tree read from tables cannot be shown; update @antelopejs/interface-dms`,
    );
  }
  const tables = new Map<string, unknown>();
  for (const model of tree.models) {
    const { schema, tableName } = model.record;
    const table = openTable(
      schema,
      tableName,
      previewInstance(schema, request.tenant),
    );
    if (!table) {
      return unsupported<TreePreview>(
        `schema "${schema}" is not registered, so there is no table to read`,
      );
    }
    tables.set(model.resource, table);
  }
  const levels = tree.levels.map(({ resource, ...level }) => ({
    ...level,
    table: tables.get(resource),
  }));
  try {
    const nodes = await helper(
      tree.lazy ? { levels, lazy: true } : { levels },
      { url: request.url, branch: request.branch },
    );
    return { ok: true, data: nodes, changes: [] };
  } catch (error) {
    return invalidConfig<TreePreview>(
      error instanceof Error ? error.message : String(error),
    );
  }
}
