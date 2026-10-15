import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import type {
  MapResourcesInput,
  MappedColumnDescription,
  MappedRelationDescription,
} from "@antelopejs/interface-dms-builder";
import {
  AddField,
  CreateResource,
  DeleteResource,
  ListPages,
  ListResources,
  MapResources,
} from "../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 120_000;
const MODULE = "erp-tables";
const SALES = "sales";

const WRITES = { insert: true, update: true, delete: true };

function Column(
  name: string,
  native: string,
  accepts: string[],
  extra: Partial<MappedColumnDescription> = {},
): MappedColumnDescription {
  return {
    name,
    native,
    nullable: true,
    hasDefault: false,
    accepts: accepts.map((declared) => ({ declared })),
    ...extra,
  };
}

/** What the postgres catalog answers for the relations the specs map. */
const DESCRIPTIONS: MappedRelationDescription[] = [
  {
    schema: SALES,
    name: "accounts",
    kind: "table",
    key: { columns: ["id"] },
    writes: WRITES,
    columns: [
      Column("id", "bigint", ["number", "string"], {
        nullable: false,
        hasDefault: true,
        readOnly: "an identity column GENERATED ALWAYS",
      }),
      Column("name", "character varying(200)", ["string"], { nullable: false }),
      Column("status", "sales.status", ["string"], {
        nullable: false,
        hasDefault: true,
      }),
      Column("revenue", "numeric(12,2)", ["number", "string"]),
      Column("created_at", "timestamp with time zone", ["date"], {
        hasDefault: true,
      }),
      Column("Order Date", "date", ["date"]),
      Column("meta", "jsonb", ["object"]),
    ],
    references: [],
  },
  {
    schema: SALES,
    name: "contacts",
    kind: "table",
    key: { columns: ["contact_id"] },
    writes: WRITES,
    columns: [
      Column("contact_id", "uuid", ["string"], { nullable: false }),
      Column("account_id", "bigint", ["number", "string"]),
      Column("first_name", "text", ["string"], { nullable: false }),
    ],
    references: [
      {
        name: "contacts_account_id_fkey",
        from: { relation: "sales.contacts", columns: ["account_id"] },
        to: { relation: "sales.accounts", columns: ["id"] },
      },
    ],
  },
  {
    schema: SALES,
    name: "products",
    kind: "table",
    key: { columns: ["id"] },
    writes: WRITES,
    columns: [
      Column("id", "integer", ["number", "string"], { nullable: false }),
      Column("label", "text", ["string"]),
      Column("count", "integer", ["number", "string"]),
    ],
    references: [],
  },
  {
    schema: SALES,
    name: "countries",
    kind: "table",
    key: { columns: ["code"] },
    writes: WRITES,
    columns: [
      Column("code", "character(2)", ["string"], { nullable: false }),
      Column("name", "text", ["string"]),
    ],
    references: [],
  },
  {
    schema: SALES,
    name: "raw_log",
    kind: "table",
    key: null,
    writes: WRITES,
    columns: [
      Column("at", "timestamp with time zone", ["date"]),
      Column("msg", "text", ["string"]),
    ],
    references: [],
  },
];

const INPUT: MapResourcesInput = {
  module: MODULE,
  connection: "erp",
  resources: [
    {
      relation: "sales.accounts",
      label: "name",
      tableView: true,
      writable: true,
      fields: [
        { column: "name", searchable: true, sortable: true },
        { column: "status", filterable: true },
        { column: "revenue" },
        { column: "created_at", sortable: true },
        { column: "Order Date" },
        { column: "meta" },
      ],
    },
    {
      relation: "sales.contacts",
      label: "first_name",
      tableView: true,
      writable: false,
      fields: [
        { column: "first_name" },
        { column: "account_id", relation: "sales.accounts", label: "Account" },
      ],
    },
    {
      relation: "sales.products",
      label: "label",
      tableView: true,
      writable: true,
      fields: [{ column: "label" }, { column: "count" }],
    },
    {
      relation: "sales.countries",
      label: "name",
      tableView: true,
      writable: true,
      fields: [{ column: "name" }],
    },
    {
      relation: "sales.raw_log",
      tableView: true,
      writable: false,
      fields: [{ column: "at" }, { column: "msg" }],
    },
  ],
};

let app: Fixture;

function moduleFile(relative: string): string {
  return fs.readFileSync(
    path.join(app.root, "modules", MODULE, "src", relative),
    "utf8",
  );
}

/**
 * A client's tables mapped into a module bound to their database: the schema mirrors the catalog
 * verbatim, `_id` exists only where a key does, nothing would create or alter a table, and the
 * pages are generated over what has a key.
 */
describe("mapping a database the project does not own", function () {
  this.timeout(OP_TIMEOUT);

  let result: Awaited<ReturnType<typeof MapResources>>;

  before(async () => {
    app = createFixture({ modules: [MODULE] });
    result = await MapResources(INPUT, DESCRIPTIONS);
  });

  after(destroyFixture);

  it("writes a module that typechecks, with every TableView page", async () => {
    expectOk(result, "MapResources");
    const refs = (await ListResources()).map((resource) => resource.ref);
    expect(refs).to.include.members([
      "erp/sales/accounts",
      "erp/sales/contacts",
      "erp/sales/products",
    ]);
    const pages = (await ListPages()).filter(
      (page) => page.sourceModule === MODULE,
    );
    expect(pages.map((page) => page.id)).to.have.members([
      "sales-accounts",
      "sales-contacts",
      "sales-countries",
      "sales-products",
    ]);
  });

  it("mirrors the catalog's names verbatim, with _id beside the key column", () => {
    const accounts = moduleFile("sales/accounts/database.ts");
    expect(accounts).to.include('const tableName = "accounts";');
    expect(accounts).to.include('@RegisterTable(tableName, "sales")');
    expect(accounts).to.include('@Field("string") declare _id: string;');
    expect(accounts).to.include('@Field("number") declare id: number;');
    expect(accounts).to.include('@Field("date") declare "Order Date": Date;');
    expect(accounts).to.not.include("@Index");
  });

  it("registers the mapped schema in the module's start", () => {
    expect(moduleFile("index.ts")).to.match(
      /export async function start\(\)[^}]*await RegisterSchema\("sales"\);/s,
    );
  });

  it("makes a foreign key a relation column onto the target's key, showing its label", () => {
    const contacts = moduleFile("sales/contacts/data-api.ts");
    expect(contacts).to.include("dataApiController: accountDataAPI");
    expect(contacts).to.include('keyMapping: { label: "name", value: "_id" }');
    expect(moduleFile("sales/contacts/database.ts")).to.include(
      '@Field("string") declare account_id: string;',
    );
    expect(moduleFile("sales/accounts/data-api.ts")).to.match(
      /@Select\(\)[\s\S]*declare name: string;/,
    );
  });

  it("keeps generated and key columns read-only, and a read-only resource without writes", () => {
    const accounts = moduleFile("sales/accounts/data-api.ts");
    expect(accounts).to.match(
      /@Access\(AccessMode\.ReadWrite\)\s*declare name: string;/,
    );
    const contacts = moduleFile("sales/contacts/data-api.ts");
    expect(contacts).to.not.include("ReadWrite");
    expect(contacts).to.not.include("TableViewRoutes.All");
  });

  it("lets a writable TableView set a key the database does not fill in, and no other key", () => {
    expect(moduleFile("sales/countries/data-api.ts")).to.match(
      /@Access\(AccessMode\.ReadWrite\)\s*declare code: string;/,
    );
    expect(moduleFile("sales/accounts/data-api.ts")).to.not.match(
      /declare id:/,
    );
  });

  it("gives a relation without a key a table and model only: no _id, controller or page", () => {
    const rawLog = moduleFile("sales/raw-log/database.ts");
    expect(rawLog).to.not.include("_id");
    expect(
      fs.existsSync(
        path.join(
          app.root,
          "modules",
          MODULE,
          "src",
          "sales/raw-log/data-api.ts",
        ),
      ),
    ).to.equal(false);
  });

  it("declares a column named like a controller member on the table only, and reports it", () => {
    expectOk(result, "MapResources");
    if (!result.ok) {
      return;
    }
    expect(moduleFile("sales/products/database.ts")).to.include(
      "declare count: number;",
    );
    expect(moduleFile("sales/products/data-api.ts")).to.not.include(
      "declare count",
    );
    const reasons = result.data.leftOut.map(
      (entry) => `${entry.relation}.${entry.column}`,
    );
    expect(reasons).to.include.members([
      "sales.products.count",
      "sales.accounts.Order Date",
      "sales.accounts.meta",
    ]);
  });

  it("refuses a declaration the column does not accept, naming the column", async () => {
    const refused = await MapResources(
      {
        ...INPUT,
        resources: [
          {
            relation: "sales.raw_log",
            tableView: false,
            writable: false,
            fields: [{ column: "msg", declared: "number" }],
          },
        ],
      },
      DESCRIPTIONS,
    );
    expect(refused.ok).to.equal(false);
    expect(JSON.stringify(refused)).to.include("raw_log.msg");
  });

  it("refuses to create a table or add a column in a mapped module", async () => {
    const created = await CreateResource({
      name: "ledger",
      module: MODULE,
      fields: [
        { name: "name", label: "Name", dataType: { $dataType: "string" } },
      ],
    });
    expect(created.ok).to.equal(false);
    const added = await AddField("erp/sales/accounts", {
      name: "nickname",
      label: "Nickname",
      dataType: { $dataType: "string" },
    });
    expect(added.ok).to.equal(false);
  });

  it("never empties a mapped table when its resource is deleted", async () => {
    const deleted = await DeleteResource("erp/sales/products");
    expect(deleted.ok).to.equal(true);
    expect(JSON.stringify(deleted)).to.include("data_kept");
  });
});
