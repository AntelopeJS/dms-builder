import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import {
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
  PreviewLayout,
  SetPageBlocks,
} from "../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/board";

let app: Fixture;
let loadedFile: string;

/** What a preview built in place of one block, as the canvas receives it. */
async function previewOf(block: Record<string, unknown>) {
  const preview = expectOk(
    await PreviewLayout(PAGE, {
      blocks: [{ name: "block", ...block } as never],
    }),
    "PreviewLayout",
  );
  return {
    degraded: preview.degraded,
    component: preview.components.block,
  };
}

/**
 * A block over a table is built from the table's DataAPI class, which only the
 * running app holds. The preview reads it off what the app already loaded, and
 * only for a block whose factory leaves that class as it found it.
 */
describe("previewing a block over a table", () => {
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
    expectOk(
      await CreateResource({
        name: "ticket",
        fields: [{ name: "title", dataType: { $dataType: "string" } }],
      }),
      "CreateResource",
    );
    // The app's compiled DataAPI, as the core would have loaded it.
    class ticketDataAPI extends Controller("/api/ticket") {}
    loadedFile = path.join(app.root, "dist", "ticket", "data-api.js");
    Object.assign(require.cache, {
      [loadedFile]: { exports: { ticketDataAPI } },
    });
  });

  after(() => {
    delete require.cache[loadedFile];
    destroyFixture();
  });

  it("names the table a block still has to be given", async function () {
    this.timeout(60_000);
    const { degraded, component } = await previewOf({
      type: "TableView",
      config: {},
    });

    expect(degraded).to.deep.equal([`${PAGE}#block`]);
    expect(component.options).to.include({ label: "Table — choose its table" });
  });

  it("leaves a table view to the saved page, even with its class loaded", async function () {
    this.timeout(60_000);
    // Its factory writes options, guards and a gate flag onto the class every
    // page mounting that table shares: building one here would reach the app.
    const { degraded, component } = await previewOf({
      type: "TableView",
      controller: "ticket",
      config: {},
    });

    expect(degraded).to.deep.equal([`${PAGE}#block`]);
    expect(component.options).to.include({
      label: "Table — needs the running page",
    });
  });

  it("waits on the running page for a relation to a table it has not loaded", async function () {
    this.timeout(60_000);
    // Created a moment ago, say: the app has not reloaded under it yet, so
    // there is no class to hand the field.
    const { degraded, component } = await previewOf({
      type: "Form",
      config: { fields: [relationTo({ $ref: { resource: "invoice" } })] },
    });

    expect(degraded).to.deep.equal([`${PAGE}#block`]);
    expect(component.options).to.include({
      label: "a table it reads needs the running page",
    });
  });

  it("writes the table a relation field points at, and reads it back", async function () {
    this.timeout(120_000);
    const current = expectOk(await GetPageStructure(PAGE), "GetPageStructure");
    expectOk(
      await SetPageBlocks(
        PAGE,
        {
          blocks: [
            {
              name: "picker",
              type: "Form",
              config: {
                fields: [relationTo({ $ref: { resource: "ticket" } })],
              },
            },
          ],
        },
        { expectedVersion: current.version },
      ),
      "SetPageBlocks",
    );

    expect(app.read("board/page.ts")).to.contain(
      "dataApiController: ticketDataAPI",
    );
    const [block] = expectOk(
      await GetPageStructure(PAGE),
      "GetPageStructure",
    ).blocks;
    expect(block.editable, "the class reads back as the table").to.equal(true);
    const [field] = (block.config ?? {}).fields as Array<{
      type: { config: Record<string, unknown> };
    }>;
    expect(field.type.config.dataApiController).to.deep.equal({
      $ref: { resource: "ticket" },
    });
  });
});

/** A form field over another table, as the panel writes one. */
function relationTo(dataApiController: unknown): Record<string, unknown> {
  return {
    id: "ticket",
    label: "Ticket",
    type: {
      $dataType: "relation",
      config: { dataApiController, keyMapping: { label: "title" } },
    },
  };
}
