import { InterfaceFunction } from "@antelopejs/interface-core";
import type { PageRef } from "./addressing";
import type { ResourceRef } from "./resources";
import type { OpResult } from "./results";

/**
 * A declaration a column accepts, as a database catalog lists it: the `@Field` token, and why it
 * does not round-trip when it does not.
 */
export interface MappedDeclaration {
  declared: string;
  lossy?: string;
}

/** A column as a database catalog describes it. */
export interface MappedColumnDescription {
  name: string;
  native: string;
  nullable: boolean;
  hasDefault: boolean;
  accepts: MappedDeclaration[];
  /** Why a write never assigns it: generated, identity always, read-only type. */
  readOnly?: string;
  comment?: string | null;
}

/** The columns of a relation, the relation named `"schema.name"`. */
export interface MappedRelationColumns {
  relation: string;
  columns: string[];
}

/** A declared foreign key. */
export interface MappedReference {
  name: string;
  from: MappedRelationColumns;
  to: MappedRelationColumns;
}

/** The columns a relation's `_id` aliases. */
export interface MappedKey {
  columns: string[];
}

/** What the connected role may write to a relation. */
export interface MappedWrites {
  insert: boolean;
  update: boolean;
  delete: boolean;
}

/**
 * A relation as a database catalog describes it: the shape `@antelopejs/interface-database-catalog`
 * answers, restated here so the builder takes no dependency on it.
 */
export interface MappedRelationDescription {
  schema: string;
  name: string;
  kind: string;
  key: MappedKey | null;
  writes: MappedWrites;
  columns: MappedColumnDescription[];
  references: MappedReference[];
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
  /** False maps the table and its model only, for stats pages. Forced false without a key. */
  tableView: boolean;
  /** False serves the TableView without new, edit and delete, every field read-only. */
  writable: boolean;
  /** The columns to declare; key columns are added when left out. */
  fields: MappedField[];
}

/** Which relations of a connection to map, into which module of the project. */
export interface MapResourcesInput {
  /** The project module the tables are written into, bound to the connection's database. */
  module: string;
  /** The connection's id, used in routes and as the pages' category. */
  connection: string;
  resources: MappedResource[];
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
  /** The resource, for a relation mapped with a TableView. */
  ref?: ResourceRef;
  page?: PageRef;
  files: string[];
}

/** What `MapResources` wrote, and what it left off the TableViews. */
export interface MapResourcesResult {
  resources: MappedResult[];
  leftOut: LeftOutColumn[];
}

/**
 * Writes table classes, models, DataAPI controllers and TableView pages over relations of a
 * database the project does not own, into a module bound to it. Names are the database's own,
 * verbatim; `_id` is declared only where the relation has a key; nothing creates or alters a
 * table. `descriptions` are the catalog's descriptions of the relations named; every choice in
 * `input` is checked against them.
 */
export const MapResources =
  InterfaceFunction<
    (
      input: MapResourcesInput,
      descriptions: MappedRelationDescription[],
    ) => Promise<OpResult<MapResourcesResult>>
  >();
