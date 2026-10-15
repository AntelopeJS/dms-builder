import { RegisterSchema } from "@antelopejs/interface-database-decorators";
// Value import, not a type-only one: evaluating this module is what registers
// the category and the page.
import "./board/page";

export * from "./order";
import { PLAYGROUND_SCHEMA } from "./schema";

export async function construct(): Promise<void> {}

export async function start(): Promise<void> {
  // Provisions the playground's tables and runs their fixtures, so the source
  // editor's preview has rows to read. Runs after the DMS start(), by which
  // point the database adapter is available.
  await RegisterSchema(PLAYGROUND_SCHEMA);
}

export function destroy(): void {}

export function stop(): void {}
