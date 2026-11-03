import { guarded } from "../guard.mjs";
import { builder, check, list, pick, text } from "../builder.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

export const journeys = guarded([
  {
    id: "a-project-without-an-external-database-answers-the-documented-empties-and-404s",
    title: "On a project with no catalog connection the Database routes list no connection, answer 404 for an unknown connection, analysis or mapping, and read the project's modules",
    entryPoint: "GET /api/builder/database/*, POST /api/builder/database/sample",
    async run(/** @type {Ctx} */ ctx) {
      const connections = await builder(ctx, "connections", "GET", "/database/connections");
      const project = await builder(ctx, "project", "GET", "/database/project");
      const analysis = await builder(ctx, "analysis of an unknown connection", "GET", "/database/analysis?connection=nope");
      const analysisById = await builder(ctx, "analysis by an unknown id", "GET", "/database/analysis?id=nope");
      const connection = await builder(ctx, "an unknown connection", "GET", "/database/connection?connection=nope");
      const sample = await builder(ctx, "sample of an unknown connection", "POST", "/database/sample", { body: { connection: "nope", relation: "orders", columns: ["id"], limit: 5 } });
      const mapping = await builder(ctx, "mapping of an unknown connection", "GET", "/database/mapping?connection=nope&module=nope");
      await ctx.verify("the reads", [
        check("connections is an empty list", connections.status === 200 && Array.isArray(connections.body) && connections.body.length === 0, connections),
        check("project answers modules", project.status === 200 && Array.isArray(pick(project.body, "modules")) && list(project.body, "modules").length > 0, project),
        check("an unknown analysis connection is 404", analysis.status === 404, analysis),
        check("an unknown analysis id is 404", analysisById.status === 404, analysisById),
        check("an unknown connection is 404", connection.status === 404, connection),
        check("a sample of an unknown connection is 404", sample.status === 404, sample),
        check("an unknown mapping answers a refusal, not a 200 mapping", mapping.status !== 200 || pick(mapping.body, "ok") === false, mapping),
      ]);
      const remove = await builder(ctx, "remove an unknown connection", "POST", "/database/connection/remove", { body: { connection: "nope", dryRun: true } });
      const url = await builder(ctx, "set the url of an unknown connection", "POST", "/database/connection/url", { body: { connection: "nope", url: "postgres://u:p@h/db" } });
      const refused = await builder(ctx, "a request the engine refuses", "POST", "/database/analyse", { body: { connection: "nope" } });
      await ctx.verify("the writes are refused without touching the project", [
        check("remove answers an OpResult that is not ok", pick(remove.body, "ok") === false || remove.status >= 400, remove),
        check("setting a url on an unknown connection is not ok", pick(url.body, "ok") === false || url.status >= 400, url),
        check("analysing an unknown connection is not ok", pick(refused.body, "ok") === false || refused.status >= 400, refused),
        check("a refused request carries a code", [text(refused.body, "code"), text(refused.body, "error", "code")].some((code) => code !== ""), refused.body),
      ]);
    },
  },
  {
    id: "the-database-workspace-offers-to-connect-a-database",
    title: "The Database workspace of the builder opens on a project without a connection and offers to connect one",
    entryPoint: "builder Database workspace",
    async run(/** @type {Ctx} */ ctx) {
      const { openBuilder } = await import("../editor.mjs");
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await openBuilder(ctx, tab);
      await tab.page.getByRole("radio", { name: "Database" }).check();
      await ctx.verify("the workspace opens", [check("it speaks about connecting a database", /connect/i.test(await tab.page.locator("body").innerText()), (await tab.page.locator("body").innerText()).slice(0, 300)), tab.visible({ role: "radio", name: "Database" })]);
    },
  },
]);
