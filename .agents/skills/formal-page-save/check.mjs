#!/usr/bin/env node
/**
 * Model-checks how a dms-builder page file is saved, with TLC through the
 * shared runner of @antelopejs/tooling-configs: PageSave.tla with every write
 * between engine operations (Serial), with an outside write inside the
 * engine's window (Window), and with a page move from a tab (Move).
 *
 * Exits 0 when every configuration matches the record in SKILL.md, 1 when a
 * rule changed, and 2 when TLC could not run. The runner exits on the first
 * configuration that changed.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec, EXIT } from "@antelopejs/tooling-configs/formal";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** The findings of each configuration, in run order, with the states in TLC's shortest counterexample. */
const CONFIGS = {
  Serial: {},
  Window: {},
  Move: { NoSilentLoss: 11 },
};

if (process.argv.length > 2) {
  console.error("usage: node check.mjs");
  process.exit(EXIT.tool);
}

for (const [config, findings] of Object.entries(CONFIGS)) {
  await checkSpec({ dir, spec: "PageSave", config, findings });
}
