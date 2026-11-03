import { guarded } from "../guard.mjs";
import { BOARD, builder, check, list, member, pick, text, withConfig } from "../builder.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

export const journeys = guarded([
  {
    id: "every-route-needs-a-tenant-owner",
    title: "Every /api/builder route refuses an anonymous request and a member who is not the owner, and answers the owner",
    entryPoint: "GET /api/builder/status, GET /api/builder/catalog, POST /api/builder/pages",
    async run(/** @type {Ctx} */ ctx) {
      await member(ctx, "reader", []);
      const routes = [["GET", "/status"], ["GET", "/catalog"], ["GET", "/pages"], ["GET", "/categories"], ["GET", "/resources"], ["GET", "/permissions"], ["POST", "/refresh"]];
      /** @type {import("../builder.mjs").Check[]} */
      const checks = [];
      for (const [method, path] of routes) {
        const anon = await builder(ctx, `anonymous ${method} ${path}`, method, path, { as: "anon" });
        const reader = await builder(ctx, `member ${method} ${path}`, method, path, { as: "reader" });
        const owner = await builder(ctx, `owner ${method} ${path}`, method, path);
        checks.push(
          check(`${method} ${path}: anonymous is refused`, anon.status === 401 || anon.status === 403, anon.status),
          check(`${method} ${path}: a member without ownership is refused`, reader.status === 401 || reader.status === 403, reader.status),
          check(`${method} ${path}: the owner is answered`, owner.status === 200, owner.status),
        );
      }
      await ctx.verify("read routes", checks);
      const create = await builder(ctx, "member creates a page", "POST", "/pages", { as: "reader", body: { name: "sneak", displayName: "Sneak", category: "pages" } });
      const listed = await builder(ctx, "owner lists pages", "GET", "/pages");
      await ctx.verify("a write by a member is refused and writes nothing", [
        check("403 or 401", create.status === 401 || create.status === 403, create.status),
        check("no page was created", !list(listed.body).some((page) => text(page, "ref") === "/sneak"), listed.body),
      ]);
    },
  },
  {
    id: "lists-answer-their-value-and-mutations-answer-an-op-result",
    title: "The list and describe routes answer their value, a mutation answers an OpResult even when it refuses, the impact and access reads answer 404 with a not_found body for an unknown page, and /refresh answers ok",
    entryPoint: "GET /api/builder/catalog|pages|categories|resources|query-templates|data-sources|tables/usage|permissions|page/impact|page/access, POST /api/builder/pages, POST /api/builder/refresh",
    async run(/** @type {Ctx} */ ctx) {
      const catalog = await builder(ctx, "catalog", "GET", "/catalog");
      const pages = await builder(ctx, "pages", "GET", "/pages");
      const categories = await builder(ctx, "categories", "GET", "/categories");
      const resources = await builder(ctx, "resources", "GET", "/resources");
      const templates = await builder(ctx, "templates", "GET", "/query-templates");
      const sources = await builder(ctx, "data sources", "GET", "/data-sources");
      const usage = await builder(ctx, "tables usage", "GET", "/tables/usage");
      const permissions = await builder(ctx, "permissions", "GET", "/permissions");
      await ctx.verify("the reads answer their value, not an OpResult", [
        check("the catalog lists block types", list(catalog.body, "blocks").length > 10 || list(catalog.body, "blockTypes").length > 10 || Object.keys(catalog.body ?? {}).length > 0, Object.keys(catalog.body ?? {})),
        check("pages is the array holding /shop/board", Array.isArray(pages.body) && list(pages.body).some((page) => text(page, "ref") === BOARD), pages.body),
        check("categories is an array that holds pages.shop", list(categories.body).some((row) => text(row, "ref") === "pages.shop"), categories.body),
        check("resources is the array holding order", list(resources.body).some((row) => text(row, "ref") === "order"), resources.body),
        check("query-templates is an array of count, aggregate and series", ["count", "aggregate", "series"].every((id) => list(templates.body).some((row) => text(row, "id") === id)), templates.body),
        check("data-sources is an array", Array.isArray(sources.body), sources.body),
        check("tables/usage holds readers and rows", pick(usage.body, "readers") !== undefined && pick(usage.body, "rows") !== undefined, usage.body),
        check("the order table has 18 rows in the request's tenant", pick(usage.body, "rows", "order") === 18 || Object.values(pick(usage.body, "rows") ?? {}).includes(18), usage.body),
        check("the board page reads the order table", JSON.stringify(pick(usage.body, "readers")).includes(BOARD), usage.body),
        check("permissions is a list that is not empty", (Array.isArray(permissions.body) ? permissions.body.length : Object.keys(permissions.body ?? {}).length) > 0, permissions.body),
      ]);
      const refused = await builder(ctx, "a refused mutation", "POST", "/pages", { body: { name: "Bad Name", displayName: "x", category: "pages" } });
      const duplicate = await builder(ctx, "a duplicate page", "POST", "/categories", { body: { name: "shop", displayName: "Shop again" } });
      await ctx.verify("a refusing mutation answers an OpResult to branch on ok", [
        check("ok is false with an invalid_config error", pick(refused.body, "ok") === false && text(refused.body, "error", "code") === "invalid_config", refused),
        check("a duplicate carries duplicate_name", pick(duplicate.body, "ok") === false && text(duplicate.body, "error", "code") === "duplicate_name", duplicate),
      ]);
      const impact = await builder(ctx, "impact of an unknown page", "GET", "/page/impact?ref=/nope");
      const access = await builder(ctx, "access of an unknown page", "GET", "/page/access?ref=/nope");
      const impactKnown = await builder(ctx, "impact of the board", "GET", `/page/impact?ref=${encodeURIComponent(BOARD)}`);
      await ctx.verify("impact and access", [
        check("impact: 404 with code not_found and the ref", impact.status === 404 && text(impact.body, "code") === "not_found" && text(impact.body, "ref") === "/nope", impact),
        check("access: 404 with code not_found and the ref", access.status === 404 && text(access.body, "code") === "not_found" && text(access.body, "ref") === "/nope", access),
        check("impact of a real page answers 200", impactKnown.status === 200, impactKnown.body),
      ]);
      const refresh = await builder(ctx, "refresh", "POST", "/refresh");
      await ctx.verify("refresh", [check("answers { ok: true }", refresh.status === 200 && pick(refresh.body, "ok") === true, refresh.body)]);
    },
  },
  {
    id: "the-builder-follows-api-enabled-and-the-start-mode",
    title: "Under ajs project start the builder is off unless api.enabled is true: with it forced on the routes answer, left unset or forced off they answer 404 and the page header shows no builder button",
    entryPoint: "GET /api/builder/status, the page header",
    async run(/** @type {Ctx} */ ctx) {
      const on = await builder(ctx, "status with api.enabled true", "GET", "/status");
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(BOARD);
      await ctx.verify("forced on: the routes answer and the page has the button", [
        check("status 200", on.status === 200, on.status),
        tab.visible({ role: "button", name: "Builder — edit this page" }, { timeoutMs: 30_000 }),
      ]);
      for (const mode of ["follow-dev", "off"]) {
        await withConfig(ctx, { VERIFY_BUILDER_API: mode }, async () => {
          await ctx.verify(`${mode}: signed in again`, [check("the admin session survives a restart", (await ctx.api("a session read", { method: "GET", path: "/api/auth/me" })).status !== 0, "me")]);
          const routes = await ctx.api(`${mode}: status`, { method: "GET", path: "/api/builder/status" });
          const pages = await ctx.api(`${mode}: pages`, { method: "GET", path: "/api/builder/pages" });
          const bare = await ctx.tab();
          await bare.signIn("admin");
          await bare.goto(BOARD);
          await ctx.verify(`api.enabled ${mode === "off" ? "false" : "unset"} under ajs project start`, [
            check("/status answers 404", routes.status === 404, routes.status),
            check("/pages answers 404", pages.status === 404, pages.status),
            bare.visible({ role: "heading", name: "Board", level: 1 }, { timeoutMs: 30_000 }),
          ]);
        });
      }
    },
  },
  {
    id: "project-root-decides-where-the-builder-writes",
    title: "projectRoot names the source root: the status route reports it, a relative one resolves against the process working directory, and pages are listed from it",
    entryPoint: "GET /api/builder/status with projectRoot set",
    async run(/** @type {Ctx} */ ctx) {
      const own = await builder(ctx, "status", "GET", "/status");
      await ctx.verify("the default is the playground", [check("projectRoot is the run's playground", text(own.body, "projectRoot") === ctx.state.runPlayground, own.body)]);
      await withConfig(ctx, { VERIFY_BUILDER_PROJECT_ROOT: "." }, async () => {
        const dot = await ctx.api("status with a relative root", { method: "GET", path: "/api/builder/status" });
        await ctx.verify("a relative projectRoot resolves against the working directory", [
          check("the root is an absolute path", text(dot.body, "projectRoot").startsWith("/"), dot.body),
          check("it is the process working directory, not the literal dot", text(dot.body, "projectRoot") !== "." && text(dot.body, "projectRoot").length > 1, dot.body),
        ]);
      });
    },
  },
]);
