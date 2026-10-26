import fs from "node:fs";
import path from "node:path";
import type {
  FileChange,
  OpResult,
  ProjectConfigResult,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import { Node, type ObjectLiteralExpression } from "ts-morph";
import { CATALOG_INTERFACE, DATABASE_INTERFACE } from "./interface-ids";
import { recordedConnection } from "./mapped-modules";
import { loadsEnvFile } from "./project-env-loading";
import { findConfigFile, propertyKey } from "./modules";
import { invalidConfig, unsupported } from "./ops";
import { resolveProjectRoot } from "./project";
import {
  type ConfigDraft,
  ENV_OVERRIDES,
  MODULES,
  moduleEntries,
  objectAt,
  openDraft,
  overridesOf,
  propertyNamed,
  StepRefusal,
  stringOf,
} from "./project-config";
import { configureProject } from "./project-config-ops";
import {
  EnvRefusal,
  hasProjectVariable,
  projectEnvFile,
  projectVariable,
  removeProjectVariable,
  setProjectVariable,
} from "./project-env";
import { isScaffoldRefusal, localModuleRoot } from "./project-scaffold";

const URL_PATH = "config.url";

/** What a connection wired into the configuration, by module id. */
export interface ConnectionWiring {
  connection: string;
  driver: string;
  /** The local modules holding its tables: read through the driver, their record naming the connection. */
  modules: { id: string; path: string }[];
  /** The variable supplying the driver's `url`, when one does. */
  variable?: string;
}

/** A connection's details as its URL holds them, the password left out. */
export interface ConnectionDetails {
  scheme: string;
  host: string;
  port: string;
  database: string;
  user: string;
  hasPassword: boolean;
  /** The URL parameters, `sslmode` among them. */
  options: Record<string, string>;
}

function localPath(entry: ObjectLiteralExpression): string | undefined {
  const source = propertyNamed(entry, "source")?.getInitializer();
  if (
    !Node.isObjectLiteralExpression(source) ||
    stringOf(propertyNamed(source, "type")?.getInitializer()) !== "local"
  ) {
    return undefined;
  }
  return stringOf(propertyNamed(source, "path")?.getInitializer());
}

function variableOf(draft: ConfigDraft, driver: string): string | undefined {
  const target = `${MODULES}.${driver}.${URL_PATH}`;
  const supplying = (objectAt(draft, [ENV_OVERRIDES])?.getProperties() ?? [])
    .filter(Node.isPropertyAssignment)
    .find((property) => stringOf(property.getInitializer()) === target);
  return supplying && propertyKey(supplying.getNameNode());
}

function openConfig(): ConfigDraft | undefined {
  const configPath = findConfigFile();
  return configPath ? openDraft(configPath) : undefined;
}

function wiringIn(
  draft: ConfigDraft,
  connection: string,
): ConnectionWiring | undefined {
  const entries = moduleEntries(draft);
  const driver = entries
    .flatMap(([, entry]) => overridesOf(entry))
    .find(
      (override) =>
        override.interface === CATALOG_INTERFACE && override.id === connection,
    )?.source;
  if (!driver) {
    return undefined;
  }
  const root = resolveProjectRoot();
  const modules = entries
    .filter(([, entry]) =>
      overridesOf(entry).some(
        (override) =>
          override.interface === DATABASE_INTERFACE &&
          override.id === undefined &&
          override.source === driver,
      ),
    )
    .flatMap(([id, entry]) => {
      const local = localPath(entry);
      return local &&
        recordedConnection(path.resolve(root, local)) === connection
        ? [{ id, path: local }]
        : [];
    });
  return { connection, driver, modules, variable: variableOf(draft, driver) };
}

/** Whether `error` says why the configuration or a module folder cannot be read or changed. */
export function isConnectionRefusal(error: unknown): error is Error {
  return error instanceof StepRefusal || isScaffoldRefusal(error);
}

/** What the configuration wires for a connection, or nothing when no module declares it. */
export function connectionWiring(
  connection: string,
): ConnectionWiring | undefined {
  const draft = openConfig();
  return draft && wiringIn(draft, connection);
}

/** The steps that take a connection out of the configuration: its connections, its modules. */
export function removalSteps(wiring: ConnectionWiring): ProjectConfigStep[] {
  return [
    {
      op: "RemoveConnection",
      interface: CATALOG_INTERFACE,
      id: wiring.connection,
    },
    ...wiring.modules.map((module): ProjectConfigStep => ({
      op: "RemoveModule",
      id: module.id,
    })),
    { op: "RemoveModule", id: wiring.driver },
  ];
}

function folderChanges(wiring: ConnectionWiring): FileChange[] {
  return wiring.modules.map((module) => ({
    path: localModuleRoot(module.path),
    kind: "delete" as const,
    diff: "",
  }));
}

function envChange(variable: string | undefined): FileChange[] {
  const file = projectEnvFile();
  if (!variable || !file || !hasProjectVariable(variable)) {
    return [];
  }
  return [{ path: file, kind: "modify", diff: `-${variable}=…` }];
}

export interface RemoveConnectionOpts {
  dryRun?: boolean;
}

/**
 * Takes a connection out of the project: its catalog connections, its driver, its tables modules
 * and their folders, the variable supplying its URL in `envOverrides` and `.env`. Refused while
 * another module still reads through the driver. The value of the variable is never answered.
 */
export function removeDatabaseConnection(
  connection: string,
  opts: RemoveConnectionOpts = {},
): OpResult<ProjectConfigResult> {
  let wiring: ConnectionWiring | undefined;
  let folders: FileChange[];
  try {
    wiring = connectionWiring(connection);
    folders = wiring ? folderChanges(wiring) : [];
  } catch (error) {
    if (isConnectionRefusal(error)) {
      return invalidConfig<ProjectConfigResult>(error.message);
    }
    throw error;
  }
  if (!wiring) {
    return unsupported<ProjectConfigResult>(
      `no module of the configuration declares the connection "${connection}"`,
    );
  }
  const env = envChange(wiring.variable);
  const configured = configureProject(removalSteps(wiring), {
    dryRun: opts.dryRun,
  });
  if (!configured.ok) {
    return configured;
  }
  if (!opts.dryRun) {
    if (wiring.variable) {
      removeProjectVariable(wiring.variable);
    }
    for (const folder of folders) {
      fs.rmSync(folder.path, { recursive: true, force: true });
    }
  }
  const changes = [...configured.changes, ...env, ...folders];
  return {
    ok: true,
    data: { files: changes.map((change) => change.path) },
    changes,
  };
}

type UrlRead =
  | { ok: true; wiring: ConnectionWiring; url: URL }
  | { ok: false; message: string };

function wiredUrl(
  connection: string,
  wiring: ConnectionWiring | undefined,
): UrlRead {
  if (!wiring?.variable) {
    return {
      ok: false,
      message: `the connection "${connection}" has no variable supplying its URL`,
    };
  }
  const value = projectVariable(wiring.variable);
  if (value === undefined) {
    return {
      ok: false,
      message: `${wiring.variable} is not set in the project's .env`,
    };
  }
  try {
    return { ok: true, wiring, url: new URL(value) };
  } catch {
    return { ok: false, message: `${wiring.variable} does not hold a URL` };
  }
}

function connectionUrl(connection: string): UrlRead {
  try {
    return wiredUrl(connection, connectionWiring(connection));
  } catch (error) {
    if (isConnectionRefusal(error)) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** A connection's details from the URL in `.env`, the password left out. */
export function connectionDetails(
  wiring: ConnectionWiring,
): OpResult<ConnectionDetails> {
  const read = wiredUrl(wiring.connection, wiring);
  if (!read.ok) {
    return invalidConfig<ConnectionDetails>(read.message);
  }
  const { url } = read;
  return {
    ok: true,
    data: {
      scheme: url.protocol.replace(/:$/, ""),
      host: decoded(url.hostname),
      port: url.port,
      database: decoded(url.pathname.replace(/^\//, "")),
      user: decoded(url.username),
      hasPassword: url.password !== "",
      options: Object.fromEntries(url.searchParams),
    },
    changes: [],
  };
}

/** Whether both URLs reach the same server as the same user. */
function sameServer(saved: URL, next: URL): boolean {
  return (
    saved.hostname === next.hostname &&
    saved.port === next.port &&
    saved.username === next.username
  );
}

/**
 * Writes a connection's new URL into `.env`. A URL with no password keeps the current one while it
 * reaches the same host, port and user, so the password never has to travel back to change something
 * else, and never follows the connection to another server. Takes effect on the next restart.
 */
export function setConnectionUrl(
  connection: string,
  value: string,
): OpResult<{ variable: string }> {
  const read = connectionUrl(connection);
  if (!read.ok) {
    return invalidConfig<{ variable: string }>(read.message);
  }
  let next: URL;
  try {
    next = new URL(value);
  } catch {
    return invalidConfig<{ variable: string }>(
      "the new details do not make a URL",
    );
  }
  if (next.protocol !== read.url.protocol) {
    return invalidConfig<{ variable: string }>(
      `the connection reads ${read.url.protocol.replace(/:$/, "")} URLs`,
    );
  }
  if (next.password === "" && next.username !== "" && read.url.password) {
    if (!sameServer(read.url, next)) {
      return invalidConfig<{ variable: string }>(
        "the password is kept only for the same host, port and user: enter the password for the new ones",
      );
    }
    next.password = read.url.password;
  }
  const variable = read.wiring.variable ?? "";
  const loading = loadsEnvAlready();
  if (!loading.ok) {
    return loading;
  }
  try {
    setProjectVariable(variable, next.href);
  } catch (error) {
    if (error instanceof EnvRefusal) {
      return invalidConfig<{ variable: string }>(error.message);
    }
    throw error;
  }
  if (loading.data) {
    return { ok: true, data: { variable }, changes: [] };
  }
  const configured = configureProject([
    {
      op: "ConfigureModule",
      id: read.wiring.driver,
      entry: { env: { url: variable } },
    },
  ]);
  return configured.ok
    ? { ok: true, data: { variable }, changes: configured.changes }
    : configured;
}

/**
 * Whether the configuration loads `.env` already. One that does not, from a project connected
 * before the builder wrote that code, gets it with the new URL, which would otherwise never reach
 * it; one that does is not written, so the project is not restarted.
 */
function loadsEnvAlready(): OpResult<boolean> {
  try {
    const draft = openConfig();
    return { ok: true, data: !draft || loadsEnvFile(draft.file), changes: [] };
  } catch (error) {
    if (isConnectionRefusal(error)) {
      return invalidConfig<boolean>(error.message);
    }
    throw error;
  }
}
