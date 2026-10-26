import fs from "node:fs";
import path from "node:path";
import type {
  AdoptLocalModuleStep,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import { manifestNamingConnection } from "./mapped-modules";
import {
  addModule,
  type ConfigDraft,
  createLocalModule,
  refuse,
  writeEntry,
} from "./project-config";
import { removeConnection, removeModule } from "./project-config-remove";
import { localModuleRoot, localSource, refuseFolder } from "./project-scaffold";

const MANIFEST = "package.json";

function adoptLocalModule(
  draft: ConfigDraft,
  step: AdoptLocalModuleStep,
): void {
  const root = localModuleRoot(step.path);
  const manifest = path.join(root, MANIFEST);
  if (!fs.existsSync(manifest)) {
    refuseFolder(`module path "${step.path}" has no ${MANIFEST}`);
  }
  addModule(draft, step.id, { ...step.entry, source: localSource(root) });
  if (!step.connection) {
    return;
  }
  const content = manifestNamingConnection(root, step.connection);
  const before = fs.readFileSync(manifest, "utf8");
  if (content !== undefined && content !== before) {
    draft.edits.push({ path: manifest, before, content });
  }
}

type StepHandlers = {
  [Op in ProjectConfigStep["op"]]: (
    draft: ConfigDraft,
    step: Extract<ProjectConfigStep, { op: Op }>,
  ) => void;
};

const STEPS: StepHandlers = {
  AddModule: (draft, step) => addModule(draft, step.id, step.entry),
  ConfigureModule: (draft, step) => writeEntry(draft, step.id, step.entry),
  CreateLocalModule: createLocalModule,
  AdoptLocalModule: adoptLocalModule,
  RemoveModule: removeModule,
  RemoveConnection: removeConnection,
};

type AnyStepHandler = (draft: ConfigDraft, step: ProjectConfigStep) => void;

/** Applies one step to the draft, or throws a `StepRefusal` saying why it cannot. */
export function applyStep(draft: ConfigDraft, step: ProjectConfigStep): void {
  // SAFETY: STEPS maps each op to the handler of the step carrying that op.
  const handler = STEPS[step.op] as AnyStepHandler | undefined;
  if (!handler) {
    refuse(`unknown step "${String(step.op)}"`);
  }
  handler(draft, step);
}
