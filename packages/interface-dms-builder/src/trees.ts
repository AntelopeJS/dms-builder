import { InterfaceFunction } from "@antelopejs/interface-core";
import type { ResourceRef } from "./resources";
import type { OpResult } from "./results";

/** The period an item grouping a date spans. */
export type TreePeriod = "day" | "month" | "quarter" | "year";

/**
 * One level of a tree read from tables: the table it reads, and how.
 *
 * A level with `by` groups the rows, one item per value; grouping levels come
 * first. Any other level lists rows named by `label`: the first one lists what
 * the groups above it hold, every one after it the rows of its table whose
 * `link` names the row above them. `parent` nests a level's rows under the row
 * of the same table they name.
 */
export interface TreeLevelInput {
  resource: ResourceRef;
  by?: string;
  every?: TreePeriod;
  label?: string[];
  parent?: string;
  link?: string;
  icon?: string;
}

/**
 * A tree a page serves from its tables, as a draft carries it: named after the
 * block reading it, like a query, and answered by one route the DMS fills in
 * from the levels.
 */
export interface AddTreeInput {
  /** A camelCase identifier. Names the route method. */
  name: string;
  levels: TreeLevelInput[];
  /** Answer one branch at a time, as it is opened. */
  lazy?: boolean;
  /**
   * The route path, relative to the page's slug. Defaults to
   * `/tree/<kebab-name>`.
   */
  endpoint?: string;
}

/**
 * A tree as read back off the page: the route answering it, and the levels it
 * hands the DMS. A route edited past what the builder writes still reports its
 * name and endpoint, so it can be seen and removed if not edited.
 */
export interface TreeStructure {
  name: string;
  endpoint: string;
  levels?: TreeLevelInput[];
  lazy?: boolean;
  /** True when the route is not one the builder can read back. */
  opaque?: boolean;
}

/** A tree that has not been written, run as its route would answer it. */
export interface TreePreviewRequest {
  tree: AddTreeInput;
  /** The branch asked for, as an item's address names it; none for the top. */
  branch?: string;
  /** Where the preview itself is read, so a branch is asked for there too. */
  url: string;
  /** The tenant whose rows to read, for tables in a per-tenant schema. */
  tenant?: string;
}

/**
 * The nodes a tree's route would answer, built by the DMS's own helper from the
 * project's tables. They travel as the JSON the route serves them as: the node
 * type belongs to `@antelopejs/interface-dms`, which this package does not
 * depend on.
 */
export type TreePreview = Record<string, unknown>[];

export const PreviewTree =
  InterfaceFunction<
    (request: TreePreviewRequest) => Promise<OpResult<TreePreview>>
  >();
