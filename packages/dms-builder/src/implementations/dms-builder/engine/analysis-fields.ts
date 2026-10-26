import { nativeKind } from "./native-kind";
import type {
  ColumnDescription,
  ColumnProfile,
  Measure,
  RelationDescription,
} from "@antelopejs/interface-database-catalog";
import type {
  OpenItem,
  Proposed,
  ProposedColumnProfile,
  ProposedField,
  ProposedLeftOut,
  ProposedRelationColumn,
} from "@antelopejs/interface-dms-builder";
import {
  type ImpliedReference,
  type RelationFacts,
  columnProfile,
  hasTrait,
} from "./analysis-input";
import { isSecretColumn, titleOf } from "./analysis-names";

/** Text at most this long on average is listable. */
const LISTABLE_TEXT_LENGTH = 80;
/** An implied reference below full containment but above this is a question rather than nothing (F5). */
const OPEN_CONTAINMENT = 0.95;
const FULL_CONTAINMENT = 1;
const PERCENT = 100;

const LISTED_TYPES: readonly string[] = ["boolean", "date", "number"];
const FILTERED_TYPES: readonly string[] = ["boolean", "date"];
const SORTED_TYPES: readonly string[] = ["date", "number"];

/** A relation a column may point at, as the analysis proposes or the module maps it. */
export interface ReferenceTarget {
  tableView: boolean;
  key: string[];
  /** The declarations the key accepts, when it is one column. */
  keyAccepts: string[];
  /** The kind of value the key holds, when it is one column, as `nativeKind` reads it. */
  keyKind?: string;
}

export function referenceTarget(
  description: RelationDescription,
  tableView: boolean,
): ReferenceTarget {
  const key = description.key?.columns ?? [];
  const keyColumn =
    key.length === 1
      ? description.columns.find((column) => column.name === key[0])
      : undefined;
  return {
    tableView,
    key,
    keyAccepts: keyColumn?.accepts.map((entry) => entry.declared) ?? [],
    keyKind: keyColumn && nativeKind(keyColumn.native),
  };
}

/** What the field rules read beyond the relation. */
export interface FieldContext {
  label: string | null;
  targets: Map<string, ReferenceTarget>;
  implied: ImpliedReference[];
}

/** A relation's fields and the columns left out, with the questions they raise. */
export interface ProposedFields {
  fields: ProposedField[];
  leftOut: ProposedLeftOut[];
  open: OpenItem[];
}

function fact<T>(value: T, rule: string): Proposed<T> {
  return { value, rule, kind: "fact" };
}

function byDefault<T>(value: T, rule: string): Proposed<T> {
  return { value, rule, kind: "default" };
}

/** A declared foreign key out of this single column onto a TableView's single-column key (F4). */
function declaredReference(
  facts: RelationFacts,
  column: string,
  context: FieldContext,
): ProposedRelationColumn | undefined {
  const reference = facts.description.references.find(
    (candidate) =>
      candidate.from.columns.length === 1 &&
      candidate.from.columns[0] === column,
  );
  const target = reference && context.targets.get(reference.to.relation);
  if (
    !reference ||
    !target?.tableView ||
    target.key.length !== 1 ||
    target.key[0] !== reference.to.columns[0]
  ) {
    return undefined;
  }
  return { ...fact(reference.to.relation, "F4"), implied: false };
}

function impliedMatch(
  facts: RelationFacts,
  column: string,
  context: FieldContext,
): ImpliedReference | undefined {
  return context.implied.find(
    (reference) =>
      reference.from.relation === facts.relation &&
      reference.from.column === column &&
      reference.match.status === "ok" &&
      reference.match.value.targetIsKey,
  );
}

function containmentOf(reference: ImpliedReference): number {
  return reference.match.status === "ok"
    ? reference.match.value.containment
    : 0;
}

/** Single-keyed TableViews whose key holds the kind of value the column holds, by name. */
function otherTargets(
  column: ColumnDescription,
  context: FieldContext,
  except: string,
): string[] {
  const holds = new Set(column.accepts.map((entry) => entry.declared));
  const kind = nativeKind(column.native);
  return [...context.targets]
    .filter(
      ([relation, target]) =>
        relation !== except &&
        target.tableView &&
        target.key.length === 1 &&
        target.keyKind === kind &&
        target.keyAccepts.some((declared) => holds.has(declared)),
    )
    .map(([relation]) => relation)
    .sort((left, right) => left.localeCompare(right));
}

function referenceItem(
  facts: RelationFacts,
  column: ColumnDescription,
  reference: ImpliedReference,
  context: FieldContext,
): OpenItem {
  const share = Math.round(containmentOf(reference) * PERCENT);
  const { relation, column: target } = reference.to;
  return {
    id: `reference:${facts.relation}.${column.name}`,
    kind: "reference",
    relation: facts.relation,
    column: column.name,
    question: `Does ${facts.relation}.${column.name} point at a row of another table? ${share}% of its values are found in ${relation}.${target}. As a reference, the column shows that row's label and filters by it.`,
    options: [
      { value: null, title: "A plain column" },
      {
        value: relation,
        title: `A reference to ${relation} (${share}% found)`,
      },
      ...otherTargets(column, context, relation).map((other) => ({
        value: other,
        title: `A reference to ${other}`,
      })),
    ],
    proposed: null,
  };
}

interface RelationChoice {
  relation?: ProposedRelationColumn;
  open?: OpenItem;
}

/** A column's relation: a declared one (F4), or an implied one the catalog checked (F5). */
function relationChoice(
  facts: RelationFacts,
  description: ColumnDescription,
  context: FieldContext,
): RelationChoice {
  const column = description.name;
  const declared = declaredReference(facts, column, context);
  if (declared) {
    return { relation: declared };
  }
  const implied = impliedMatch(facts, column, context);
  if (!implied) {
    return {};
  }
  const containment = containmentOf(implied);
  const onTableView =
    context.targets.get(implied.to.relation)?.tableView === true;
  if (containment >= FULL_CONTAINMENT && onTableView) {
    return {
      relation: { ...byDefault(implied.to.relation, "F5"), implied: true },
    };
  }
  return containment >= OPEN_CONTAINMENT
    ? { open: referenceItem(facts, description, implied, context) }
    : {};
}

function isShortText(facts: RelationFacts, column: string): boolean {
  const length = columnProfile(facts, column)?.length;
  return length?.status === "ok" && length.value.avg <= LISTABLE_TEXT_LENGTH;
}

interface FieldFlags {
  listable: boolean;
  filterable: boolean;
  sortable: boolean;
  searchable: boolean;
}

function flagsOf(
  facts: RelationFacts,
  column: string,
  declared: string,
  isRelation: boolean,
  label: string | null,
): FieldFlags {
  const isLabel = column === label;
  const enumLike = hasTrait(facts, column, "enum-like");
  const text = declared === "string" && !isRelation;
  return {
    listable:
      isLabel ||
      enumLike ||
      isRelation ||
      LISTED_TYPES.includes(declared) ||
      (text && isShortText(facts, column)),
    filterable: enumLike || isRelation || FILTERED_TYPES.includes(declared),
    sortable: isLabel || SORTED_TYPES.includes(declared),
    searchable: isLabel || (text && hasTrait(facts, column, "identifier-like")),
  };
}

function leftOutReason(column: ColumnDescription): ProposedLeftOut | undefined {
  if (column.accepts.length === 0) {
    return {
      column: column.name,
      reason: column.unsupported ?? `${column.native} is read by no field type`,
      rule: "F1",
    };
  }
  return isSecretColumn(column.name)
    ? { column: column.name, reason: "named like a secret", rule: "F2" }
    : undefined;
}

function valueOf<T>(measure: Measure<T> | undefined): T | undefined {
  return measure?.status === "ok" ? measure.value : undefined;
}

/** The profile's aggregates for the person deciding; text extremes were never measured. */
function profileSummary(profile: ColumnProfile): ProposedColumnProfile {
  const summary: ProposedColumnProfile = { traits: [...profile.traits] };
  const nulls = valueOf(profile.nulls);
  const distinct = valueOf(profile.distinct);
  const range = valueOf(profile.range);
  const categories = valueOf(profile.categories);
  if (nulls !== undefined) {
    summary.nulls = nulls;
  }
  if (distinct !== undefined) {
    summary.distinct = distinct;
  }
  if (range) {
    summary.range = range;
  }
  if (categories) {
    summary.categories = categories.values;
  }
  return summary;
}

function proposedField(
  facts: RelationFacts,
  column: ColumnDescription,
  context: FieldContext,
  choice: RelationChoice,
): ProposedField {
  const [reading] = column.accepts;
  const declared = choice.relation ? "string" : reading.declared;
  const flags = flagsOf(
    facts,
    column.name,
    declared,
    choice.relation !== undefined,
    context.label,
  );
  const field: ProposedField = {
    column: column.name,
    native: column.native,
    accepts: column.accepts.map((entry) => entry.declared),
    declared: { ...fact(declared, "F3"), lossy: reading.lossy },
    label: byDefault(titleOf(column.comment, column.name), "L2"),
    listable: byDefault(flags.listable, "FL"),
    filterable: byDefault(flags.filterable, "FL"),
    sortable: byDefault(flags.sortable, "FL"),
    searchable: byDefault(flags.searchable, "FL"),
  };
  if (choice.relation) {
    field.relation = choice.relation;
  }
  const profile = columnProfile(facts, column.name);
  if (profile) {
    field.profile = profileSummary(profile);
  }
  return field;
}

/** Every column of a relation, proposed as a field or left out with its rule (F1 to F5). */
export function proposeFields(
  facts: RelationFacts,
  context: FieldContext,
): ProposedFields {
  const proposed: ProposedFields = { fields: [], leftOut: [], open: [] };
  for (const column of facts.description.columns) {
    const leftOut = leftOutReason(column);
    if (leftOut) {
      proposed.leftOut.push(leftOut);
      continue;
    }
    const choice = relationChoice(facts, column, context);
    if (choice.open) {
      proposed.open.push(choice.open);
    }
    proposed.fields.push(proposedField(facts, column, context, choice));
  }
  return proposed;
}
