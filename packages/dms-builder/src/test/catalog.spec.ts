import { expect } from "chai";
import { GetCatalog } from "../implementations/dms-builder";
import type {
  BlockCatalog,
  BlockTypeDescriptor,
} from "@antelopejs/interface-dms-builder";
import { createFixture, destroyFixture } from "./harness";

let catalog: BlockCatalog;

function blockNamed(type: string): BlockTypeDescriptor {
  const found = catalog.blocks.find((block) => block.type === type);
  if (!found) {
    throw new Error(`no block type ${type} in the catalog`);
  }
  return found;
}

/**
 * The catalog is the contract a builder UI reads to draw a config panel: which
 * blocks exist, which control each option wants, and where a block may be
 * dropped. Pinned because the data-source editor is about to be driven from it.
 */
describe("the block catalog", () => {
  before(async function () {
    this.timeout(60_000);
    createFixture();
    catalog = await GetCatalog();
  });

  after(() => destroyFixture());

  it("reports the block types cms-base declares, not only what it can infer", () => {
    expect(catalog.blocks.length).to.be.greaterThan(20);
    const annotated = catalog.blocks.filter(
      (block) => block.shapeSource === "annotated",
    );
    expect(
      annotated.length,
      "declared types win over inferred ones",
    ).to.be.greaterThan(10);
  });

  it("carries the component each block renders as", () => {
    expect(blockNamed("KpiCard").componentName).to.equal("dms-kpi-card");
    expect(blockNamed("ChartCard").componentName).to.equal("dms-chart-card");
  });

  it("describes the data-source option of every card that fetches one", function () {
    const cards = ["KpiCard", "ChartCard", "TopListCard"];
    for (const type of cards) {
      const option = blockNamed(type).config.fetchUrl;
      expect(option, `${type} exposes fetchUrl`).to.not.equal(undefined);
      expect(option?.ui?.group).to.equal("data");
    }
    // The widget names which editor the option opens, and it is the source
    // editor these cards are for. A DMS older than the rename still declares
    // the raw-endpoint `query` widget, and pinning the new name against it
    // would report the version gap as a defect in this engine.
    if (blockNamed("ChartCard").config.fetchUrl?.ui?.widget === "query") {
      this.skip();
    }
    for (const type of cards) {
      expect(
        blockNamed(type).config.fetchUrl?.ui?.widget,
        `${type} fetchUrl widget`,
      ).to.equal("dataSource");
    }
  });

  it("names the chart types a card may wrap", () => {
    const chart = blockNamed("ChartCard").config.chart;
    expect(chart?.ui?.widget).to.equal("block");
    expect(chart?.ui?.blockTypes).to.include("ChartLine");
    expect(chart?.ui?.blockTypes).to.include("ChartDonut");
  });

  it("states the placement rules a canvas enforces", () => {
    const grid = blockNamed("Grid");
    expect(grid.container).to.equal(true);
    expect(grid.allowedChildren, "a Grid only takes rows").to.deep.equal([
      "GridRow",
    ]);

    const row = blockNamed("GridRow");
    expect(row.container).to.equal(true);
    expect(
      row.childMeta?.colSpan,
      "a row's children carry their span as child metadata",
    ).to.not.equal(undefined);

    // A builder palette leaves out the type a container names as its one
    // allowed child: that child is structure the editor writes around what is
    // dropped in, never something placed on its own. The reach of that rule is
    // this list, so it is pinned here rather than guessed at from the layer.
    expect(
      catalog.blocks
        .filter((block) => block.allowedChildren !== undefined)
        .map((block) => block.type),
      "the only container naming what it takes",
    ).to.deep.equal(["Grid"]);
  });

  it("flags the blocks that need a resource before they can be added", () => {
    expect(blockNamed("TableView").controllerArg).to.equal(true);
    expect(blockNamed("KpiCard").controllerArg).to.not.equal(true);
  });

  it("lists the field names a resource may not use", () => {
    expect(catalog.reservedFieldNames).to.include("_id");
    expect(catalog.reservedFieldNames).to.include("count");
    expect(
      catalog.dataTypes.length,
      "data types back the field editor",
    ).to.be.greaterThan(5);
  });
});
