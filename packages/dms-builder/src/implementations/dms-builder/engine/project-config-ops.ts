import fs from "node:fs";
import path from "node:path";
import type {
  FileChange,
  OpResult,
  ProjectConfigOpts,
  ProjectConfigResult,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import { findConfigFile } from "./modules";
import { invalidConfig, unsupported } from "./ops";
import {
  applyStep,
  type ConfigDraft,
  openDraft,
  StepRefusal,
} from "./project-config";
import { isScaffoldRefusal } from "./project-scaffold";
import { invalidateResourceIndex } from "./resource-index";
import { invalidateSourceIndex } from "./source-index";
import {
  diffText,
  getWritableProject,
  resetWritableProject,
  Transaction,
} from "./writable";

const ENV_EXAMPLE = ".env.example";

function refusal(error: unknown): OpResult<ProjectConfigResult> | undefined {
  if (error instanceof StepRefusal || isScaffoldRefusal(error)) {
    return invalidConfig<ProjectConfigResult>(error.message);
  }
  return undefined;
}

interface PlannedWrite {
  change: FileChange;
  content: string;
}

function plannedWrites(draft: ConfigDraft): PlannedWrite[] {
  const after = draft.file.getFullText();
  const writes: PlannedWrite[] = [
    {
      change: {
        path: draft.path,
        kind: "modify",
        diff: diffText(draft.before, after),
      },
      content: after,
    },
  ];
  for (const scaffold of draft.scaffolds) {
    for (const [file, content] of scaffold.files) {
      writes.push({
        change: { path: file, kind: "create", diff: diffText("", content) },
        content,
      });
    }
  }
  return writes;
}

/** `.env.example` with a line for each variable it does not mention yet, when the project has one. */
function envExampleWrite(draft: ConfigDraft): PlannedWrite | undefined {
  const file = path.join(path.dirname(draft.path), ENV_EXAMPLE);
  if (!fs.existsSync(file) || draft.variables.length === 0) {
    return undefined;
  }
  const before = fs.readFileSync(file, "utf8");
  const missing = draft.variables.filter(
    (variable) => !new RegExp(`^${variable}=`, "m").test(before),
  );
  if (missing.length === 0) {
    return undefined;
  }
  const separator = before.endsWith("\n") || before === "" ? "" : "\n";
  const content = `${before}${separator}${missing.map((variable) => `${variable}=`).join("\n")}\n`;
  return {
    change: { path: file, kind: "modify", diff: diffText(before, content) },
    content,
  };
}

/** Writes the scaffolds' entry files through a typechecked transaction, then everything else. */
function commitDraft(
  draft: ConfigDraft,
  writes: PlannedWrite[],
): OpResult<ProjectConfigResult> {
  const project = getWritableProject();
  const transaction = new Transaction(project);
  for (const scaffold of draft.scaffolds) {
    transaction.track(
      project.createSourceFile(scaffold.entryFile, scaffold.entryText),
      true,
    );
  }
  const errors = transaction.typecheckErrors();
  if (errors.length > 0) {
    transaction.rollback();
    return {
      ok: false,
      error: { code: "typecheck_failed", diagnostics: errors },
    };
  }
  const entries = transaction.flush();
  for (const write of writes) {
    fs.mkdirSync(path.dirname(write.change.path), { recursive: true });
    fs.writeFileSync(write.change.path, write.content);
  }
  resetWritableProject();
  invalidateSourceIndex();
  invalidateResourceIndex();
  const changes = [...writes.map((write) => write.change), ...entries];
  return {
    ok: true,
    data: { files: changes.map((change) => change.path) },
    changes,
  };
}

function scaffoldEntryChanges(draft: ConfigDraft): FileChange[] {
  return draft.scaffolds.map((scaffold) => ({
    path: scaffold.entryFile,
    kind: "create",
    diff: diffText("", scaffold.entryText),
  }));
}

/**
 * Applies project-config steps as one edit of `antelope.config.ts`: every step is validated on a
 * draft first, and nothing is written when one is refused. A dry run answers the changes only.
 */
export function configureProject(
  steps: ProjectConfigStep[],
  opts: ProjectConfigOpts = {},
): OpResult<ProjectConfigResult> {
  const configPath = findConfigFile();
  if (!configPath) {
    return unsupported<ProjectConfigResult>(
      "the project has no antelope.config.ts",
    );
  }
  let draft: ConfigDraft;
  try {
    draft = openDraft(configPath);
    for (const step of steps) {
      applyStep(draft, step);
    }
  } catch (error) {
    const refused = refusal(error);
    if (refused) {
      return refused;
    }
    throw error;
  }
  const example = envExampleWrite(draft);
  const writes = [...plannedWrites(draft), ...(example ? [example] : [])];
  if (opts.dryRun) {
    const changes = [
      ...writes.map((write) => write.change),
      ...scaffoldEntryChanges(draft),
    ];
    return {
      ok: true,
      data: { files: changes.map((change) => change.path) },
      changes,
    };
  }
  return commitDraft(draft, writes);
}
