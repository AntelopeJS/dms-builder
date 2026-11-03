import fs from "node:fs";
import path from "node:path";

/** What one table of a stand-in database answers: its points once awaited, and its row count. */
export interface TableAnswer {
  points: { x: string | number; y: number }[];
  count: number;
}

/** The tables of a stand-in database, by schema id, then table name. */
export type DatabaseAnswers = Record<string, Record<string, TableAnswer>>;

const PACKAGE = path.join("node_modules", "@antelopejs", "interface-database");

/**
 * The `@antelopejs/interface-database` a module of the fixture resolves: a package in the module's
 * own `node_modules`, standing in for the provider its project entry binds it to. Its `Schema`
 * keeps its own registry, as each provider's instance does, so a reader that resolves the package
 * from anywhere else never sees these tables.
 */
export function installModuleDatabase(
  moduleRoot: string,
  answers: DatabaseAnswers,
): void {
  const root = path.join(moduleRoot, PACKAGE);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@antelopejs/interface-database",
      main: "index.js",
    }),
  );
  fs.writeFileSync(
    path.join(root, "index.js"),
    `const answers = ${JSON.stringify(answers)};
function table(answer) {
  const handle = {
    then: (resolve) => resolve(answer.points),
    count: () => ({ then: (resolve) => resolve(answer.count) }),
  };
  for (const step of ["filter", "map", "group", "orderBy", "slice"]) {
    handle[step] = () => handle;
  }
  return handle;
}
class Schema {
  static get(id) {
    const tables = answers[id];
    if (!tables) {
      return undefined;
    }
    const instance = { table: (name) => table(tables[name]) };
    return { instance: () => instance };
  }
}
exports.Schema = Schema;
`,
  );
}
