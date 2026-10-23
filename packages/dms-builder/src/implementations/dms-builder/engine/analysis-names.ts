import { humanized } from "./map-resources-plan";

/** Tables a framework or a migration tool keeps, which hold nothing an integrator lists (R4). */
const TECHNICAL_TABLES: readonly RegExp[] = [
  /_migrations$/,
  /^schema_migrations$/,
  /^knex_/,
  /^django_/,
  /^flyway_/,
  /^_/,
];

/** Columns named like a secret, which no page shows (F2). */
const SECRET_COLUMNS: readonly RegExp[] = [
  /^password$/,
  /^passwd$/,
  /^pwd$/,
  /_hash$/,
  /^salt$/,
  /^token$/,
  /^secret$/,
  /^api_key$/,
];

/** Label candidates by name, the first found winning (L1). */
const PREFERRED_LABELS: readonly string[] = [
  "name",
  "title",
  "label",
  "display_name",
  "full_name",
  "code",
  "reference",
];

/** `<target>_id`, `<target>_ref`, `<target>_code` and `<target>id`, for F5. */
const IMPLIED_REFERENCE = /^(.+?)(?:_id|_ref|_code|id)$/;

/** A comment's first sentence titles a page or a column when it is at most this long (L2). */
const TITLE_LENGTH = 40;
const SENTENCE_END = /[.\n]/;

export function isTechnicalTable(name: string): boolean {
  return TECHNICAL_TABLES.some((pattern) => pattern.test(name.toLowerCase()));
}

export function isSecretColumn(name: string): boolean {
  return SECRET_COLUMNS.some((pattern) => pattern.test(name.toLowerCase()));
}

/** The preferred label among candidates, and whether the choice was a tie broken by order. */
export interface LabelChoice {
  column: string;
  tied: boolean;
}

export function preferredLabel(candidates: string[]): LabelChoice | undefined {
  for (const preferred of PREFERRED_LABELS) {
    const found = candidates.find(
      (candidate) => candidate.toLowerCase() === preferred,
    );
    if (found) {
      return { column: found, tied: false };
    }
  }
  if (candidates.length === 0) {
    return undefined;
  }
  return { column: candidates[0], tied: candidates.length > 1 };
}

/** The relation names a column named like a reference may point at: `customer_id` → customers. */
export function impliedTargetNames(column: string): string[] {
  const match = IMPLIED_REFERENCE.exec(column.toLowerCase());
  if (!match || match[1].length === 0) {
    return [];
  }
  const stem = match[1].replace(/_$/, "");
  const plurals = [stem, `${stem}s`, `${stem}es`];
  if (stem.endsWith("y")) {
    plurals.push(`${stem.slice(0, -1)}ies`);
  }
  return plurals;
}

/** A title from a comment's first sentence when it is short, otherwise from the name (L2). */
export function titleOf(comment: string | null, name: string): string {
  const sentence = comment?.split(SENTENCE_END)[0]?.trim();
  if (sentence && sentence.length <= TITLE_LENGTH) {
    return sentence;
  }
  return humanized(name);
}
