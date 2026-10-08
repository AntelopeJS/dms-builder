import { expect } from "chai";
import {
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
  SetPageBlocks,
} from "../implementations/dms-builder";
import {
  pageImpact,
  tableReaders,
  tableRowCounts,
} from "../implementations/dms-builder/engine/table-readers";
import { createFixture, destroyFixture, expectOk } from "./harness";

/**
 * What a table reaches, said before it is changed: the pages reading it, by a
 * block bound to it or a block pointing at its API.
 */
describe("the pages reading a table", () => {
  before(async function () {
    this.timeout(120_000);
    createFixture();
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    for (const [name, displayName] of [
      ["board", "Board"],
      ["intake", "Intake"],
      ["quiet", "Quiet"],
    ] as const) {
      expectOk(
        await CreatePage({ name, displayName, category: "pages.shop" }),
        "CreatePage",
      );
    }
    expectOk(
      await CreateResource({
        name: "ticket",
        fields: [{ name: "title", dataType: { $dataType: "string" } }],
      }),
      "CreateResource",
    );
  });

  after(() => destroyFixture());

  it("counts a block bound to it and a form sending to it, page by page", async function () {
    this.timeout(120_000);
    const board = expectOk(await GetPageStructure("/shop/board"), "board");
    expectOk(
      await SetPageBlocks(
        "/shop/board",
        {
          blocks: [
            {
              name: "tickets",
              type: "TableView",
              controller: "ticket",
              config: {},
            },
          ],
        },
        { expectedVersion: board.version },
      ),
      "SetPageBlocks board",
    );
    const intake = expectOk(await GetPageStructure("/shop/intake"), "intake");
    expectOk(
      await SetPageBlocks(
        "/shop/intake",
        {
          blocks: [
            {
              name: "newTicket",
              type: "Form",
              config: {
                submitUrl: "/api/ticket/new",
                submitUrlMethod: "POST",
                fields: [],
              },
            },
          ],
        },
        { expectedVersion: intake.version },
      ),
      "SetPageBlocks intake",
    );

    const readers = tableReaders().ticket ?? [];
    expect(readers.map((reader) => reader.page).sort()).to.deep.equal([
      "/shop/board",
      "/shop/intake",
    ]);
    expect(readers.find((reader) => reader.page === "/shop/board")).to.include({
      displayName: "Board",
      blocks: 1,
    });
  });

  it("says nothing of the rows of a table no database answers for", async function () {
    this.timeout(60_000);
    // The fixture wires no database: unreadable, so not counted as empty.
    expect(await tableRowCounts(undefined)).to.deep.equal({});
  });

  it("says what deleting a page takes, and which pages still point at it", async function () {
    this.timeout(120_000);
    const quiet = expectOk(await GetPageStructure("/shop/quiet"), "quiet");
    expectOk(
      await SetPageBlocks(
        "/shop/quiet",
        {
          blocks: [
            {
              name: "goBoard",
              type: "Banner",
              config: {
                title: "See the board",
                actions: [{ label: "Open", to: "/shop/board" }],
              },
            },
          ],
        },
        { expectedVersion: quiet.version },
      ),
      "SetPageBlocks quiet",
    );

    const impact = pageImpact("/shop/board");
    expect(impact?.blocks).to.equal(1);
    expect(impact?.linkedFrom).to.deep.equal([
      { page: "/shop/quiet", displayName: "Quiet" },
    ]);
    expect(pageImpact("/shop/nowhere")).to.equal(undefined);
  });
});
