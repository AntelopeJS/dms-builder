import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Node, Project } from "ts-morph";
import { configObject, findConfigFile, propertyNamed } from "./modules";

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

function isGitIgnored(directory: string, file: string): boolean {
  const checked = spawnSync("git", ["check-ignore", "-q", file], {
    cwd: directory,
  });
  return checked.status === 0;
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

/**
 * Sets a variable `envOverrides` maps in the project's `.env`, for development. It refuses unless
 * git ignores `.env`, so a value written here never reaches a commit. The value is never read
 * back or answered.
 */
export function setProjectVariable(name: string, value: string): string {
  const configPath =
    findConfigFile() ?? refuse("the project has no configuration");
  if (!VARIABLE_NAME.test(name)) {
    refuse(`${name} is not a variable name`);
  }
  if (!overriddenVariables(configPath).has(name)) {
    refuse(`${name} is not in the configuration's envOverrides`);
  }
  if (value === "" || UNQUOTABLE.test(value)) {
    refuse(`the value of ${name} is empty, or holds a quote or a line break`);
  }
  const directory = path.dirname(configPath);
  if (!isGitIgnored(directory, ENV_FILE)) {
    refuse(
      `${ENV_FILE} is not ignored by git, so the builder does not write to it`,
    );
  }
  const file = path.join(directory, ENV_FILE);
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  fs.writeFileSync(file, withVariable(before, name, value), { mode: 0o600 });
  return file;
}
