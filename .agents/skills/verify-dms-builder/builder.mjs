import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * @typedef {import("./playground/node_modules/@antelopejs/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {import("./playground/node_modules/@antelopejs/dms/bin/control/tab.mjs").Tab} Tab
 * @typedef {{ status: number | null, body: unknown, error: string | null, folder?: string }} Answer
 * @typedef {Record<string, unknown>} Row
 * @typedef {{ name: string, pass: boolean, detail: string }} Check
 * @typedef {{ ok: boolean, data: unknown, changes: Row[], warnings: Row[], error: Row | null, raw: unknown }} OpAnswer
 */

/** The builder's HTTP API, which the dashboard calls. */
export const BUILDER = "/api/builder";

/** The verification playground's trusted backend calls (`playground/src/fixture.ts`). */
export const FIXTURE = "/verify-builder";

/** Stands for `undefined` in an operation's arguments, which JSON cannot carry. */
export const UNSET = { $undefined: true };

/** The page every run starts with, and its address. */
export const BOARD = "/shop/board";

/**
 * @param {unknown} value Anything a JSON answer holds
 * @returns {value is Row} Whether it is an object
 */
export function isRow(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value Anything a JSON answer holds
 * @returns {value is string} Whether it is a string
 */
export function isText(value) {
  return typeof value === "string";
}

/**
 * Reads a nested field of a JSON answer.
 *
 * @param {unknown} value The answer
 * @param {...string} path The field names, outermost first
 * @returns {unknown} The field, or undefined when a step is missing
 */
export function pick(value, ...path) {
  let current = value;
  for (const step of path) {
    if (!isRow(current)) return undefined;
    current = current[step];
  }
  return current;
}

/**
 * @param {unknown} value The answer
 * @param {...string} path The field names
 * @returns {string} The field when it is a string, else the empty string
 */
export function text(value, ...path) {
  const found = pick(value, ...path);
  return isText(found) ? found : "";
}

/**
 * The objects of an array field of a JSON answer.
 *
 * @param {unknown} value The answer
 * @param {...string} path The field names, outermost first
 * @returns {Row[]} The array's objects, empty when the field is not an array
 */
export function list(value, ...path) {
  const found = path.length === 0 ? value : pick(value, ...path);
  return Array.isArray(found) ? found.filter(isRow) : [];
}

/**
 * A check, in the shape `ctx.record` takes.
 *
 * @param {string} name What is checked
 * @param {unknown} pass Whether it holds
 * @param {unknown} detail What was observed
 * @returns {Check} The check
 */
export function check(name, pass, detail) {
  return { name, pass: pass === true, detail: isText(detail) ? detail : (JSON.stringify(detail) ?? "undefined") };
}

/**
 * A call to the builder's HTTP API as the owner (or another account).
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {string} method The HTTP method
 * @param {string} path The path under `/api/builder`, with its query
 * @param {{ body?: unknown, as?: string }} [options] The JSON body, and the account (`admin` by default, `anon` for nobody)
 * @returns {Promise<Answer>} The answer
 */
export function builder(ctx, label, method, path, options = {}) {
  return ctx.api(label, { method, path: `${BUILDER}${path}`, body: options.body, as: options.as });
}

/**
 * One operation of `@antelopejs/interface-dms-builder`, called in process by the playground's fixture module, as
 * another module calls it. A mutation answers `{ ok, data, changes, warnings }` or `{ ok: false, error }`; a
 * listing answers its value.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the call does
 * @param {string} name The operation's exported name
 * @param {...unknown} args Its arguments, in the order the operation takes them
 * @returns {Promise<OpAnswer>} The answer
 */
export async function operation(ctx, label, name, ...args) {
  const answer = await ctx.api(`${name}: ${label}`, { method: "POST", path: `${FIXTURE}/call`, body: { name, args }, as: "anon" });
  const returned = pick(answer.body, "returned");
  const threw = pick(answer.body, "threw");
  const ok = pick(returned, "ok") === true;
  return {
    ok,
    data: pick(returned, "data"),
    changes: list(returned, "changes"),
    warnings: list(returned, "warnings"),
    error: ok ? null : (isRow(pick(returned, "error")) ? pick(returned, "error") : (isText(threw) ? { code: "threw", message: threw } : null)),
    raw: returned,
  };
}

/**
 * @param {Ctx} ctx The journey
 * @param {...string} parts A path under the project the builder edits (the run's copy of the playground)
 * @returns {string} The absolute path
 */
export function projectPath(ctx, ...parts) {
  return join(ctx.state.runPlayground ?? ctx.state.playground, ...parts);
}

/**
 * Reads a file of the project the builder edits, keeping a copy in the step's evidence.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What is read
 * @param {string} relative The path under the project root
 * @returns {{ text: string, exists: boolean, folder: string }} The file's text, empty when it is missing
 */
export function readProject(ctx, label, relative) {
  const folder = ctx.step(`read ${label}`);
  try {
    const content = readFileSync(projectPath(ctx, relative), "utf8");
    writeFileSync(join(folder, "file.ts.txt"), content);
    return { text: content, exists: true, folder };
  } catch {
    return { text: "", exists: false, folder };
  }
}

/**
 * Whether a project file exists.
 *
 * @param {Ctx} ctx The journey
 * @param {string} relative The path under the project root
 * @returns {boolean} True when it can be read
 */
export function projectHas(ctx, relative) {
  try {
    readFileSync(projectPath(ctx, relative));
    return true;
  } catch {
    return false;
  }
}

/**
 * Every file under a folder of the project, relative to the project root.
 *
 * @param {Ctx} ctx The journey
 * @param {string} relative The folder, under the project root
 * @returns {string[]} The files, sorted
 */
export function projectFiles(ctx, relative) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} folder */
  const walk = (folder) => {
    for (const entry of readdirSync(join(projectPath(ctx), folder), { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(path);
    }
  };
  try {
    walk(relative);
  } catch {
    return [];
  }
  return found.sort();
}

/**
 * Writes a file under the project, as a developer editing by hand does.
 *
 * @param {Ctx} ctx The journey
 * @param {string} relative The path under the project root
 * @param {string} content The new text
 */
export function writeProject(ctx, relative, content) {
  const file = projectPath(ctx, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/**
 * Compiles the project's sources and restarts the backend on them, which is what `ajs project dev -w` does when the
 * builder writes a file, so a page the builder wrote is served.
 *
 * @param {Ctx} ctx The journey
 * @returns {Promise<Check>} A check that the build succeeded
 */
export async function rebuild(ctx) {
  const folder = ctx.step("compile the project and restart the backend");
  const compiled = spawnSync(join(projectPath(ctx), "node_modules", ".bin", "tsc"), ["-p", "tsconfig.build.json"], {
    cwd: projectPath(ctx),
    encoding: "utf8",
  });
  writeFileSync(join(folder, "tsc.txt"), `${compiled.stdout}${compiled.stderr}`);
  await ctx.restartBackend();
  return check("the project compiles", compiled.status === 0, `${compiled.stdout}${compiled.stderr}`.slice(0, 300));
}

/**
 * Restarts the backend with `VERIFY_BUILDER_*` variables set (see `playground/antelope.config.ts`), runs `body`,
 * then restarts it with the variables it had, so later journeys get the module's defaults back.
 *
 * @param {Ctx} ctx The journey
 * @param {Record<string, string>} env The variables
 * @param {() => Promise<void>} body What to do under that configuration
 * @returns {Promise<void>}
 */
export async function withConfig(ctx, env, body) {
  const previous = { ...ctx.state.extraEnv };
  ctx.state.extraEnv = { ...previous, ...env };
  try {
    await ctx.restartBackend();
    await body();
  } finally {
    ctx.state.extraEnv = previous;
    await ctx.restartBackend();
  }
}

/**
 * Creates a member of the default tenant whose role holds the given permissions, and signs them up, so journeys act
 * as `name` with `ctx.api(..., { as: name })` and `ctx.tab(name)`.
 *
 * @param {Ctx} ctx The journey
 * @param {string} name The account name
 * @param {string[]} permissions The role's permission ids
 * @returns {Promise<{ roleId: string, userId: string }>} The role and the user
 */
export async function member(ctx, name, permissions) {
  const invite = await ctx.api(`invite ${name}`, { method: "POST", path: `${FIXTURE}/member`, body: { name, permissions }, as: "anon" });
  const email = text(invite.body, "email");
  const password = ctx.password();
  const signup = await ctx.api(`${name} signs up`, {
    method: "POST",
    path: "/api/auth/signup",
    body: { name, email, password, lang: "en", token: text(invite.body, "token") },
    as: "anon",
  });
  const userId = text(signup.body, "user", "_id");
  ctx.addAccount(name, { email, password, userId });
  await ctx.verify(`${name} is a member`, [check("the signup answers a session", signup.status === 200 && userId !== "", signup.status)], { critical: true });
  return { roleId: text(invite.body, "roleId"), userId };
}

/**
 * A check that an operation failed with a given error code.
 *
 * @param {string} name What is checked
 * @param {OpAnswer} answer The operation's answer
 * @param {string} code The error code wanted
 * @returns {Check} The check
 */
export function failsWith(name, answer, code) {
  return check(name, !answer.ok && text(answer.error, "code") === code, answer.raw);
}

/**
 * The codes of the warnings an operation answered.
 *
 * @param {OpAnswer} answer The operation's answer
 * @returns {string[]} The codes
 */
export function warningCodes(answer) {
  return answer.warnings.map((warning) => text(warning, "code"));
}
