import fs from "node:fs";
import path from "node:path";
import { setModuleConfig } from "../config";
import { invalidateCatalog } from "../implementations/dms-builder/engine/catalog";
import { invalidateInference } from "../implementations/dms-builder/engine/catalog-inference";
import { invalidateResourceIndex } from "../implementations/dms-builder/engine/resource-index";
import { invalidateSourceIndex } from "../implementations/dms-builder/engine/source-index";
import { resetWritableProject } from "../implementations/dms-builder/engine/writable";

/**
 * A throwaway app for the engine to rewrite.
 *
 * It lives inside the repository rather than in the system temp directory
 * because the code the engine emits imports `@antelopejs-private/cms` and the
 * Antelope interfaces: only a fixture under this package resolves them, and a
 * fixture whose imports do not resolve fails every operation on `typecheck_failed`
 * rather than on what the test is about.
 */
const FIXTURE_ROOT = path.join(__dirname, "..", "..", ".test-app");

// Resolved the way the playground resolves: the DMS interfaces publish their
// subpaths through `exports` alone, which `moduleResolution: "node"` never reads.
const TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "preserve",
    moduleResolution: "bundler",
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
  },
  include: ["src"],
};

export interface Fixture {
  /** Absolute path of the app root the engine is pointed at. */
  root: string;
  /** Read an emitted file, relative to the app's `src`. */
  read(relativePath: string): string;
  /** Whether an emitted file exists, relative to the app's `src`. */
  exists(relativePath: string): boolean;
  /**
   * Overwrite an emitted file — how a suite stands in for a developer editing
   * generated code by hand.
   */
  write(relativePath: string, content: string): void;
}

/**
 * Point the engine at an empty app. Every cached index is dropped first: the
 * project, the source and resource indexes and the catalog are all resolved once
 * per process, so a suite that skipped this would read the previous test's app.
 */
export function createFixture(): Fixture {
  fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(FIXTURE_ROOT, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURE_ROOT, "tsconfig.json"),
    `${JSON.stringify(TSCONFIG, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(FIXTURE_ROOT, "src", "index.ts"), "export {};\n");

  resetWritableProject();
  invalidateSourceIndex();
  invalidateResourceIndex();
  invalidateCatalog();
  invalidateInference();
  setModuleConfig({ projectRoot: FIXTURE_ROOT });

  return {
    root: FIXTURE_ROOT,
    read: (relativePath) =>
      fs.readFileSync(path.join(FIXTURE_ROOT, "src", relativePath), "utf8"),
    exists: (relativePath) =>
      fs.existsSync(path.join(FIXTURE_ROOT, "src", relativePath)),
    write: (relativePath, content) =>
      fs.writeFileSync(path.join(FIXTURE_ROOT, "src", relativePath), content),
  };
}

export function destroyFixture(): void {
  fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  resetWritableProject();
  setModuleConfig({});
}

/**
 * Unwrap a successful result, or fail with the engine's own error. Every
 * operation answers `OpResult`, so a test that forgot to check would otherwise
 * assert against `undefined` and report the wrong thing.
 */
export function expectOk<T>(
  result: { ok: true; data: T } | { ok: false; error: unknown },
  label: string,
): T {
  if (!result.ok) {
    throw new Error(`${label} failed: ${JSON.stringify(result.error)}`);
  }
  return result.data;
}
