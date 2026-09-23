import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import {
  CreateCategory,
  CreatePage,
  CreateResource,
  PreviewLayout,
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
});
