import type {
  CatalogInfo,
  ColumnDescription,
  ColumnProfile,
  ColumnTrait,
  Reference,
  RelationDescription,
  RelationProfile,
} from "@antelopejs/interface-database-catalog";
import type { AnalysisInput } from "../implementations/dms-builder/engine/analysis-input";

const WRITES = { insert: false, update: false, delete: false };

export const INFO: CatalogInfo = {
  engine: "postgresql",
  version: "17.5",
  database: "erp",
  role: "erp_reader",
};

/** A column as the catalog describes it, read as its first declaration. */
export function Column(
  name: string,
  declared: string,
  extra: Partial<ColumnDescription> = {},
): ColumnDescription {
  return {
    name,
    native: declared,
    nullable: true,
    hasDefault: false,
    generated: false,
    identity: null,
    accepts: [{ declared }],
    comment: null,
    ...extra,
  };
}

export function Reference(
  from: string,
  fromColumn: string,
  to: string,
  toColumn: string,
): Reference {
  return {
    name: `${from}_${fromColumn}_fkey`,
    from: { relation: from, columns: [fromColumn] },
    to: { relation: to, columns: [toColumn] },
  };
}

/** The parts of a relation a spec chooses; the rest is what a plain table answers. */
export interface RelationShape {
  relation: string;
  key?: string[];
  columns: ColumnDescription[];
  references?: Reference[];
  referencedBy?: Reference[];
  comment?: string;
  unmappable?: string;
  kind?: RelationDescription["kind"];
}

export function Relation(shape: RelationShape): RelationDescription {
  const [schema, name] = shape.relation.split(".");
  const description: RelationDescription = {
    schema,
    name,
    kind: shape.kind ?? "table",
    estimatedRows: 100,
    estimate: "statistics",
    key: shape.key ? { columns: shape.key, source: "primary" } : null,
    writes: WRITES,
    comment: shape.comment ?? null,
    columns: shape.columns,
    indexes: [],
    references: shape.references ?? [],
    referencedBy: shape.referencedBy ?? [],
  };
  return shape.unmappable
    ? { ...description, unmappable: shape.unmappable }
    : description;
}

/** A column's traits, with a text length when it has one. */
export interface ColumnTraits {
  traits?: ColumnTrait[];
  avgLength?: number;
}

function ColumnProfileOf(name: string, traits: ColumnTraits): ColumnProfile {
  const profile: ColumnProfile = { name, traits: traits.traits ?? [] };
  if (traits.avgLength !== undefined) {
    profile.length = {
      status: "ok",
      value: { min: 1, avg: traits.avgLength, max: traits.avgLength },
    };
  }
  return profile;
}

export function Profiled(
  relation: string,
  rows: number,
  columns: Record<string, ColumnTraits>,
): RelationProfile {
  return {
    relation,
    rows: { status: "ok", value: { rows, exact: true } },
    sample: null,
    columns: Object.entries(columns).map(([name, traits]) =>
      ColumnProfileOf(name, traits),
    ),
    references: [],
    inbound: [],
  };
}

export function Input(
  descriptions: RelationDescription[],
  profiles: RelationProfile[],
  extra: Partial<AnalysisInput> = {},
): AnalysisInput {
  return {
    connection: "erp",
    module: "erp-tables",
    info: INFO,
    summaries: descriptions,
    descriptions,
    profiles,
    references: [],
    mapped: {},
    ...extra,
  };
}
