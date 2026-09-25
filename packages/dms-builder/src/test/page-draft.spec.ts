import { expect } from "chai";
import {
  AddBlock,
  ConfigureBlock,
  CreateCategory,
  CreatePage,
  GetPageStructure,
  PreviewLayout,
  RemoveBlock,
  SetPageBlocks,
} from "../implementations/dms-builder";
import type { PageStructure } from "@antelopejs/interface-dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/board";
const PAGE_FILE = "board/page.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

async function structure(): Promise<PageStructure> {
  return expectOk(await GetPageStructure(PAGE), "GetPageStructure");
}

/**
 * How a page's block tree is written, previewed and rewritten. The draft is what
 * the data-source work extends — queries join it — so what it guarantees today is
 * pinned here: a preview writes nothing, and a whole-tree write is conditional.
 */
describe("the page draft", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    expectOk(
      await CreatePage({
        name: "board",
        displayName: "Board",
        category: "pages.shop",
      }),
      "CreatePage",
    );
  });

  after(() => destroyFixture());

  describe("editing one block at a time", () => {
    it("adds a static block and addresses it by path", async function () {
      this.timeout(OP_TIMEOUT);
      const added = expectOk(
        await AddBlock({
          page: PAGE,
          name: "revenueKpi",
          type: "KpiCard",
          config: { title: "Revenue" },
        }),
        "AddBlock",
      );

      expect(added.path).to.equal(`${PAGE}#revenueKpi`);
      expect(app.read(PAGE_FILE)).to.contain("static revenueKpi = KpiCard({");

      const [block] = (await structure()).blocks;
      expect(block.name).to.equal("revenueKpi");
      expect(block.type).to.equal("KpiCard");
      expect(block.editable, "a literal config is editable").to.equal(true);
      expect(block.config).to.deep.equal({ title: "Revenue" });
    });

    it("patches a config without disturbing the keys it leaves out", async function () {
      this.timeout(OP_TIMEOUT);
      expectOk(
        await ConfigureBlock(`${PAGE}#revenueKpi`, { icon: "i-ph-coins" }),
        "ConfigureBlock",
      );

      const [block] = (await structure()).blocks;
      expect(block.config).to.deep.equal({
        title: "Revenue",
        icon: "i-ph-coins",
      });
    });

    it("refuses a block type the catalog does not know", async function () {
      this.timeout(OP_TIMEOUT);
      const result = await AddBlock({
        page: PAGE,
        name: "nope",
        type: "NotABlock",
        config: {},
      });

      expect(result.ok).to.equal(false);
      expect(app.read(PAGE_FILE)).to.not.contain("nope");
    });
  });

  describe("previewing a draft", () => {
    it("serializes the draft the way the frontend consumes it", async function () {
      this.timeout(OP_TIMEOUT);
      const preview = expectOk(
        await PreviewLayout(PAGE, {
          blocks: [
            {
              name: "revenueKpi",
              type: "KpiCard",
              config: { title: "Draft title" },
            },
          ],
        }),
        "PreviewLayout",
      );

      expect(preview.components.revenueKpi.componentName).to.equal(
        "dms-kpi-card",
      );
      expect(preview.components.revenueKpi.options).to.deep.equal({
        title: "Draft title",
      });
      expect(preview.degraded).to.deep.equal([]);
    });

    it("previews a form without the field the author has only just added", async function () {
      this.timeout(OP_TIMEOUT);
      const email = {
        id: "email",
        label: "Email",
        type: { $dataType: "string", config: {} },
      };
      const preview = expectOk(
        await PreviewLayout(PAGE, {
          blocks: [
            {
              name: "signup",
              type: "Form",
              // What the panel adds a field as: a label, and no key or type yet.
              config: { fields: [email, { label: "Field 2" }] },
            },
          ],
        }),
        "PreviewLayout",
      );

      expect(preview.degraded).to.deep.equal([]);
      expect(preview.components.signup.componentName).to.equal("dms-form");
      const fields = preview.components.signup.options?.fields as Array<{
        id: string;
      }>;
      expect(fields.map((field) => field.id)).to.deep.equal(["email"]);
    });

    it("leaves the file untouched", async function () {
      this.timeout(OP_TIMEOUT);
      const before = app.read(PAGE_FILE);
      expectOk(
        await PreviewLayout(PAGE, {
          blocks: [
            {
              name: "revenueKpi",
              type: "KpiCard",
              config: { title: "Not saved" },
            },
          ],
        }),
        "PreviewLayout",
      );

      expect(app.read(PAGE_FILE), "a preview never reaches disk").to.equal(
        before,
      );
    });
  });

  describe("writing a whole tree at once", () => {
    it("reconciles the page against the draft and answers a new version", async function () {
      this.timeout(OP_TIMEOUT);
      const current = await structure();
      const saved = expectOk(
        await SetPageBlocks(
          PAGE,
          {
            blocks: [
              {
                name: "ordersKpi",
                type: "KpiCard",
                config: { title: "Orders" },
              },
              {
                name: "revenueKpi",
                type: "KpiCard",
                config: { title: "Revenue" },
              },
            ],
          },
          { expectedVersion: current.version },
        ),
        "SetPageBlocks",
      );

      expect(saved.version).to.not.equal(current.version);
      const names = (await structure()).blocks.map((block) => block.name);
      expect(names, "the draft's order is the file's order").to.deep.equal([
        "ordersKpi",
        "revenueKpi",
      ]);
    });

    it("refuses a write based on a version that has moved", async function () {
      this.timeout(OP_TIMEOUT);
      const result = await SetPageBlocks(
        PAGE,
        { blocks: [] },
        { expectedVersion: "0000000000000000" },
      );

      expect(result.ok).to.equal(false);
      if (!result.ok) {
        expect(result.error.code).to.equal("stale");
      }
      expect(
        (await structure()).blocks.length,
        "a stale write changes nothing",
      ).to.equal(2);
    });

    it("reads the page as the disk has it, not as it was last scanned", async function () {
      this.timeout(OP_TIMEOUT);
      // An editor, a formatter, a `git checkout`: the file moves under the
      // builder with no write of its own to say so. A read that answered from
      // the last scan would hand back a version no write could ever match —
      // every save refused as `stale`, and the reload offered as the way out
      // serving the same stale version again.
      app.write(PAGE_FILE, `${app.read(PAGE_FILE)}\n// edited by hand\n`);

      const current = await structure();
      expectOk(
        await SetPageBlocks(
          PAGE,
          {
            blocks: [
              {
                name: "ordersKpi",
                type: "KpiCard",
                config: { title: "Orders" },
              },
              {
                name: "revenueKpi",
                type: "KpiCard",
                config: { title: "Revenue" },
              },
            ],
          },
          { expectedVersion: current.version },
        ),
        "SetPageBlocks",
      );
      expect(app.read(PAGE_FILE), "and the edit is still there").to.contain(
        "// edited by hand",
      );
    });

    it("removes a block and leaves its siblings alone", async function () {
      this.timeout(OP_TIMEOUT);
      expectOk(await RemoveBlock(`${PAGE}#ordersKpi`), "RemoveBlock");

      const names = (await structure()).blocks.map((block) => block.name);
      expect(names).to.deep.equal(["revenueKpi"]);
      expect(app.read(PAGE_FILE)).to.not.contain("ordersKpi");
    });
  });

  describe("a block whose author named one of its values", () => {
    const revenueKpi = (config: Record<string, unknown>) => ({
      blocks: [{ name: "revenueKpi", type: "KpiCard", config }],
    });

    /** Write the block's options by hand, the way its author would. */
    function handWrite(options: string): void {
      const page = app.read(PAGE_FILE);
      const written = page.replace(
        /static revenueKpi = KpiCard\([^;]*\);/,
        `static revenueKpi = KpiCard({ ${options} });`,
      );
      expect(written, "the fixture holds the block").to.not.equal(page);
      app.write(PAGE_FILE, written);
    }

    async function save(config: Record<string, unknown>): Promise<string> {
      const current = await structure();
      expectOk(
        await SetPageBlocks(PAGE, revenueKpi(config), {
          expectedVersion: current.version,
        }),
        "SetPageBlocks",
      );
      return app.read(PAGE_FILE);
    }

    before(() => {
      const named = app
        .read(PAGE_FILE)
        .replace('title: "Revenue"', "title: REVENUE_TITLE")
        .replace(
          "@RegisterPage(",
          [
            'const REVENUE_TITLE = "Revenue";',
            "const SHOW_DELTA = true;",
            "const PEAK = 5;",
            "",
            "@RegisterPage(",
          ].join("\n"),
        );
      expect(named, "the fixture holds the constant").to.contain(
        "const REVENUE_TITLE",
      );
      app.write(PAGE_FILE, named);
    });

    it("stays editable, and reads the value the constant holds", async function () {
      this.timeout(OP_TIMEOUT);
      const [block] = (await structure()).blocks;

      expect(block.editable, "a named string locks nothing").to.equal(true);
      expect(block.config).to.deep.equal({ title: "Revenue" });
    });

    it("keeps the name through a save that did not change the value", async function () {
      this.timeout(OP_TIMEOUT);
      const written = await save({ title: "Revenue" });

      expect(written).to.contain("title: REVENUE_TITLE");
    });

    it("writes the value out once the author changes it", async function () {
      this.timeout(OP_TIMEOUT);
      const written = await save({ title: "Income" });

      expect(written).to.contain('title: "Income"');
      expect(written).to.not.contain("title: REVENUE_TITLE");
    });

    it("leaves a value that only equals the constant's as the literal it was", async function () {
      this.timeout(OP_TIMEOUT);
      handWrite('title: REVENUE_TITLE, description: "Revenue"');
      const written = await save({ title: "Revenue", description: "Revenue" });

      expect(written).to.contain("title: REVENUE_TITLE");
      expect(written, "the author typed this one out").to.contain(
        'description: "Revenue"',
      );
    });

    it("puts the name back where it was written and nowhere else", async function () {
      this.timeout(OP_TIMEOUT);
      handWrite('title: "Revenue", showDelta: SHOW_DELTA');
      const written = await save({
        title: "Revenue",
        showDelta: true,
        invert: true,
      });

      expect(written).to.contain("showDelta: SHOW_DELTA");
      expect(written, "a switch turned on in the builder").to.contain(
        "invert: true",
      );
    });

    it("finds a constant in a list by its place there", async function () {
      this.timeout(OP_TIMEOUT);
      handWrite('title: "Revenue", staticSparkline: [PEAK, 3, 5]');
      const written = await save({
        title: "Revenue",
        staticSparkline: [5, 3, 5],
      });

      expect(written).to.contain("staticSparkline: [PEAK, 3, 5]");
    });
  });
});
