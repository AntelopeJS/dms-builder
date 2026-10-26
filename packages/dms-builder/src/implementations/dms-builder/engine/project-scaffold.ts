import fs from "node:fs";
import path from "node:path";
import { DEFAULT_COMPILER_OPTIONS, resolveProjectRoot } from "./project";

const INTERFACE_PACKAGE = /^@antelopejs\/interface-/;
/**
 * The interface packages the code the builder writes imports, at the builder's own ranges: a
 * module it scaffolds depends on them, so what it later writes there resolves and builds once the
 * restart that follows has installed them. The project's own range wins for one it declares.
 */
export const BUILDER_CODE_INTERFACES: Readonly<Record<string, string>> = {
  "@antelopejs/interface-api": ">=0.0.15 <1.0.0",
  "@antelopejs/interface-core": ">=0.2.4 <1.0.0",
  "@antelopejs/interface-data-api": ">=0.4.0 <1.0.0",
  "@antelopejs/interface-database": ">=0.1.11 <1.0.0",
  "@antelopejs/interface-database-decorators": ">=0.1.10 <1.0.0",
  "@antelopejs/interface-dms": ">=0.9.0 <1.0.0",
};
/** The build tooling a module needs, at these ranges when the project does not declare its own. */
const DEFAULT_TOOLING: Readonly<Record<string, string>> = {
  typescript: "^6.0.3",
  rimraf: "^6.1.3",
  "@types/node": "^24.0.0",
};
const ENTRY_TEXT =
  "export function construct(): void {}\n\nexport async function start(): Promise<void> {}\n";

/** A module about to be created: its files, by absolute path, and the source its entry names. */
export interface Scaffold {
  id: string;
  root: string;
  entryFile: string;
  entryText: string;
  files: Map<string, string>;
  source: Record<string, unknown>;
}

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
}

interface TsConfig {
  compilerOptions?: Record<string, unknown>;
}

class ScaffoldRefusal extends Error {}

function readJson<T>(file: string, fallback: T): T {
  return fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf8")) as T)
    : fallback;
}

function picked(
  versions: Record<string, string> | undefined,
  keep: (name: string) => boolean,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(versions ?? {}).filter(([name]) => keep(name)),
  );
}

/** The module's manifest: the project's interface dependencies and build tooling, at its ranges. */
function manifestText(id: string, project: PackageManifest): string {
  const all = { ...project.devDependencies, ...project.dependencies };
  const manifest = {
    name: id,
    version: "0.0.1",
    private: true,
    main: "dist/index.js",
    scripts: { build: "rimraf dist && tsc", typecheck: "tsc --noEmit" },
    dependencies: {
      ...BUILDER_CODE_INTERFACES,
      ...picked(all, (name) => INTERFACE_PACKAGE.test(name)),
    },
    devDependencies: {
      ...DEFAULT_TOOLING,
      ...picked(all, (name) => name in DEFAULT_TOOLING),
    },
    packageManager: project.packageManager,
    antelopeJs: { baseUrl: "dist" },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** The project's compiler options, so the module compiles as the project does. */
function tsconfigText(project: TsConfig): string {
  const compilerOptions = {
    ...project.compilerOptions,
    rootDir: "src",
    outDir: "dist",
    tsBuildInfoFile: undefined,
  };
  return `${JSON.stringify({ compilerOptions, include: ["src/**/*.ts"] }, null, 2)}\n`;
}

/**
 * The files of a new local module at `relativePath` under the project, and the source its entry
 * names: watched and rebuilt on change, as the project's own module is. Refused when the path
 * leaves the project or already exists.
 */
export function scaffoldLocalModule(
  id: string,
  relativePath: string,
): Scaffold {
  const projectRoot = resolveProjectRoot();
  const root = path.resolve(projectRoot, relativePath);
  if (!root.startsWith(projectRoot + path.sep)) {
    throw new ScaffoldRefusal(
      `module path "${relativePath}" leaves the project`,
    );
  }
  if (fs.existsSync(root)) {
    throw new ScaffoldRefusal(`module path "${relativePath}" already exists`);
  }
  const project = readJson<PackageManifest>(
    path.join(projectRoot, "package.json"),
    {},
  );
  const tsconfig = readJson<TsConfig>(path.join(projectRoot, "tsconfig.json"), {
    compilerOptions: DEFAULT_COMPILER_OPTIONS,
  });
  return {
    id,
    root,
    entryFile: path.join(root, "src", "index.ts"),
    entryText: ENTRY_TEXT,
    files: new Map([
      [path.join(root, "package.json"), manifestText(id, project)],
      [path.join(root, "tsconfig.json"), tsconfigText(tsconfig)],
    ]),
    source: {
      type: "local",
      path: path.relative(projectRoot, root),
      watchDir: ["src"],
      installCommand: ["pnpm install", "pnpm run build"],
      reloadCommand: ["pnpm exec tsc"],
    },
  };
}

export function isScaffoldRefusal(error: unknown): error is ScaffoldRefusal {
  return error instanceof ScaffoldRefusal;
}
