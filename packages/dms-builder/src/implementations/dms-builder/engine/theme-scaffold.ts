import fs from "node:fs";
import path from "node:path";
import type {
  FileChange,
  OpResult,
  ThemeLayer,
} from "@antelopejs/interface-dms-builder";
import {
  type FunctionDeclaration,
  Node,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import { FileBatch } from "./file-batch";
import { commit } from "./ops";
import { resolveProjectRoot } from "./project";
import {
  ENTRY_FILE,
  SCAFFOLD_ENTRY_SOURCE,
  STYLESHEET_FILE,
} from "./theme-entry";
import { proposedLayerPath, resolveThemeLayer } from "./theme-layer";
import {
  getWritableProject,
  refreshFromDisk,
  resolveRootBarrel,
  Transaction,
} from "./writable";

/**
 * The priority the layer registers with: above the DMS, which registers at 0,
 * so the project's values win over the DMS defaults wherever both set one.
 */
const LAYER_PRIORITY = 1;

const START_FUNCTION = "start";
const PATH_MODULE = "node:path";
const PATH_BINDING = "path";
const PAGE_INTERFACE = "@antelopejs/interface-dms/page";
const REGISTER_FUNCTION = "AddFrontendModule";
const LOADER_PACKAGE = "@antelopejs/dms-frontend";
const LAYER_NAME_SUFFIX = "-frontend";
const FALLBACK_PROJECT_NAME = "project";
const PACKAGE_NAME_CHARACTERS = /[^a-z0-9-]+/g;

interface PackageManifest {
  name?: string;
  main?: string;
  version?: string;
}

function readManifest(directory: string): PackageManifest | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(directory, "package.json"), "utf8"),
    ) as PackageManifest;
  } catch {
    return undefined;
  }
}

/** The layer's package name, after the project's: `shop` gives `shop-frontend`. */
function layerName(root: string): string {
  const projectName = (readManifest(root)?.name ?? FALLBACK_PROJECT_NAME)
    .split("/")
    .pop()
    ?.toLowerCase()
    .replace(PACKAGE_NAME_CHARACTERS, "-");
  return `${projectName || FALLBACK_PROJECT_NAME}${LAYER_NAME_SUFFIX}`;
}

const RELEASE = /^(\d+)\.(\d+)\.(\d+)/;

/**
 * The loader releases the layer runs on: from the one the project installs —
 * which applies the layer's app config, as older ones did not — up to the
 * next breaking release, the range the loader asks every module to declare.
 * Left out when the project installs none the builder can read.
 */
function loaderRange(root: string): string | undefined {
  const version = readManifest(
    path.join(root, "node_modules", LOADER_PACKAGE),
  )?.version;
  const release = version ? RELEASE.exec(version) : null;
  if (!release) {
    return undefined;
  }
  const [, major, minor] = release.map(Number);
  const floor = release.slice(1).join(".");
  return major === 0
    ? `>=${floor} <0.${(minor ?? 0) + 1}.0`
    : `>=${floor} <${(major ?? 0) + 1}.0.0`;
}

function layerManifest(root: string, name: string): string {
  const manifest: Record<string, unknown> = {
    name,
    version: "0.0.0",
    private: true,
    type: "module",
    main: `./${ENTRY_FILE}`,
  };
  const range = loaderRange(root);
  if (range) {
    manifest.engines = { [LOADER_PACKAGE]: range };
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Where the project's entry runs from once built: the directory of its
 * package's `main`, which `__dirname` names at run time. A project without
 * one runs its sources in place.
 */
function runtimeDirectory(root: string, barrel: SourceFile): string {
  const main = readManifest(root)?.main;
  return main
    ? path.dirname(path.resolve(root, main))
    : path.dirname(barrel.getFilePath());
}

/** The name the barrel binds `node:path` to, importing it when it does not. */
function pathBinding(barrel: SourceFile): string | undefined {
  const declaration = barrel.getImportDeclaration(
    (candidate) =>
      candidate.getModuleSpecifierValue() === PATH_MODULE ||
      candidate.getModuleSpecifierValue() === PATH_BINDING,
  );
  if (declaration) {
    return (
      declaration.getDefaultImport()?.getText() ??
      declaration.getNamespaceImport()?.getText()
    );
  }
  if (barrel.getLocal(PATH_BINDING)) {
    return undefined;
  }
  barrel.insertImportDeclaration(0, {
    moduleSpecifier: PATH_MODULE,
    defaultImport: PATH_BINDING,
  });
  return PATH_BINDING;
}

function importRegister(barrel: SourceFile): void {
  const declaration = barrel.getImportDeclaration(
    (candidate) => candidate.getModuleSpecifierValue() === PAGE_INTERFACE,
  );
  const named = declaration?.getNamedImports() ?? [];
  if (named.some((specifier) => specifier.getName() === REGISTER_FUNCTION)) {
    return;
  }
  if (declaration && !declaration.isTypeOnly()) {
    declaration.addNamedImport(REGISTER_FUNCTION);
    return;
  }
  barrel.addImportDeclaration({
    moduleSpecifier: PAGE_INTERFACE,
    namedImports: [REGISTER_FUNCTION],
  });
}

/**
 * The project's exported `start()`, made async so it can await the
 * registration; added at the end of the file when the project has none.
 */
function startFunction(barrel: SourceFile): FunctionDeclaration | undefined {
  const existing = barrel.getFunction(START_FUNCTION);
  if (!existing) {
    if (barrel.getLocal(START_FUNCTION)) {
      return undefined;
    }
    return barrel.addFunction({
      name: START_FUNCTION,
      isExported: true,
      isAsync: true,
      returnType: "Promise<void>",
    });
  }
  if (!existing.isExported() || !existing.getBody()) {
    return undefined;
  }
  if (!existing.isAsync()) {
    existing.setIsAsync(true);
    const returnType = existing.getReturnTypeNode();
    if (returnType?.getKind() === SyntaxKind.VoidKeyword) {
      existing.setReturnType("Promise<void>");
    }
  }
  return existing;
}

/** Whether `start()` registers a frontend module from this directory already. */
function registersLayer(start: FunctionDeclaration, relative: string): boolean {
  return start
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some(
      (call) =>
        call.getExpression().getText() === REGISTER_FUNCTION &&
        call
          .getArguments()
          .some(
            (argument) =>
              Node.isObjectLiteralExpression(argument) &&
              argument.getText().includes(JSON.stringify(relative)),
          ),
    );
}

/**
 * Register the layer from the project's `start()`, which runs once the DMS is
 * connected — as the builder registers its own frontend. Answers false when
 * the entry has no `start()` it can add the call to.
 */
function registerLayer(
  barrel: SourceFile,
  root: string,
  layerDirectory: string,
  name: string,
): boolean {
  const relative = path
    .relative(runtimeDirectory(root, barrel), layerDirectory)
    .split(path.sep)
    .join("/");
  const start = startFunction(barrel);
  const pathName = start ? pathBinding(barrel) : undefined;
  if (!start || !pathName) {
    return false;
  }
  if (registersLayer(start, relative)) {
    return true;
  }
  importRegister(barrel);
  start.addStatements((writer) => {
    writer.write(`await ${REGISTER_FUNCTION}(`).inlineBlock(() => {
      writer.writeLine(`name: ${JSON.stringify(name)},`);
      writer.writeLine(
        `sourcePath: ${pathName}.join(__dirname, ${JSON.stringify(relative)}),`,
      );
      writer.writeLine(`renderer: { name: "vue", version: "3" },`);
      writer.writeLine(`priority: ${LAYER_PRIORITY},`);
    });
    writer.write(");");
  });
  return true;
}

/**
 * The layer's own files, those it lacks: nothing already there is replaced.
 * The stylesheet the entry imports starts empty, so the import resolves
 * before the first theme is saved.
 */
function stageLayerFiles(layerDirectory: string, name: string): FileBatch {
  const batch = new FileBatch();
  const files: Array<[string, string]> = [
    ["package.json", layerManifest(resolveProjectRoot(), name)],
    [ENTRY_FILE, SCAFFOLD_ENTRY_SOURCE],
    [STYLESHEET_FILE, ""],
  ];
  for (const [relative, content] of files) {
    const filePath = path.join(layerDirectory, relative);
    if (!fs.existsSync(filePath)) {
      batch.write(filePath, content);
    }
  }
  return batch;
}

function unsupported(detail: string): OpResult<never> {
  return { ok: false, error: { code: "unsupported", detail } };
}

/**
 * Create the project's frontend layer — `frontend-vue/` beside its sources,
 * with an entry and a manifest — and register it from its `start()` above the
 * DMS. Files already in the directory are kept; a `start()` that registers
 * the directory already is left as it is.
 */
export function scaffoldThemeLayer(): OpResult<ThemeLayer> {
  const root = resolveProjectRoot();
  const layerDirectory = proposedLayerPath();
  const name = layerName(root);
  const project = getWritableProject();
  refreshFromDisk(project);
  const barrel = resolveRootBarrel(project);
  if (!barrel) {
    return unsupported(
      "the project has no src/index.ts to register a frontend layer from",
    );
  }
  const transaction = new Transaction(project);
  transaction.track(barrel);
  if (!registerLayer(barrel, root, layerDirectory, name)) {
    transaction.rollback();
    return unsupported(
      `${path.relative(root, barrel.getFilePath())} has no exported start() function the builder can register the layer from`,
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
  const written: FileChange[] = stageLayerFiles(layerDirectory, name).flush();
  const registered = commit(transaction, { name, sourcePath: layerDirectory });
  return registered.ok
    ? { ...registered, changes: [...written, ...registered.changes] }
    : registered;
}

/**
 * Give the project the frontend layer its theme is written to. A project that
 * has a layer already keeps it, and nothing is written.
 */
export async function createThemeLayer(): Promise<OpResult<ThemeLayer>> {
  const existing = await resolveThemeLayer();
  return existing
    ? { ok: true, data: existing, changes: [] }
    : scaffoldThemeLayer();
}
