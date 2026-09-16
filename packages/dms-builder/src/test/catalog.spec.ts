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

  it("describes the data-source option of every card that fetches one", () => {
    // Today these three point at a raw endpoint, which is exactly what the
    // no-code work replaces: when the `dataSource` widget lands, this is the
    // assertion that has to change, and nothing else in the engine should.
    for (const type of ["KpiCard", "ChartCard", "TopListCard"]) {
      const option = blockNamed(type).config.fetchUrl;
      expect(option, `${type} exposes fetchUrl`).to.not.equal(undefined);
      expect(option?.ui?.widget, `${type} fetchUrl widget`).to.equal("query");
      expect(option?.ui?.group).to.equal("data");
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
