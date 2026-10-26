import type { ProjectConfigStep } from "@antelopejs/interface-dms-builder";
import {
  addModule,
  type ConfigDraft,
  createLocalModule,
  refuse,
  writeEntry,
} from "./project-config";
import { removeConnection, removeModule } from "./project-config-remove";

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
