import type { SourceFile } from "ts-morph";

/** The layer's entry, the one file every frontend module has. */
export const ENTRY_FILE = "dms.frontend.ts";

/** The theme's stylesheet, relative to the layer. */
export const STYLESHEET_FILE = "app/assets/css/theme.css";

/** How the entry names the stylesheet it imports. */
const STYLESHEET_SPECIFIER = `./${STYLESHEET_FILE}`;

/**
 * The entry of a layer the builder creates for a project that has none: it
 * registers nothing, and imports the theme's stylesheet as the theming guide
 * has a layer do. Its app config needs no import: the loader applies every
 * layer's `app/app.config.ts` itself.
 */
export const SCAFFOLD_ENTRY_SOURCE = `import "${STYLESHEET_SPECIFIER}";
import type { DmsFrontendModule } from "#dms/frontend-module";

/**
 * The project's own frontend layer, above the DMS: where its theme lives —
 * the stylesheet imported above, \`app/app.config.ts\` and \`public/\` — and
 * where its own pages and components can be registered.
 */
const projectFrontend: DmsFrontendModule = {
  setup() {},
};

export default projectFrontend;
`;

/** Whether the entry imports the theme's stylesheet. */
export function importsStylesheet(entry: SourceFile): boolean {
  return entry
    .getImportDeclarations()
    .some(
      (declaration) =>
        declaration.getModuleSpecifierValue() === STYLESHEET_SPECIFIER,
    );
}

/**
 * Make the entry import the theme's stylesheet, after the imports it already
 * has. A stylesheet reaches the dashboard only through a module that imports
 * it: the loader discovers `public/` and the app config on its own, but no
 * stylesheet.
 */
export function importStylesheet(entry: SourceFile): void {
  if (!importsStylesheet(entry)) {
    entry.addImportDeclaration({ moduleSpecifier: STYLESHEET_SPECIFIER });
  }
}
