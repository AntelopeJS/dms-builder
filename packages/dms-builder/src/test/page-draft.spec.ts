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

    it("removes a block and leaves its siblings alone", async function () {
      this.timeout(OP_TIMEOUT);
      expectOk(await RemoveBlock(`${PAGE}#ordersKpi`), "RemoveBlock");

      const names = (await structure()).blocks.map((block) => block.name);
      expect(names).to.deep.equal(["revenueKpi"]);
      expect(app.read(PAGE_FILE)).to.not.contain("ordersKpi");
    });
  });
});
