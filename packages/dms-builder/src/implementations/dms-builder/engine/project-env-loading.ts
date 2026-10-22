import type { SourceFile } from "ts-morph";
import type { ConfigDraft } from "./project-config";

const LOADS_ENV_FILE = /\bloadEnvFile\b|\bdotenv\b/;
const ENV_FILE_CONSTANT = "projectEnvFile";
const ESM_CONFIG = /\.mts$/;

interface NamedImport {
  module: string;
  aliases: string[];
  name: string;
}

const IMPORTS: NamedImport[] = [
  { module: "node:fs", aliases: ["node:fs", "fs"], name: "existsSync" },
  { module: "node:path", aliases: ["node:path", "path"], name: "join" },
];

/** Imports `wanted` at `index` unless the file imports it already; answers the next index. */
function ensureNamedImport(
  file: SourceFile,
  wanted: NamedImport,
  index: number,
): number {
  const existing = file.getImportDeclaration((declaration) =>
    wanted.aliases.includes(declaration.getModuleSpecifierValue()),
  );
  if (!existing) {
    file.insertImportDeclaration(index, {
      moduleSpecifier: wanted.module,
      namedImports: [wanted.name],
    });
    return index + 1;
  }
  const named = existing
    .getNamedImports()
    .map((specifier) => specifier.getName());
  if (!named.includes(wanted.name)) {
    existing.addNamedImport(wanted.name);
  }
  return index;
}

function loadingText(draft: ConfigDraft): string {
  const directory = ESM_CONFIG.test(draft.path)
    ? "import.meta.dirname"
    : "__dirname";
  return [
    `const ${ENV_FILE_CONSTANT} = join(${directory}, ".env");`,
    `if (existsSync(${ENV_FILE_CONSTANT})) {`,
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
  IMPORTS.reduce(
    (index, wanted) => ensureNamedImport(draft.file, wanted, index),
    0,
  );
  const imports = draft.file.getImportDeclarations();
  const position = imports[imports.length - 1].getEnd();
  draft.file.insertText(position, `\n\n${loadingText(draft)}`);
}
