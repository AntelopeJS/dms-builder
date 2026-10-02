// What a tree's route is written with and read back by: shared by the writer,
// the reader and the preview, none of which may import another's machinery.

import type { TreePeriod } from "@antelopejs/interface-dms-builder";

/** The helper a tree's route hands its levels to. */
export const TREE_HELPER = "treeNodes";
/** What it answers, as the route declares it. */
export const TREE_NODE_TYPE = "TreeNode";
/** Where a lazy tree's route reads the branch asked for. */
export const TREE_BRANCH_PARAMETER = "branch";
/** The route's own request, which a lazy tree names its branches' address from. */
export const TREE_CONTEXT_PARAMETER = "context";

export const DEFAULT_TREE_PREFIX = "/tree/";

export const TREE_PERIODS: readonly TreePeriod[] = [
  "day",
  "month",
  "quarter",
  "year",
];

export const DATE_TYPES = new Set(["date"]);

/** The order a level's settings are written in, after its table. */
export const LEVEL_KEYS = [
  "by",
  "every",
  "label",
  "parent",
  "link",
  "icon",
] as const;
