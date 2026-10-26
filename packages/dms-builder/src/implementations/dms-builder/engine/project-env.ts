import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Node, Project } from "ts-morph";
import type {
  OpResult,
  ProjectConfigResult,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import { configObject, findConfigFile, propertyNamed } from "./modules";
import { invalidConfig } from "./ops";
import { configureProject } from "./project-config-ops";

const ENV_FILE = ".env";
const ENV_OVERRIDES = "envOverrides";
const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]*$/;
const UNQUOTABLE = /["\n\r]/;

/** A variable the builder may not write, and why. */
export class EnvRefusal extends Error {}

function refuse(message: string): never {
  throw new EnvRefusal(message);
}

/** The variables `envOverrides` maps, the only ones the builder writes. */
function overriddenVariables(configPath: string): Set<string> {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    configPath,
    fs.readFileSync(configPath, "utf8"),
  );
  const root = configObject(file);
  const overrides = root && propertyNamed(root, ENV_OVERRIDES);
  if (!Node.isObjectLiteralExpression(overrides)) {
    return new Set();
  }
  return new Set(
    overrides
      .getProperties()
      .filter(Node.isPropertyAssignment)
      .map((property) => property.getName().replace(/^["']|["']$/g, "")),
  );
}

const GIT_IGNORED = 0;
const GIT_NOT_IGNORED = 1;
const GIT_DIRECTORY = ".git";

function insideRepository(directory: string): boolean {
  let current = path.resolve(directory);
  while (!fs.existsSync(path.join(current, GIT_DIRECTORY))) {
    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
  return true;
}

/**
 * Why the builder cannot write `file`, when git might commit it: nothing outside a repository, and
 * inside one only a file git answers it ignores. A git that fails or is missing refuses too.
 */
function commitRisk(directory: string, file: string): string | undefined {
  if (!insideRepository(directory)) {
    return undefined;
  }
  const checked = spawnSync("git", ["check-ignore", "-q", file], {
    cwd: directory,
  });
  if (checked.status === GIT_IGNORED) {
    return undefined;
  }
  return checked.status === GIT_NOT_IGNORED
    ? `${file} is not ignored by git, so the builder does not write to it`
    : `git could not say whether ${file} is ignored, so the builder does not write to it`;
}

function withVariable(before: string, name: string, value: string): string {
  const line = `${name}="${value}"`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  if (pattern.test(before)) {
    return before.replace(pattern, () => line);
  }
  const separator = before === "" || before.endsWith("\n") ? "" : "\n";
  return `${before}${separator}${line}\n`;
}

/** Where the project's `.env` sits: beside its configuration. */
export function projectEnvFile(): string | undefined {
  const configPath = findConfigFile();
  return configPath && path.join(path.dirname(configPath), ENV_FILE);
}

function variablePattern(name: string): RegExp {
  return new RegExp(`^${name}=(.*)$`, "m");
}

/**
 * A variable's value in the project's `.env`, for the builder's own use: a caller answers what it
 * reads from it, never the value itself.
 */
export function projectVariable(name: string): string | undefined {
  const file = projectEnvFile();
  if (!VARIABLE_NAME.test(name) || !file || !fs.existsSync(file)) {
    return undefined;
  }
  const raw = variablePattern(name).exec(fs.readFileSync(file, "utf8"))?.[1];
  return raw?.trim().replace(/^"(.*)"$/, "$1");
}

/** Whether the project's `.env` sets the variable. */
export function hasProjectVariable(name: string): boolean {
  return projectVariable(name) !== undefined;
}

/** Removes a variable's line from the project's `.env`, when it has one. */
export function removeProjectVariable(name: string): void {
  const file = projectEnvFile();
  if (!VARIABLE_NAME.test(name) || !file || !fs.existsSync(file)) {
    return;
  }
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(new RegExp(`^${name}=.*(\n|$)`, "m"), "");
  if (after !== before) {
    fs.writeFileSync(file, after, { mode: 0o600 });
  }
}

/**
 * Sets a variable `envOverrides` maps in the project's `.env`, for development. It refuses when the
 * project is in a git repository that does not ignore `.env`, so a value written here never
 * reaches a commit. The value is never answered. `mapped` names the variables
 * `envOverrides` will map, for a batch about to be written; by default, those it maps now.
 */
export function setProjectVariable(
  name: string,
  value: string,
  mapped?: Set<string>,
): string {
  const configPath =
    findConfigFile() ?? refuse("the project has no configuration");
  if (!VARIABLE_NAME.test(name)) {
    refuse(`${name} is not a variable name`);
  }
  if (!(mapped ?? overriddenVariables(configPath)).has(name)) {
    refuse(`${name} is not in the configuration's envOverrides`);
  }
  if (value === "" || UNQUOTABLE.test(value)) {
    refuse(`the value of ${name} is empty, or holds a quote or a line break`);
  }
  const directory = path.dirname(configPath);
  const risk = commitRisk(directory, ENV_FILE);
  if (risk) {
    refuse(risk);
  }
  const file = path.join(directory, ENV_FILE);
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  fs.writeFileSync(file, withVariable(before, name, value), { mode: 0o600 });
  return file;
}

/** A variable's development value, sent with the batch that maps it. */
export interface ProjectVariable {
  name: string;
  value: string;
}

function stepVariables(steps: ProjectConfigStep[]): Set<string> {
  return new Set(
    steps.flatMap((step) =>
      "entry" in step ? Object.values(step.entry?.env ?? {}) : [],
    ),
  );
}

/**
 * Writes a batch and the development value of a variable it maps: `.env` first, after a dry run
 * accepted the batch, so the configuration never names a variable whose value failed to be
 * written. When `.env` is refused, nothing else is written either, and when the batch fails after
 * it, `.env` goes back to what it held.
 */
export function configureProjectWithVariable(
  steps: ProjectConfigStep[],
  variable: ProjectVariable,
): OpResult<ProjectConfigResult> {
  const checked = configureProject(steps, { dryRun: true });
  if (!checked.ok) {
    return checked;
  }
  const previous = projectVariable(variable.name);
  const mapped = stepVariables(steps);
  try {
    setProjectVariable(variable.name, variable.value, mapped);
  } catch (error) {
    if (error instanceof EnvRefusal) {
      return invalidConfig<ProjectConfigResult>(error.message);
    }
    throw error;
  }
  const configured = configureProject(steps);
  if (!configured.ok) {
    if (previous === undefined) {
      removeProjectVariable(variable.name);
    } else {
      setProjectVariable(variable.name, previous, mapped);
    }
  }
  return configured;
}
