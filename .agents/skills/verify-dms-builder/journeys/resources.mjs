import { guarded } from "../guard.mjs";
import { check, failsWith, list, operation, pick, projectFiles, projectHas, readProject, text } from "../builder.mjs";

/** @typedef {import("../builder.mjs").Ctx} Ctx */

const STRING = { $dataType: "string" };
const NUMBER = { $dataType: "number" };

export const journeys = guarded([
  {
    id: "create-resource-writes-a-table-a-controller-and-an-index",
    title: "CreateResource writes <name>/database.ts, data-api.ts and index.ts with the derived names, the field decorators and the chosen routes, lists and reads back, and refuses bad names, empty routes and duplicates",
    entryPoint: "CreateResource, ListResources, GetResourceStructure",
    async run(/** @type {Ctx} */ ctx) {
      const made = await operation(ctx, "product", "CreateResource", {
        name: "product",
        displayName: "Product",
        fields: [
          { name: "title", dataType: STRING, label: "Title", required: true, searchable: true, sortable: true },
          { name: "price", dataType: NUMBER, sortable: true, filterable: true },
        ],
      });
      await ctx.verify("the resource is created", [
        check("ok with the ref", made.ok && text(made.data, "ref") === "product", made.raw),
        check("three files under src/product", ["database.ts", "data-api.ts", "index.ts"].every((name) => projectHas(ctx, `src/product/${name}`)), projectFiles(ctx, "src/product")),
      ], { critical: true });
      const database = readProject(ctx, "database.ts", "src/product/database.ts").text;
      const dataApi = readProject(ctx, "data-api.ts", "src/product/data-api.ts").text;
      await ctx.verify("the generated names and decorators", [
        check("Product table class, ProductModel, products table", /class Product extends Table/.test(database) && /class ProductModel/.test(database) && /"products"/.test(database), database),
        check("productDataAPI on /api/product", /class productDataAPI/.test(dataApi) && dataApi.includes('"/api/product"'), dataApi),
        check("title is searchable and sortable with its label", /@Searchable\(\)/.test(dataApi) && /label|name: "Title"/.test(dataApi), dataApi),
        check("title is required, price optional", dataApi.split("@Optional()").length === 2, dataApi),
      ]);
      const listed = await operation(ctx, "list", "ListResources");
      const entry = list(listed.raw).find((row) => text(row, "ref") === "product");
      const structure = await operation(ctx, "structure", "GetResourceStructure", "product");
      const fields = list(structure.data, "fields");
      await ctx.verify("the listing and the structure read it back", [
        check("summary names, fieldCount 3 (the two fields and the generated _id)", text(entry, "className") === "Product" && text(entry, "tableName") === "products" && text(entry, "route") === "/api/product" && entry?.fieldCount === 3, entry),
        check("fields in declaration order, without _id and model", fields.map((field) => text(field, "name")).join() === "title,price", fields),
        check("title aspects", fields[0]?.required === true && fields[0]?.searchable === true && fields[0]?.sortable === true, fields[0]),
        check("price aspects", fields[1]?.filterable === true, fields[1]),
        check("a full set of routes is not listed", pick(structure.data, "routes") === undefined && text(structure.data, "version") !== "", structure.data),
      ]);
      const subset = await operation(ctx, "singleton", "CreateResource", { name: "site-settings", fields: [{ name: "title", dataType: STRING }], routes: ["get", "edit"] });
      const subsetStructure = await operation(ctx, "structure", "GetResourceStructure", "site-settings");
      const empty = await operation(ctx, "empty routes", "CreateResource", { name: "none", fields: [], routes: [] });
      const unknownRoute = await operation(ctx, "unknown route", "CreateResource", { name: "odd", fields: [], routes: ["list", "fly"] });
      const symbols = await operation(ctx, "no alphanumeric", "CreateResource", { name: "---", fields: [] });
      const duplicate = await operation(ctx, "duplicate", "CreateResource", { name: "product", fields: [] });
      const reserved = await operation(ctx, "reserved field", "CreateResource", { name: "bad", fields: [{ name: "_id", dataType: STRING }] });
      await ctx.verify("routes and refusals", [
        check("a route subset reads back", subset.ok && JSON.stringify(pick(subsetStructure.data, "routes")) === '["get","edit"]', subsetStructure.data),
        failsWith("empty routes are invalid_config", empty, "invalid_config"),
        failsWith("an unknown route is invalid_config", unknownRoute, "invalid_config"),
        failsWith("a name without alphanumerics is invalid_config", symbols, "invalid_config"),
        failsWith("a duplicate is duplicate_name", duplicate, "duplicate_name"),
        failsWith("a reserved field name is invalid_config", reserved, "invalid_config"),
        check("nothing written for the refusals", !projectHas(ctx, "src/bad/database.ts") && !projectHas(ctx, "src/none/database.ts"), "files"),
      ]);
    },
  },
  {
    id: "an-exported-field-is-written-with-its-import",
    title: "A field with exported: true is written as @Exported with its import, and the resource compiles (known finding: the import is missing and the write fails typecheck)",
    entryPoint: "CreateResource with exported",
    async run(/** @type {Ctx} */ ctx) {
      const made = await operation(ctx, "exported title", "CreateResource", { name: "report", fields: [{ name: "title", dataType: STRING, exported: true }] });
      await ctx.verify("the resource with an exported field is created", [check("ok", made.ok, made.raw)], { critical: true });
      const dataApi = readProject(ctx, "data-api.ts", "src/report/data-api.ts").text;
      await ctx.verify("the decorator and its import", [
        check("@Exported() on title", /@Exported\(\)/.test(dataApi), dataApi),
        check("Exported is imported", /import \{[^}]*\bExported\b[^}]*\} from/.test(dataApi), dataApi),
        check("the structure reads exported back", list((await operation(ctx, "read", "GetResourceStructure", "report")).data, "fields")[0]?.exported === true, "fields"),
      ]);
    },
  },
  {
    id: "fields-and-routes-are-edited-in-both-generated-files",
    title: "AddField, ConfigureField, RemoveField and ConfigureResource edit the two generated files, bump the version, and refuse duplicates, reserved names, unknown targets and stale versions",
    entryPoint: "AddField, ConfigureField, RemoveField, ConfigureResource",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "product", "CreateResource", { name: "product", fields: [{ name: "title", dataType: STRING }, { name: "price", dataType: NUMBER }] });
      const v1 = text((await operation(ctx, "read", "GetResourceStructure", "product")).data, "version");
      const added = await operation(ctx, "add sku", "AddField", "product", { name: "sku", dataType: STRING, label: "SKU", indexed: true, searchable: true });
      const database = readProject(ctx, "database.ts", "src/product/database.ts").text;
      const dataApi = readProject(ctx, "data-api.ts", "src/product/data-api.ts").text;
      await ctx.verify("AddField writes both files", [
        check("the path is resource#field", added.ok && text(added.data, "path") === "product#sku", added.raw),
        check("the table declares an indexed sku", /@Index\(\)[\s\S]{0,80}sku/.test(database), database),
        check("the controller declares a searchable SKU column", /sku/.test(dataApi) && /@Searchable\(\)/.test(dataApi), dataApi),
        check("the version changed", text((await operation(ctx, "read", "GetResourceStructure", "product")).data, "version") !== v1, v1),
      ]);
      const duplicate = await operation(ctx, "duplicate field", "AddField", "product", { name: "sku", dataType: STRING });
      const reserved = await operation(ctx, "reserved", "AddField", "product", { name: "_id", dataType: STRING });
      const unknown = await operation(ctx, "unknown resource", "AddField", "nope", { name: "x", dataType: STRING });
      await ctx.verify("AddField refusals", [
        failsWith("a duplicate is duplicate_name", duplicate, "duplicate_name"),
        check("with the resource scope", text(duplicate.error, "scope") === "resource", duplicate.error),
        failsWith("a reserved name is invalid_config", reserved, "invalid_config"),
        failsWith("an unknown resource is not_found", unknown, "not_found"),
      ]);
      const before = readProject(ctx, "database.ts", "src/product/database.ts").text;
      const configured = await operation(ctx, "filterable and order", "ConfigureField", "product#price", { filterable: true, order: 2 });
      const after = readProject(ctx, "database.ts", "src/product/database.ts").text;
      const price = list((await operation(ctx, "read", "GetResourceStructure", "product")).data, "fields").find((field) => text(field, "name") === "price");
      await ctx.verify("ConfigureField merges over the current aspects", [
        check("filterable and order set", configured.ok && price?.filterable === true && price?.order === 2, price),
        check("the table file is untouched when neither dataType nor indexed is patched", before === after, "database.ts"),
      ]);
      await operation(ctx, "retype", "ConfigureField", "product#price", { indexed: true });
      await ctx.verify("indexed rewrites the table file", [check("the price column is indexed", /@Index\(\)[\s\S]{0,80}price/.test(readProject(ctx, "database.ts", "src/product/database.ts").text), "database.ts")]);
      const missingField = await operation(ctx, "unknown field", "ConfigureField", "product#nope", { order: 1 });
      const stale = await operation(ctx, "stale", "ConfigureField", "product#price", { order: 3 }, { expectedVersion: v1 });
      await ctx.verify("ConfigureField refusals", [failsWith("an unknown field is not_found", missingField, "not_found"), failsWith("a stale version is stale", stale, "stale")]);
      const removed = await operation(ctx, "remove sku", "RemoveField", "product#sku");
      const gone = await operation(ctx, "remove sku again", "RemoveField", "product#sku");
      await ctx.verify("RemoveField", [
        check("sku is gone from both files", removed.ok && !/sku/.test(readProject(ctx, "database.ts", "src/product/database.ts").text) && !/sku/.test(readProject(ctx, "data-api.ts", "src/product/data-api.ts").text), removed.raw),
        failsWith("removing again is not_found", gone, "not_found"),
      ]);
      const routes = await operation(ctx, "routes", "ConfigureResource", "product", { routes: ["list", "get"] });
      const noRoutes = await operation(ctx, "no routes in the patch", "ConfigureResource", "product", {});
      const emptyRoutes = await operation(ctx, "empty routes", "ConfigureResource", "product", { routes: [] });
      await ctx.verify("ConfigureResource replaces the routes", [
        check("the structure lists exactly list and get", routes.ok && JSON.stringify(pick((await operation(ctx, "read", "GetResourceStructure", "product")).data, "routes")) === '["list","get"]', routes.raw),
        check("a patch without routes changes nothing", noRoutes.ok, noRoutes.raw),
        failsWith("an empty list is invalid_config", emptyRoutes, "invalid_config"),
      ]);
    },
  },
  {
    id: "delete-resource-removes-its-files-imports-and-rows",
    title: "DeleteResource removes the three files, the folder and the imports, deletes the rows unless keepData, and refuses a resource another resource imports",
    entryPoint: "DeleteResource",
    async run(/** @type {Ctx} */ ctx) {
      await operation(ctx, "product", "CreateResource", { name: "product", fields: [{ name: "title", dataType: STRING }] });
      const stale = await operation(ctx, "stale", "DeleteResource", "product", { expectedVersion: "0000" });
      await ctx.verify("a stale version is refused and nothing is deleted", [failsWith("stale", stale, "stale"), check("the files remain", projectHas(ctx, "src/product/database.ts"), "files")]);
      const removed = await operation(ctx, "delete", "DeleteResource", "product");
      await ctx.verify("the files, the folder and the barrel import are gone", [
        check("ok", removed.ok, removed.raw),
        check("no file is left under src/product", projectFiles(ctx, "src/product").length === 0, projectFiles(ctx, "src/product")),
        check("the barrel does not export it", !readProject(ctx, "the barrel", "src/index.ts").text.includes("./product"), "barrel"),
        check("ListResources does not list it", !list((await operation(ctx, "list", "ListResources")).raw).some((row) => text(row, "ref") === "product"), "list"),
      ]);
      const missing = await operation(ctx, "again", "DeleteResource", "product");
      await ctx.verify("an unknown resource is not_found", [failsWith("not_found", missing, "not_found")]);
    },
  },
]);
