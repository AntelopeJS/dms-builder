import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { ConfigureProject } from "../implementations/dms-builder";
import { setProjectVariable } from "../implementations/dms-builder/engine/project-env";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 60_000;
const VARIABLE = "ERP_DATABASE_URL";
const URL = "postgres://reader:secret@db.example:5432/erp";

let app: Fixture;

function envFile(): string {
  return path.join(app.root, ".env");
}

function refusal(write: () => void): string {
  try {
    write();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("the write was expected to be refused");
}

/** The URL the builder's form takes goes to a `.env` git ignores, and nowhere else. */
describe("a project variable written by the builder", function () {
  this.timeout(OP_TIMEOUT);

  before(async () => {
    app = createFixture({ modules: ["erp-tables"] });
    spawnSync("git", ["init", "-q"], { cwd: app.root });
    const wired = await ConfigureProject([
      {
        op: "ConfigureModule",
        id: "erp-tables",
        entry: { config: { mode: "external" }, env: { url: VARIABLE } },
      },
    ]);
    expectOk(wired, "ConfigureProject");
  });

  after(destroyFixture);

  it("refuses while git does not ignore .env", () => {
    expect(refusal(() => setProjectVariable(VARIABLE, URL))).to.match(
      /not ignored by git/,
    );
    expect(fs.existsSync(envFile())).to.equal(false);
  });

  it("refuses a variable envOverrides does not map", () => {
    fs.writeFileSync(path.join(app.root, ".gitignore"), ".env\n");
    expect(refusal(() => setProjectVariable("OTHER_URL", URL))).to.match(
      /not in the configuration's envOverrides/,
    );
  });

  it("writes the variable once git ignores .env, and replaces it on the next write", () => {
    fs.writeFileSync(envFile(), "KEEP=1\n");
    setProjectVariable(VARIABLE, URL);
    setProjectVariable(VARIABLE, `${URL}?sslmode=require`);
    expect(fs.readFileSync(envFile(), "utf8")).to.equal(
      `KEEP=1\n${VARIABLE}="${URL}?sslmode=require"\n`,
    );
  });

  it("writes a value holding $ patterns as it is, when it replaces a line", () => {
    const value = "postgres://u:pa$$w$&rd$'@h/db";
    setProjectVariable(VARIABLE, value);
    expect(fs.readFileSync(envFile(), "utf8")).to.equal(
      `KEEP=1\n${VARIABLE}="${value}"\n`,
    );
  });

  it("refuses a value that would break out of its quotes", () => {
    expect(refusal(() => setProjectVariable(VARIABLE, 'x"\nOTHER=1'))).to.match(
      /quote or a line break/,
    );
  });
});
