import fs from "node:fs";
import path from "node:path";
import type {
  MutationOpts,
  OpResult,
  OpWarning,
  ThemeDraft,
  ThemeFiles,
  ThemeLayer,
  ThemeStructure,
  ThemeVariableSets,
  TypecheckError,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import { IndentationText, Project, type SourceFile } from "ts-morph";
import { FileBatch } from "./file-batch";
import { contentVersion } from "./page-structure";
import { configuredIndentation, sampledIndentation } from "./project";
import {
  EMPTY_APP_CONFIG,
  readColors,
  readLogos,
  validateColors,
  validateLogos,
  writeAppConfig,
} from "./theme-app-config";
import {
  ASSETS_DIRECTORY,
  orphanedAssets,
  type StagedLogo,
  stageLogos,
  withUploads,
} from "./theme-assets";
import {
  ENTRY_FILE,
  importStylesheet,
  importsStylesheet,
  STYLESHEET_FILE,
} from "./theme-entry";
import { proposedLayerPath, resolveThemeLayer } from "./theme-layer";
import {
  emitStylesheet,
  parseStylesheet,
  validateVariables,
} from "./theme-stylesheet";

/** The files a theme lives in, relative to its layer. */
const THEME_FILES: ThemeFiles = {
  stylesheet: STYLESHEET_FILE,
  appConfig: "app/app.config.ts",
  entry: ENTRY_FILE,
  assets: `public/${ASSETS_DIRECTORY}`,
};

const VERSION_SEPARATOR = "\0";

/** A layer's theme files as they stand on disk, the TypeScript ones parsed. */
interface ThemeSources {
  layer: ThemeLayer;
  project: Project;
  stylesheet: string;
  appConfig: SourceFile;
  entry: SourceFile;
  version: string;
}

function readText(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function layerPath(layer: ThemeLayer, relative: string): string {
  return path.join(layer.sourcePath, relative);
}

function versionOf(texts: Array<string | undefined>): string {
  return contentVersion(
    texts.map((text) => text ?? "").join(VERSION_SEPARATOR),
  );
}

/**
 * The indentation the layer's tooling configures, else the one its entry is
 * written with: a layer is often a folder of the project with no formatter
 * config of its own, and a line the builder adds must read like its
 * neighbours.
 */
function layerIndentation(
  layer: ThemeLayer,
  entryText: string,
): IndentationText {
  return (
    configuredIndentation(layer.sourcePath) ??
    sampledIndentation(entryText) ??
    IndentationText.TwoSpaces
  );
}

/**
 * Parse the layer's frontend files in a project of their own. They are
 * compiled by the frontend loader, not with the backend, so they are only
 * ever checked for syntax here: their imports resolve in the generated
 * workspace alone.
 */
function openLayer(layer: ThemeLayer): ThemeSources | OpResult<never> {
  const entryPath = layerPath(layer, ENTRY_FILE);
  const entryText = readText(entryPath);
  if (entryText === undefined) {
    return { ok: false, error: { code: "not_found", ref: entryPath } };
  }
  const appConfigPath = layerPath(layer, THEME_FILES.appConfig);
  const appConfigText = readText(appConfigPath);
  const stylesheet = readText(layerPath(layer, THEME_FILES.stylesheet));
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: layerIndentation(layer, entryText),
    },
  });
  return {
    layer,
    project,
    stylesheet: stylesheet ?? "",
    appConfig: project.createSourceFile(
      appConfigPath,
      appConfigText ?? EMPTY_APP_CONFIG,
    ),
    entry: project.createSourceFile(entryPath, entryText),
    version: versionOf([stylesheet, appConfigText, entryText]),
  };
}

function isFailure<T>(value: T | OpResult<never>): value is OpResult<never> {
  return typeof value === "object" && value !== null && "ok" in value;
}

/**
 * The layer the theme lives in, opened. A project without one answers
 * `not_found` naming where `CreateThemeLayer` would put it, so an editor can
 * offer to.
 */
async function openThemeLayer(): Promise<ThemeSources | OpResult<never>> {
  const layer = await resolveThemeLayer();
  if (!layer) {
    return {
      ok: false,
      error: { code: "not_found", ref: proposedLayerPath() },
    };
  }
  return openLayer(layer);
}

function readVariables(
  sources: ThemeSources,
): ThemeVariableSets | OpResult<never> {
  const parsed = parseStylesheet(sources.stylesheet);
  if (parsed.variables) {
    return parsed.variables;
  }
  return {
    ok: false,
    error: {
      code: "unsupported",
      detail: `${THEME_FILES.stylesheet} is not one the builder can rewrite: ${parsed.opaque}. Move that content to another stylesheet.`,
    },
  };
}

/** The project's theme, as its layer's files hold it. */
export async function getTheme(): Promise<OpResult<ThemeStructure>> {
  const sources = await openThemeLayer();
  if (isFailure(sources)) {
    return sources;
  }
  const variables = readVariables(sources);
  if (isFailure(variables)) {
    return variables;
  }
  return {
    ok: true,
    data: {
      layer: sources.layer,
      variables,
      colors: readColors(sources.appConfig),
      logos: readLogos(sources.appConfig),
      files: THEME_FILES,
      stylesheetImported: importsStylesheet(sources.entry),
      version: sources.version,
    },
    changes: [],
  };
}

function staleCheck(
  sources: ThemeSources,
  opts?: MutationOpts,
): OpResult<never> | undefined {
  if (!opts?.expectedVersion || opts.expectedVersion === sources.version) {
    return undefined;
  }
  return {
    ok: false,
    error: {
      code: "stale",
      ref: layerPath(sources.layer, THEME_FILES.stylesheet),
      currentVersion: sources.version,
    },
  };
}

function syntaxErrors(sources: ThemeSources): TypecheckError[] {
  return sources.project
    .getProgram()
    .getSyntacticDiagnostics()
    .map((diagnostic) => {
      const message = diagnostic.getMessageText();
      return {
        file: diagnostic.getSourceFile()?.getFilePath() ?? "",
        line: diagnostic.getLineNumber() ?? 0,
        message:
          typeof message === "string" ? message : message.getMessageText(),
      };
    });
}

function unsupported(detail: string): OpResult<never> {
  return { ok: false, error: { code: "unsupported", detail } };
}

/**
 * Edit the TypeScript half of the theme in memory: the palettes and the logo
 * paths in the app config, and the entry's import of the stylesheet when the
 * theme has one to import. Answers the refusal, if any.
 */
function editSources(
  sources: ThemeSources,
  draft: ThemeDraft,
  staged: StagedLogo[],
  stylesheet: string,
): OpResult<never> | undefined {
  const refused = writeAppConfig(
    sources.appConfig,
    draft.colors ?? {},
    withUploads(draft.logos ?? {}, staged),
  );
  if (refused) {
    return unsupported(
      `${THEME_FILES.appConfig} cannot be rewritten: ${refused}`,
    );
  }
  if (stylesheet !== "") {
    importStylesheet(sources.entry);
  }
  const diagnostics = syntaxErrors(sources);
  return diagnostics.length > 0
    ? { ok: false, error: { code: "typecheck_failed", diagnostics } }
    : undefined;
}

/**
 * Every file of the theme, staged. The app config is only written when it
 * holds something or was there already: a theme of variables alone leaves a
 * layer without one as it was.
 */
function stageFiles(
  sources: ThemeSources,
  staged: StagedLogo[],
  stylesheet: string,
): FileBatch {
  const { layer } = sources;
  const batch = new FileBatch();
  const stylesheetPath = layerPath(layer, THEME_FILES.stylesheet);
  if (stylesheet !== "" || fs.existsSync(stylesheetPath)) {
    batch.write(stylesheetPath, stylesheet);
  }
  const appConfigPath = layerPath(layer, THEME_FILES.appConfig);
  const appConfig = sources.appConfig.getFullText();
  if (appConfig !== EMPTY_APP_CONFIG || fs.existsSync(appConfigPath)) {
    batch.write(appConfigPath, appConfig);
  }
  batch.write(layerPath(layer, ENTRY_FILE), sources.entry.getFullText());
  for (const logo of staged) {
    batch.write(logo.filePath, logo.bytes);
  }
  return batch;
}

function draftIssues(
  draft: ThemeDraft,
  uploadIssues: ValidationIssue[],
): ValidationIssue[] {
  return [
    ...validateVariables(draft.variables),
    ...validateColors(draft.colors ?? {}),
    ...validateLogos(draft.logos ?? {}),
    ...uploadIssues,
  ];
}

/**
 * One warning per SVG file sanitizing changed, naming every slot it went to:
 * a logo the simple editor puts everywhere is one file, and one thing to say.
 */
function sanitizedWarnings(staged: StagedLogo[]): OpWarning[] {
  const files = new Map<string, StagedLogo[]>();
  for (const logo of staged.filter((entry) => entry.stripped)) {
    files.set(logo.filePath, [...(files.get(logo.filePath) ?? []), logo]);
  }
  return [...files.values()].map((logos) => {
    const slots = logos.map((logo) => logo.upload.slot).join(", ");
    const mode = logos[0]?.upload.mode ?? "";
    return {
      code: "svg_sanitized",
      message: `The ${mode} logo (${slots}) held scripts, event handlers or references to other files: they were taken out of the saved SVG.`,
    };
  });
}

function writeTheme(
  sources: ThemeSources,
  draft: ThemeDraft,
  staged: StagedLogo[],
): OpResult<{ version: string }> {
  const previous = readLogos(sources.appConfig);
  const stylesheet = emitStylesheet(draft.variables);
  const edited = editSources(sources, draft, staged, stylesheet);
  if (edited) {
    return edited;
  }
  const batch = stageFiles(sources, staged, stylesheet);
  const next = readLogos(sources.appConfig);
  for (const orphan of orphanedAssets(sources.layer, previous, next)) {
    batch.remove(orphan);
  }
  const changes = batch.flush();
  const written = openLayer(sources.layer);
  const version = isFailure(written) ? "" : written.version;
  const result: OpResult<{ version: string }> = {
    ok: true,
    data: { version },
    changes,
  };
  const warnings = sanitizedWarnings(staged);
  if (warnings.length > 0) {
    result.warnings = warnings;
  }
  return result;
}

/**
 * Write the project's theme: the stylesheet, the palettes and logo paths of
 * the app config, the uploaded logos, and — the first time — the entry's
 * import of the stylesheet. Everything is checked before anything is
 * written, and the builder's own logos the theme stops pointing at are
 * deleted with it.
 */
export async function setTheme(
  draft: ThemeDraft,
  opts?: MutationOpts,
): Promise<OpResult<{ version: string }>> {
  const sources = await openThemeLayer();
  if (isFailure(sources)) {
    return sources;
  }
  const stale = staleCheck(sources, opts);
  if (stale) {
    return stale;
  }
  const current = readVariables(sources);
  if (isFailure(current)) {
    return current;
  }
  const { staged, issues } = stageLogos(sources.layer, draft.uploads ?? []);
  const invalid = draftIssues(draft, issues);
  if (invalid.length > 0) {
    return { ok: false, error: { code: "invalid_config", issues: invalid } };
  }
  return writeTheme(sources, draft, staged);
}
