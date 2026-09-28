import { type Block, Node, type SourceFile } from "ts-morph";
import { defaultExportObject } from "./theme-literals";

/** The layer's entry, the one file every frontend module has. */
export const ENTRY_FILE = "dms.frontend.ts";

/** The module the builder writes to apply the theme, relative to the layer. */
export const APPLIER_FILE = "app/theme.ts";

const APPLIER_SPECIFIER = "./app/theme";
const APPLIER_FUNCTION = "applyTheme";
const APPLIER_CALL = `${APPLIER_FUNCTION}();`;
const SETUP_METHOD = "setup";
const WHITESPACE = /\s/g;
const EMPTY_BLOCK = "{}";

/**
 * The applier the builder writes the first time it saves a theme.
 *
 * A layer's stylesheet and app config reach the dashboard only through its
 * entry: the loader discovers `public/` on its own, but nothing else. The
 * applier imports the stylesheet and merges the app config; the entry calls
 * it first thing in `setup`, which the loader runs in priority order, so the
 * project's values are in place before the DMS merges its defaults under them.
 */
export const APPLIER_SOURCE = `import "./assets/css/theme.css";
import { useDmsAppConfig } from "#dms/frontend-module";
import { defu } from "defu";
import appConfig from "./app.config";

/**
 * Apply this layer's theme: the stylesheet imported above, and the app config
 * merged in before the modules set up after this one fill in their defaults.
 * Written by the dms-builder theme editor.
 */
export function applyTheme(): void {
  const runtimeAppConfig = useDmsAppConfig();
  Object.assign(runtimeAppConfig, defu(runtimeAppConfig, appConfig));
}
`;

function functionBody(node: Node | undefined): Block | undefined {
  const body =
    Node.isArrowFunction(node) || Node.isFunctionExpression(node)
      ? node.getBody()
      : undefined;
  return Node.isBlock(body) ? body : undefined;
}

function setupBody(entry: SourceFile): Block | undefined {
  const setup = defaultExportObject(entry)?.getProperty(SETUP_METHOD);
  if (Node.isMethodDeclaration(setup)) {
    const body = setup.getBody();
    return Node.isBlock(body) ? body : undefined;
  }
  return Node.isPropertyAssignment(setup)
    ? functionBody(setup.getInitializer())
    : undefined;
}

function importsApplier(entry: SourceFile): boolean {
  return entry
    .getImportDeclarations()
    .some(
      (declaration) =>
        declaration.getModuleSpecifierValue() === APPLIER_SPECIFIER &&
        declaration
          .getNamedImports()
          .some((specifier) => specifier.getName() === APPLIER_FUNCTION),
    );
}

function callsApplier(body: Block): boolean {
  return body
    .getStatements()
    .some((statement) => statement.getText() === APPLIER_CALL);
}

/**
 * Put the call first in `setup`. An empty `setup() {}` is rewritten whole:
 * inserting into it would leave the closing brace on the call's line.
 */
function insertApplierCall(body: Block): void {
  if (body.getText().replace(WHITESPACE, "") === EMPTY_BLOCK) {
    body.replaceWithText((writer) =>
      writer.block(() => writer.write(APPLIER_CALL)),
    );
    return;
  }
  body.insertStatements(0, APPLIER_CALL);
}

/** Whether the entry imports the applier and calls it from its `setup`. */
export function isThemeApplied(entry: SourceFile): boolean {
  const body = setupBody(entry);
  return importsApplier(entry) && body !== undefined && callsApplier(body);
}

/**
 * Make the entry apply the theme, adding only what it lacks: the import, and
 * the call as the first statement of `setup`. Answers false when the entry
 * default-exports no module whose `setup` the builder can find.
 */
export function applyThemeInEntry(entry: SourceFile): boolean {
  const body = setupBody(entry);
  if (!body) {
    return false;
  }
  if (!callsApplier(body)) {
    insertApplierCall(body);
  }
  if (!importsApplier(entry)) {
    entry.addImportDeclaration({
      moduleSpecifier: APPLIER_SPECIFIER,
      namedImports: [APPLIER_FUNCTION],
    });
  }
  return true;
}
