import type { BlockPath, CategoryRef, PageRef } from "./addressing";
import type { QueryStructure } from "./queries";
import type { ResourceRef } from "./resources";

/**
 * A page's permission, mirroring the DMS `MenuOptions.permission`: a partial
 * permission spec — `id`, `title`, `icon`, `description`, `dependencies`,
 * `defaultGranted`. The DMS also accepts an `Action` there, which is a live
 * object rather than data and so has no encoding here; a page declaring one
 * reads its permission back as `undefined`.
 */
export type PagePermission = Record<string, unknown>;

/** Page metadata the builder can read. */
export interface PageMeta {
  ref: PageRef;
  id: string;
  displayName: string;
  icon?: string;
  category: CategoryRef;
  order?: number;
  description?: string;
  hidden?: boolean;
  permission?: PagePermission;
  /** Resolved by the builder's source index, NOT the runtime registry. */
  filepath: string;
}

/** The page metadata fields `ConfigurePage` may patch. */
export interface EditablePageMeta {
  displayName: string;
  icon?: string;
  category: CategoryRef;
  order?: number;
  description?: string;
  hidden?: boolean;
  permission?: PagePermission;
}

/** A single block in a page's tree. */
export interface BlockNode {
  path: BlockPath;
  /** Static key (top-level) or `.child()` id (nested). */
  name: string;
  /** Factory name; null if unresolved. */
  type: string | null;
  /** False = opaque / non-canonical. */
  editable: boolean;
  /** Set when `editable === false`. */
  opaqueReason?: string;
  slot?: string;
  /**
   * The child metadata beyond `slot`, as declared in the third argument of
   * `.child()` — `{ colSpan: 2 }` on a grid child, for instance. Nested blocks
   * only; the catalog describes the accepted shape as `childMeta`.
   */
  meta?: Record<string, unknown>;
  /** Present only when editable. */
  config?: Record<string, unknown>;
  /**
   * Controller-leading blocks (e.g. `TableView`): the resource ref of the leading
   * DataAPI class argument, when it resolves to a known generated resource.
   */
  controller?: ResourceRef;
  /** Containers only, in `.child()` order. */
  children?: BlockNode[];
}

/** A page's full structure. `version` is a content hash. */
export interface PageStructure {
  page: PageMeta;
  blocks: BlockNode[];
  /** The query routes declared on the page, found by shape. */
  queries: QueryStructure[];
  version: string;
}

/** A lightweight page listing entry. */
export interface PageSummary {
  ref: PageRef;
  id: string;
  displayName: string;
  category: CategoryRef;
  moduleId?: string;
  filepath: string;
  /** The icon the menu shows beside the page. */
  icon?: string;
  /** Sorts the page among the others of its category. */
  order?: number;
  /** Whether the menu leaves the page out; its route still answers. */
  hidden?: boolean;
}

/** A lightweight category listing entry. */
export interface CategorySummary {
  ref: CategoryRef;
  displayName: string;
  parent?: CategoryRef;
}

/** The category metadata fields `ConfigureCategory` may patch. */
export interface EditableCategoryMeta {
  displayName: string;
  parent?: CategoryRef;
  icon?: string;
  order?: number;
}
