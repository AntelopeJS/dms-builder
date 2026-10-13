import { expect } from "chai";
import { Project } from "ts-morph";
import {
  ConfigureResource,
  CreateResource,
  GetCatalog,
  GetResourceStructure,
  ListResources,
} from "../implementations/dms-builder";
import { tableIconsSupported } from "../implementations/dms-builder/engine/catalog";
import {
  readTableIcon,
  writeTableIcon,
} from "../implementations/dms-builder/engine/resource-icon";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const DATA_API_FILE = "ticket/data-api.ts";
const OP_TIMEOUT = 60_000;
const TICKET_ICON = "i-ph-ticket";
const REGISTER = "@RegisterDataController()\n";
const TABLE_VIEW_MODULE = "@antelopejs/interface-dms/base/table-view";

/** A data-api file as a developer writes one, its icon decorator aside. */
const CONTROLLER = `import { Controller } from "@antelopejs/interface-api";
import { DataController, RegisterDataController } from "@antelopejs/interface-data-api";
import { Column } from "${TABLE_VIEW_MODULE}";

@RegisterDataController()
export class ticketDataAPI extends DataController(Ticket, {}, Controller("/api/ticket")) {
  @Column({ name: "Title" }) declare title: string;
}
`;

function controllerFile(text = CONTROLLER) {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("data-api.ts", text);
  return { file, apiClass: file.getClassOrThrow("ticketDataAPI") };
}

/** The names a file imports from the table-view module. */
function tableViewImports(text: string): string[] {
  const { file } = controllerFile(text);
  return file
    .getImportDeclarations()
    .filter((entry) => entry.getModuleSpecifierValue() === TABLE_VIEW_MODULE)
    .flatMap((entry) =>
      entry.getNamedImports().map((named) => named.getName()),
    );
}

describe("a table's icon", () => {
  describe("in the data-api file", () => {
    it("goes under the controller's registration, its import beside the others", () => {
      const { file, apiClass } = controllerFile();
      writeTableIcon(file, apiClass, TICKET_ICON);
      const text = file.getFullText();
      expect(text).to.contain(`${REGISTER}@TableIcon("${TICKET_ICON}")\n`);
      expect(tableViewImports(text)).to.deep.equal(["Column", "TableIcon"]);
      expect(readTableIcon(apiClass)).to.equal(TICKET_ICON);
    });

    it("is replaced in place, and taken off with its import", () => {
      const { file, apiClass } = controllerFile();
      writeTableIcon(file, apiClass, TICKET_ICON);
      writeTableIcon(file, apiClass, "i-ph-lifebuoy");
      expect(file.getFullText().match(/@TableIcon/g)).to.have.length(1);
      expect(readTableIcon(apiClass)).to.equal("i-ph-lifebuoy");

      writeTableIcon(file, apiClass, null);
      expect(file.getFullText()).to.equal(CONTROLLER);
      expect(readTableIcon(apiClass)).to.equal(undefined);
    });

    it("leaves the import alone when the file uses it elsewhere", () => {
      const text = CONTROLLER.replace(
        "import { Column }",
        "import { Column, TableIcon }",
      ).replace(REGISTER, `${REGISTER}@TableIcon("i-ph-ticket")\n`);
      const { file, apiClass } = controllerFile(
        `${text}export const icon = TableIcon;\n`,
      );
      writeTableIcon(file, apiClass, null);
      expect(tableViewImports(file.getFullText())).to.deep.equal([
        "Column",
        "TableIcon",
      ]);
    });

    it("is not read from anything but a literal", () => {
      const { apiClass } = controllerFile(
        CONTROLLER.replace(REGISTER, `${REGISTER}@TableIcon(ICON)\n`),
      );
      expect(readTableIcon(apiClass)).to.equal(undefined);
    });
  });

  describe("on a resource", () => {
    let app: Fixture;

    before(async function () {
      this.timeout(120_000);
      app = createFixture();
      expectOk(
        await CreateResource({
          name: "ticket",
          fields: [{ name: "title", dataType: { $dataType: "string" } }],
        }),
        "CreateResource",
      );
    });

    after(() => destroyFixture());

    it("is absent until the controller declares one", async () => {
      const structure = expectOk(
        await GetResourceStructure("ticket"),
        "GetResourceStructure",
      );
      expect(structure.icon).to.equal(undefined);
    });

    it("is read from the controller, in its structure and in the list", async () => {
      const written = app.read(DATA_API_FILE);
      app.write(
        DATA_API_FILE,
        written.replace(REGISTER, `${REGISTER}@TableIcon("${TICKET_ICON}")\n`),
      );
      const structure = expectOk(
        await GetResourceStructure("ticket"),
        "GetResourceStructure",
      );
      expect(structure.icon).to.equal(TICKET_ICON);
      const listed = (await ListResources()).find(
        (entry) => entry.ref === "ticket",
      );
      expect(listed?.icon).to.equal(TICKET_ICON);
      app.write(DATA_API_FILE, written);
    });

    it("is said in the catalog to be supported, or not, by the DMS", async () => {
      expect((await GetCatalog()).tableIcons).to.equal(tableIconsSupported());
    });

    it("must name an icon", async () => {
      const result = await ConfigureResource("ticket", { icon: "  " });
      expect(result.ok).to.equal(false);
      expect(!result.ok && result.error.code).to.equal("invalid_config");
    });

    it("is refused by a DMS that predates it, and the file is left alone", async function () {
      if (tableIconsSupported()) this.skip();
      const before = app.read(DATA_API_FILE);
      const result = await ConfigureResource("ticket", { icon: TICKET_ICON });
      expect(result.ok).to.equal(false);
      expect(!result.ok && result.error.code).to.equal("unsupported");
      expect(app.read(DATA_API_FILE)).to.equal(before);
    });

    it("is written and taken off by a DMS that takes it", async function () {
      if (!tableIconsSupported()) this.skip();
      this.timeout(OP_TIMEOUT);
      expectOk(
        await ConfigureResource("ticket", { icon: TICKET_ICON }),
        "ConfigureResource",
      );
      expect(app.read(DATA_API_FILE)).to.contain(
        `@TableIcon("${TICKET_ICON}")`,
      );
      expectOk(
        await ConfigureResource("ticket", { icon: null }),
        "ConfigureResource",
      );
      expect(app.read(DATA_API_FILE)).to.not.contain("TableIcon");
    });
  });
});
