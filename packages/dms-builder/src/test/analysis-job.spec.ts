import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import type {
  ProfileRequest,
  ReferenceCheck,
  RelationDescription,
} from "@antelopejs/interface-database-catalog";
import type { AnalysisState } from "@antelopejs/interface-dms-builder";
import {
  AnalyseDatabase,
  GetAnalysis,
  MapResources,
} from "../implementations/dms-builder";
import {
  type CatalogConnection,
  setCatalogConnectionsForTests,
} from "../implementations/dms-builder/engine/catalog-connection";
import {
  Column,
  INFO,
  Profiled,
  Reference,
  Relation,
} from "./analysis-catalog";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const MODULE = "erp-tables";
const OP_TIMEOUT = 120_000;
const POLL_MS = 5;

const ORDER_CUSTOMER = Reference(
  "erp.orders",
  "customer_code",
  "erp.customers",
  "code",
);

const RELATIONS: RelationDescription[] = [
  Relation({
    relation: "erp.customers",
    key: ["code"],
    columns: [Column("code", "string"), Column("name", "string")],
    referencedBy: [ORDER_CUSTOMER],
  }),
  Relation({
    relation: "erp.orders",
    key: ["id"],
    columns: [
      Column("id", "string"),
      Column("customer_code", "string"),
      Column("reference", "string"),
    ],
    references: [ORDER_CUSTOMER],
  }),
  Relation({
    relation: "erp.invoices",
    key: ["id"],
    columns: [
      Column("id", "number"),
      Column("number", "string"),
      Column("order_id", "string"),
    ],
  }),
  Relation({
    relation: "erp.people",
    key: ["id"],
    columns: [Column("id", "number")],
    unmappable: "SELECT is granted on some columns only",
  }),
];

const LABELS: Record<string, string> = {
  "erp.customers": "name",
  "erp.orders": "reference",
  "erp.invoices": "number",
};

function described(relation: string): RelationDescription {
  const found = RELATIONS.find(
    (candidate) => `${candidate.schema}.${candidate.name}` === relation,
  );
  if (!found) {
    throw new Error(`No relation ${relation}`);
  }
  return found;
}

let app: Fixture;

/** The calls the analysis made, in order, by function. */
const calls: string[] = [];

function catalogOver(
  relations: RelationDescription[],
): Partial<CatalogConnection> {
  return {
    async Info() {
      calls.push("Info");
      return INFO;
    },
    async ListRelations() {
      calls.push("ListRelations");
      return relations;
    },
    async DescribeRelations(names: string[]) {
      calls.push(`DescribeRelations:${names.join(",")}`);
      return names.map(described);
    },
    async Profile(request: ProfileRequest) {
      calls.push(`Profile:${request.relation}`);
      const label = LABELS[request.relation];
      return Profiled(
        request.relation,
        10,
        label ? { [label]: { traits: ["label-candidate"] } } : {},
      );
    },
    async CheckReference(check: ReferenceCheck) {
      calls.push(`CheckReference:${check.from.relation}.${check.from.column}`);
      return {
        status: "ok",
        value: {
          containment: 1,
          checkedRows: 10,
          sampled: false,
          targetIsKey: true,
        },
      };
    },
  };
}

async function finished(started: AnalysisState): Promise<AnalysisState> {
  for (;;) {
    const state = await GetAnalysis(started.id);
    expectOk(state, "GetAnalysis");
    if (state.ok && state.data.status !== "running") {
      return state.data;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function analysed(): Promise<AnalysisState> {
  const started = await AnalyseDatabase({ connection: "erp", module: MODULE });
  if (!started.ok) {
    throw new Error(`AnalyseDatabase: ${JSON.stringify(started.error)}`);
  }
  return finished(started.data);
}

describe("an analysis job", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    calls.length = 0;
  });

  before(() => {
    app = createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({ erp: catalogOver(RELATIONS) });
  });

  after(() => {
    setCatalogConnectionsForTests();
    destroyFixture();
  });

  it("answers its job at once, then a proposal that writes nothing", async () => {
    const state = await analysed();
    expect(state.status).to.equal("done");
    expect(
      fs.readdirSync(path.join(app.root, "modules", MODULE, "src")),
    ).to.deep.equal(["index.ts"]);
    expect(state.progress).to.include({ relations: 4, profiled: 3 });
    const proposal = state.proposal!;
    expect(
      proposal.resources.map((resource) => resource.relation),
    ).to.have.members(["erp.customers", "erp.orders", "erp.invoices"]);
    expect(proposal.excluded.map((entry) => entry.relation)).to.deep.equal([
      "erp.people",
    ]);
    const invoice = proposal.resources.find(
      (resource) => resource.relation === "erp.invoices",
    )!;
    expect(
      invoice.fields.find((field) => field.column === "order_id")?.relation,
    ).to.include({ value: "erp.orders", rule: "F5" });
  });

  it("describes and profiles only what is mappable, one relation at a time", () => {
    return analysed().then(() => {
      expect(calls.filter((call) => call.startsWith("Profile:"))).to.deep.equal(
        ["Profile:erp.customers", "Profile:erp.orders", "Profile:erp.invoices"],
      );
      expect(calls.some((call) => call.includes("erp.people"))).to.equal(false);
    });
  });

  it("leaves out what the module mapped or excluded, and points references at what it mapped", async () => {
    const mapped = await MapResources({
      module: MODULE,
      connection: "erp",
      resources: [
        {
          relation: "erp.orders",
          label: "reference",
          tableView: true,
          writable: false,
          fields: [{ column: "reference" }],
        },
      ],
      excluded: [{ relation: "erp.customers", reason: "not needed" }],
    });
    expectOk(mapped, "MapResources");
    const proposal = (await analysed()).proposal!;
    expect(
      proposal.resources.map((resource) => resource.relation),
    ).to.deep.equal(["erp.invoices"]);
    expect(calls).to.not.include("Profile:erp.orders");
    const invoice = proposal.resources[0];
    expect(
      invoice.fields.find((field) => field.column === "order_id")?.relation
        ?.value,
    ).to.equal("erp.orders");
  });

  it("refuses a connection the builder does not declare, and the project's own module", async () => {
    const unknown = await AnalyseDatabase({
      connection: "crm",
      module: MODULE,
    });
    expect(JSON.stringify(unknown)).to.include("importOverrides");
    const own = await AnalyseDatabase({ connection: "erp", module: "nope" });
    expect(own.ok).to.equal(false);
  });

  it("asks which schemas matter before profiling a large database", async () => {
    const many = Array.from({ length: 201 }, (_, index) =>
      Relation({
        relation: `big.t${index}`,
        key: ["id"],
        columns: [Column("id", "number")],
      }),
    );
    setCatalogConnectionsForTests({ erp: catalogOver(many) });
    try {
      const proposal = (await analysed()).proposal!;
      expect(proposal.open.map((item) => item.kind)).to.deep.equal(["schemas"]);
      expect(calls.some((call) => call.startsWith("Profile:"))).to.equal(false);
    } finally {
      setCatalogConnectionsForTests({ erp: catalogOver(RELATIONS) });
    }
  });
});
