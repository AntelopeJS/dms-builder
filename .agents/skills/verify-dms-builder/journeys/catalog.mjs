import { guarded } from "../guard.mjs";
import { check, list, operation, pick, text } from "../builder.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

const RESERVED = ["_id", "model", "get", "list", "select", "count", "new", "edit"];

export const journeys = guarded([
  {
    id: "the-catalog-describes-block-types-and-data-types",
    title: "GetCatalog lists block types with their import, group, container and slot data, the DataTypes with their ids, the reserved field names and a generation time that RefreshSourceIndex without a page replaces",
    entryPoint: "GetCatalog, RefreshSourceIndex",
    async run(/** @type {Ctx} */ ctx) {
      const first = await operation(ctx, "catalog", "GetCatalog");
      const blocks = list(first.raw, "blocks");
      const byType = new Map(blocks.map((block) => [text(block, "type"), block]));
      const kpi = byType.get("KpiCard");
      const card = byType.get("Card");
      const tab = byType.get("Tab");
      const table = byType.get("TableView");
      await ctx.verify("block types", [
        check("the standard blocks are listed", ["KpiCard", "Card", "Tab", "TableView", "Form", "ChartCard", "PeriodSelector", "PageToolbar"].every((type) => byType.has(type)), [...byType.keys()]),
        check("KpiCard has an import from a package, a componentName and a palette group", text(kpi, "import", "name") === "KpiCard" && text(kpi, "import", "module") !== "" && text(kpi, "componentName") !== "" && ["layout", "content", "data", "visualization"].includes(text(kpi, "group")), kpi),
        check("Card is a container with slots actions and footer", card?.container === true && list(card, "slots").map((slot) => text(slot, "id")).join() === "actions,footer", card),
        check("Tab names its regions from its items option", tab?.container === true && text(tab, "dynamicSlots", "optionPath") === "items" && text(tab, "dynamicSlots", "idKey") === "slot" && text(tab, "dynamicSlots", "labelKey") === "label", tab),
        check("TableView takes a controller first", table?.controllerArg === true, table),
        check("KpiCard takes none", kpi?.controllerArg !== true, kpi),
        check("a container declares itself, a leaf does not", blocks.filter((block) => block.container === true).length > 0 && kpi?.container !== true, kpi),
        check("every descriptor says how its config was found", blocks.every((block) => ["inferred", "annotated"].includes(text(block, "configOrigin"))), blocks.map((block) => text(block, "configOrigin"))),
        check("a PageToolbar starts with a LiveToggle and a PeriodSelector", list(byType.get("PageToolbar"), "initialChildren").map((child) => text(child, "type") || text(child, "id")).join().length > 0, byType.get("PageToolbar")),
      ]);
      const dataTypes = list(first.raw, "dataTypes");
      const ids = dataTypes.map((dataType) => text(dataType, "id"));
      await ctx.verify("data types and reserved names", [
        check("string, number, date and select are DataTypes", ["string", "number", "date", "select"].every((id) => ids.includes(id)), ids),
        check("each has an import", dataTypes.every((dataType) => text(dataType, "import", "name") !== ""), dataTypes.slice(0, 2)),
        check("the reserved field names include the documented ones", RESERVED.every((name) => (Array.isArray(pick(first.raw, "reservedFieldNames")) ? pick(first.raw, "reservedFieldNames") : []).includes(name)), pick(first.raw, "reservedFieldNames")),
      ]);
      const cached = await operation(ctx, "catalog again", "GetCatalog");
      await operation(ctx, "refresh for a page", "RefreshSourceIndex", { page: "/shop/board" });
      const keptByPageScope = await operation(ctx, "catalog after a page refresh", "GetCatalog");
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const refreshed = await operation(ctx, "refresh everything", "RefreshSourceIndex");
      const rebuilt = await operation(ctx, "catalog after a full refresh", "GetCatalog");
      await ctx.verify("the catalog is cached until a full refresh", [
        check("generatedAt is the cache key and an ISO time", !Number.isNaN(Date.parse(text(first.raw, "generatedAt"))), text(first.raw, "generatedAt")),
        check("a second read is the same cached catalog", text(cached.raw, "generatedAt") === text(first.raw, "generatedAt"), text(cached.raw, "generatedAt")),
        check("a refresh scoped to a page keeps the cached catalog", text(keptByPageScope.raw, "generatedAt") === text(first.raw, "generatedAt"), text(keptByPageScope.raw, "generatedAt")),
        check("a refresh returns nothing", refreshed.raw === null || refreshed.raw === undefined, refreshed.raw),
        check("a full refresh builds a new catalog", text(rebuilt.raw, "generatedAt") !== text(first.raw, "generatedAt"), text(rebuilt.raw, "generatedAt")),
      ]);
      const sources = await operation(ctx, "data sources", "ListDataSources");
      await ctx.verify("declared data sources", [check("the listing is an array", Array.isArray(sources.raw), sources.raw)]);
    },
  },
]);
