import { InterfaceFunction } from "@antelopejs/interface-core";
import type { CategoryRef, PageRef } from "./addressing";
import type { ResourceRef } from "./resources";
import type { OpResult } from "./results";

/** The semantic tones of the dashboard, which a status pill and a tab are drawn in. */
export type DisplayTone =
  | "neutral"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "info";

/** One value of a badge column: the value the database holds, its label and the tone it is drawn in. */
export interface BadgeItem {
  value: string;
  label: string;
  tone: DisplayTone;
}

/**
 * How a column is drawn beyond its declaration. A `badge` is a string column of few values, drawn
 * as a status pill and filtered by a list of those values; a `price` is a number column drawn as an
 * amount, in the DataType's default currency.
 */
export type ColumnDisplay =
  | { kind: "badge"; items: BadgeItem[] }
  | { kind: "price" };

/** Tabs above a TableView: "All", then one tab per value of the column's badge. */
export interface TabsChoice {
  /** A column of the relation whose `display` is a badge, and which is `filterable`. */
  column: string;
}

/** One column of a mapped relation, as the integrator chose to show it. */
export interface MappedField {
  column: string;
  /** One of the column's `accepts`; the first when omitted. */
  declared?: string;
  label?: string;
  listable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  searchable?: boolean;
  /**
   * A badge needs a `string` declaration and a price a `number` one. Left out or null, the column
   * is plain: a mapping that does not send the display it read back loses it.
   */
  display?: ColumnDisplay | null;
  /**
   * `"schema.name"` of another mapped relation this column refers to, by that relation's
   * single-column key: the column becomes a relation column showing the target's `label`.
   */
  relation?: string;
}

/** One relation to map, as the integrator chose to show it. */
export interface MappedResource {
  /** `"schema.name"`. */
  relation: string;
  /** Defaults to the PascalCase singular of the relation's name. */
  className?: string;
  /** The column relation columns pointing here show, and the TableView's `labelKey`. */
  label?: string;
  /** The page's title and the TableView's caption; the relation's name, humanized, when omitted. */
  title?: string;
  /**
   * False maps the relation for stats only: its controller serves no route, so queries can name
   * it as a resource, and it gets no TableView or page. Forced false without a key.
   */
  tableView: boolean;
  /** False serves the TableView without new, edit and delete, every field read-only. */
  writable: boolean;
  /** The columns to declare; key columns are added when left out. */
  fields: MappedField[];
  /**
   * Tabs on the TableView's rows by a badge column. Written to the page's TableView when set, over
   * any `tabs` it holds; left out or null, a page already mapped keeps the tabs it has.
   */
  tabs?: TabsChoice | null;
}

/** A relation the integrator decided not to map, so an analysis does not propose it again. */
export interface ExcludedRelation {
  /** `"schema.name"`. */
  relation: string;
  reason: string;
}

/** Which relations of a connection to map, into which module of the project. */
export interface MapResourcesInput {
  /** The project module the tables are written into, bound to the connection's database. */
  module: string;
  /**
   * The id of the builder's catalog connection to the database, also used in routes and as the
   * pages' category.
   */
  connection: string;
  /** Relations to map, or to map again: a mapped relation is rewritten from the new choices. */
  resources: MappedResource[];
  /** Relations recorded as left out. Mapping one later removes it from the record. */
  excluded?: ExcludedRelation[];
}

/** A column a TableView does not show, and why. */
export interface LeftOutColumn {
  relation: string;
  column: string;
  reason: string;
}

/** What was written for one mapped relation. */
export interface MappedResult {
  relation: string;
  /** The resource queries name it by, TableView or not. */
  ref: ResourceRef;
  page?: PageRef;
  files: string[];
}

/** What `MapResources` wrote, and what it left off the TableViews. */
export interface MapResourcesResult {
  resources: MappedResult[];
  leftOut: LeftOutColumn[];
  /** The connection's category in the module, which the pages are in and stats pages go under. */
  category?: CategoryRef;
}

/**
 * Writes table classes, models, DataAPI controllers and TableView pages over relations of a
 * database the project does not own, into a module bound to it. Names are the database's own,
 * verbatim; `_id` is declared only where the relation has a key; nothing creates or alters a
 * table. The builder reads the relations' descriptions through its catalog connection, and
 * checks every choice in `input` against them.
 *
 * A relation already mapped is rewritten from the new choices: its table class and controller,
 * and its page, which is created, kept or removed as `tableView` says.
 */
export const MapResources =
  InterfaceFunction<
    (input: MapResourcesInput) => Promise<OpResult<MapResourcesResult>>
  >();
