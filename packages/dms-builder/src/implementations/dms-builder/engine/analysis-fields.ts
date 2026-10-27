import { MixedTypeDeclarations } from "./mixed-types";
import type {
  ColumnDescription,
  ColumnProfile,
  Measure,
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
const ID_COLUMN = "_id";

const LISTED_TYPES: readonly string[] = ["boolean", "date", "number"];
const FILTERED_TYPES: readonly string[] = ["boolean", "date"];
const SORTED_TYPES: readonly string[] = ["date", "number"];

/** A relation a column may point at, as the analysis proposes or the module maps it. */
export interface ReferenceTarget {
  tableView: boolean;
  key: string[];
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

/** Asks which declaration reads a column of several native types; unanswered, it stays left out. */
function fieldTypeItem(
  facts: RelationFacts,
  column: ColumnDescription,
  declarations: string[],
): OpenItem {
  return {
    id: `field-type:${facts.relation}.${column.name}`,
    kind: "field-type",
    relation: facts.relation,
    column: column.name,
    question: `${facts.relation}.${column.name} holds ${column.native}, and no type covers enough of it to choose: which declaration reads it?`,
    options: [
      ...declarations.map((declared) => ({
        value: declared,
        title: `Declare it ${declared}`,
      })),
      { value: null, title: "Leave it out" },
    ],
    proposed: null,
  };
}

function referenceItem(
  facts: RelationFacts,
  column: string,
  reference: ImpliedReference,
): OpenItem {
  const share = Math.round(containmentOf(reference) * PERCENT);
  return {
    id: `reference:${facts.relation}.${column}`,
    kind: "reference",
    relation: facts.relation,
    column,
    question: `${share}% of ${facts.relation}.${column} is found in ${reference.to.relation}.${reference.to.column}. Is it a reference to it?`,
    options: [
      {
        value: reference.to.relation,
        title: `A reference to ${reference.to.relation}`,
      },
      { value: null, title: "A plain column" },
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
  column: string,
  context: FieldContext,
): RelationChoice {
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
    ? { open: referenceItem(facts, column, implied) }
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

/**
 * A column no field-type question is asked about: the `_id` of a relation without a key, which is
 * never declared, and a column named like a secret, which F2 leaves out whatever its values.
 */
function isNeverAsked(
  facts: RelationFacts,
  column: ColumnDescription,
): boolean {
  return (
    (column.name === ID_COLUMN && facts.description.key === null) ||
    isSecretColumn(column.name)
  );
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
      const declarations = isNeverAsked(facts, column)
        ? []
        : MixedTypeDeclarations(column);
      if (declarations.length > 0) {
        proposed.open.push(fieldTypeItem(facts, column, declarations));
      }
      continue;
    }
    const choice = relationChoice(facts, column.name, context);
    if (choice.open) {
      proposed.open.push(choice.open);
    }
    proposed.fields.push(proposedField(facts, column, context, choice));
  }
  return proposed;
}
