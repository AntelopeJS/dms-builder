import type { BlockPath } from "./addressing";

/** A single file mutation staged by an operation. */
export interface FileChange {
  path: string;
  kind: "create" | "modify" | "delete";
  diff: string;
}

/** A config validation failure, addressed by a JSON pointer. */
export interface ValidationIssue {
  pointer: string;
  message: string;
}

/** A TypeScript diagnostic from the in-memory typecheck gate. */
export interface TypecheckError {
  file: string;
  line: number;
  message: string;
}

/** A non-fatal advisory attached to an otherwise successful operation. */
export interface OpWarning {
  code:
    | "index_clamped"
    | "datatype_fallback"
    | "data_not_dropped"
    /** A page moved category, so its route changed and old links break. */
    | "route_changed";
  message: string;
}

/** The scope a duplicate name collides within. */
export type DuplicateScope =
  | "page"
  | "siblings"
  | "category"
  | "resource"
  | "query";

/** Every way an operation can fail. */
export type BuilderError =
  | { code: "not_found"; ref: string }
  | { code: "duplicate_name"; name: string; scope: DuplicateScope }
  | { code: "invalid_config"; issues: ValidationIssue[] }
  | { code: "opaque_target"; path: BlockPath }
  | { code: "unsupported"; detail: string }
  | { code: "referential_integrity"; blockedBy: string[] }
  | { code: "stale"; ref: string; currentVersion: string }
  | { code: "typecheck_failed"; diagnostics: TypecheckError[] };

/** The result of a builder operation. On success, carries the staged changes. */
export type OpResult<T = void> =
  | { ok: true; data: T; changes: FileChange[]; warnings?: OpWarning[] }
  | { ok: false; error: BuilderError };

/** Optional trailing options accepted by every mutating operation. */
export interface MutationOpts {
  /** The `PageStructure.version` the consumer last read → `stale` on mismatch. */
  expectedVersion?: string;
}
