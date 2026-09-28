import fs from "node:fs";
import path from "node:path";
import type {
  MutationOpts,
  OpResult,
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
  readLogos,
  validateLogos,
  writeLogos,
} from "./theme-app-config";
import {
  ASSETS_DIRECTORY,
  orphanedAssets,
  type StagedLogo,
  stageLogos,
  withUploads,
} from "./theme-assets";
import {
  APPLIER_FILE,
  APPLIER_SOURCE,
  applyThemeInEntry,
  ENTRY_FILE,
  isThemeApplied,
} from "./theme-entry";
import { resolveThemeLayer } from "./theme-layer";
import {
  emitStylesheet,
  parseStylesheet,
  validateVariables,
} from "./theme-stylesheet";

/** The files a theme lives in, relative to its layer. */
const THEME_FILES: ThemeFiles = {
  stylesheet: "app/assets/css/theme.css",
  appConfig: "app/app.config.ts",
  applier: APPLIER_FILE,
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
  applier: string | undefined;
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
  const applier = readText(layerPath(layer, APPLIER_FILE));
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
    applier,
    version: versionOf([stylesheet, appConfigText, entryText, applier]),
  };
}

function isFailure<T>(value: T | OpResult<never>): value is OpResult<never> {
  return typeof value === "object" && value !== null && "ok" in value;
}

async function openThemeLayer(): Promise<ThemeSources | OpResult<never>> {
  const layer = await resolveThemeLayer();
  if (!layer) {
    return {
      ok: false,
      error: {
        code: "unsupported",
        detail:
          "the project registers no frontend layer of its own to write the theme to; add one with AddFrontendModule, or name it in the dms-builder config (theme.layer)",
      },
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
      logos: readLogos(sources.appConfig),
      files: THEME_FILES,
      applied: isThemeApplied(sources.entry),
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

/**
 * The applier, written in the layer's own indentation. Created in the layer's
 * project, so the syntax check that guards the entry covers it too.
 */
function createApplier(sources: ThemeSources): SourceFile {
  const applier = sources.project.createSourceFile(
    layerPath(sources.layer, APPLIER_FILE),
    APPLIER_SOURCE,
    { overwrite: true },
  );
  applier.formatText();
  return applier;
}

function unsupported(detail: string): OpResult<never> {
  return { ok: false, error: { code: "unsupported", detail } };
}

/**
 * Edit the TypeScript half of the theme in memory: the logo paths in the app
 * config, and the entry's call to the applier. Answers the refusal, if any.
 */
function editSources(
  sources: ThemeSources,
  draft: ThemeDraft,
  staged: StagedLogo[],
): OpResult<never> | undefined {
  if (!writeLogos(sources.appConfig, withUploads(draft.logos, staged))) {
    return unsupported(
      `${THEME_FILES.appConfig} does not default-export an object literal`,
    );
  }
  if (sources.applier === undefined) {
    createApplier(sources);
  }
  if (!applyThemeInEntry(sources.entry)) {
    return unsupported(
      `${ENTRY_FILE} default-exports no module with a setup() to call applyTheme() from`,
    );
  }
  const diagnostics = syntaxErrors(sources);
  return diagnostics.length > 0
    ? { ok: false, error: { code: "typecheck_failed", diagnostics } }
    : undefined;
}

function stageFiles(
  sources: ThemeSources,
  draft: ThemeDraft,
  staged: StagedLogo[],
): FileBatch {
  const { layer } = sources;
  const batch = new FileBatch();
  batch.write(
    layerPath(layer, THEME_FILES.stylesheet),
    emitStylesheet(draft.variables),
  );
  batch.write(
    layerPath(layer, THEME_FILES.appConfig),
    sources.appConfig.getFullText(),
  );
  batch.write(layerPath(layer, ENTRY_FILE), sources.entry.getFullText());
  const applier = sources.project.getSourceFile(layerPath(layer, APPLIER_FILE));
  if (sources.applier === undefined && applier) {
    batch.write(layerPath(layer, APPLIER_FILE), applier.getFullText());
  }
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
    ...validateLogos(draft.logos),
    ...uploadIssues,
  ];
}

function writeTheme(
  sources: ThemeSources,
  draft: ThemeDraft,
  staged: StagedLogo[],
): OpResult<{ version: string }> {
  const previous = readLogos(sources.appConfig);
  const edited = editSources(sources, draft, staged);
  if (edited) {
    return edited;
  }
  const batch = stageFiles(sources, draft, staged);
  const next = readLogos(sources.appConfig);
  for (const orphan of orphanedAssets(sources.layer, previous, next)) {
    batch.remove(orphan);
  }
  const changes = batch.flush();
  const written = openLayer(sources.layer);
  const version = isFailure(written) ? "" : written.version;
  return { ok: true, data: { version }, changes };
}

/**
 * Write the project's theme: the stylesheet, the logo paths of the app
 * config, the uploaded logos, and — the first time — the applier and the
 * entry's call to it. Everything is checked before anything is written, and
 * the builder's own logos the theme stops pointing at are deleted with it.
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
