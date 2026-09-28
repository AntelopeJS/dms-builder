import path from "node:path";
import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
// Value import, not a type-only one: evaluating this module is what registers
// the category and the page.
import "./board/page";

export * from "./order";
import { PLAYGROUND_SCHEMA } from "./schema";

/**
 * The playground's own frontend layer sits above the DMS, at 0: the theme
 * editor writes the project's colors and logos there.
 */
const PLAYGROUND_LAYER_PRIORITY = 1;

export async function construct(): Promise<void> {}

export async function start(): Promise<void> {
  // Provisions the playground's tables and runs their fixtures, so the source
  // editor's preview has rows to read. Runs after the DMS start(), by which
  // point the database adapter is available.
  await RegisterSchema(PLAYGROUND_SCHEMA);
  await AddFrontendModule({
    name: "playground-frontend",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    priority: PLAYGROUND_LAYER_PRIORITY,
  });
}

export function destroy(): void {}

export function stop(): void {}

export * from "./test";
export * from "./test2";
