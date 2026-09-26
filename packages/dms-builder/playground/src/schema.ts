// Schema this playground owns. Its tables are registered under it with
// `@RegisterTable(_, PLAYGROUND_SCHEMA)` and provisioned — fixtures included —
// by `RegisterSchema(PLAYGROUND_SCHEMA)` in the module `start()`, rather than
// piggybacking on the DMS core schema.
export const PLAYGROUND_SCHEMA = "dms-builder-playground";
