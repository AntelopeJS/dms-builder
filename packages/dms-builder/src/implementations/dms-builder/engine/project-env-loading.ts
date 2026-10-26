import { type SourceFile, SyntaxKind } from "ts-morph";
import type { ConfigDraft } from "./project-config";

const LOADS_ENV_FILE = /\bloadEnvFile\b|\bdotenv\b/;
const ENV_FILE_CONSTANT = "projectEnvFile";
const ESM_CONFIG = /\.mts$/;

interface NamedImport {
  module: string;
  aliases: string[];
  name: string;
  /** The local name used when `name` is taken in the file already. */
  fallback: string;
}

const EXISTS: NamedImport = {
  module: "node:fs",
  aliases: ["node:fs", "fs"],
  name: "existsSync",
  fallback: "envFileExists",
};
const JOIN: NamedImport = {
  module: "node:path",
  aliases: ["node:path", "path"],
  name: "join",
  fallback: "joinEnvPath",
};

function importsUnaliased(file: SourceFile, wanted: NamedImport): boolean {
  return file
    .getImportDeclarations()
    .filter((declaration) =>
      wanted.aliases.includes(declaration.getModuleSpecifierValue()),
    )
    .some((declaration) =>
      declaration
        .getNamedImports()
        .some(
          (specifier) =>
            specifier.getName() === wanted.name && !specifier.getAliasNode(),
        ),
    );
}

function usesName(file: SourceFile, name: string): boolean {
  return file
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some((identifier) => identifier.getText() === name);
}

interface ImportedName {
  local: string;
  inserted: boolean;
}

/**
 * The local name `wanted` goes by once imported: an import the file has already, or a new
 * declaration of its own at `index`, so an existing namespace or aliased import is left as it is.
 */
function ensureNamedImport(
  file: SourceFile,
  wanted: NamedImport,
  index: number,
): ImportedName {
  if (importsUnaliased(file, wanted)) {
    return { local: wanted.name, inserted: false };
  }
  const local = usesName(file, wanted.name) ? wanted.fallback : wanted.name;
  file.insertImportDeclaration(index, {
    moduleSpecifier: wanted.module,
    namedImports: [
      local === wanted.name ? wanted.name : { name: wanted.name, alias: local },
    ],
  });
  return { local, inserted: true };
}

function loadingText(draft: ConfigDraft, exists: string, join: string): string {
  const directory = ESM_CONFIG.test(draft.path)
    ? "import.meta.dirname"
    : "__dirname";
  return [
    `const ${ENV_FILE_CONSTANT} = ${join}(${directory}, ".env");`,
    `if (${exists}(${ENV_FILE_CONSTANT})) {`,
    `${draft.unit}process.loadEnvFile(${ENV_FILE_CONSTANT});`,
    "}",
  ].join("\n");
}

/**
 * Makes the configuration load the project's `.env`, when it names a variable and does not load
 * one already. Core does not read `.env`, and a variable the builder writes there would otherwise
 * never reach the configuration in development.
 */
export function ensureEnvFileLoaded(draft: ConfigDraft): void {
  if (
    draft.variables.length === 0 ||
    LOADS_ENV_FILE.test(draft.file.getFullText())
  ) {
    return;
  }
  const exists = ensureNamedImport(draft.file, EXISTS, 0);
  const join = ensureNamedImport(draft.file, JOIN, exists.inserted ? 1 : 0);
  const imports = draft.file.getImportDeclarations();
  const position = imports[imports.length - 1].getEnd();
  draft.file.insertText(
    position,
    `\n\n${loadingText(draft, exists.local, join.local)}`,
  );
}
