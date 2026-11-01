import { expect } from "chai";
import { canonicalBody } from "../implementations/dms-builder/engine/query-chain";
import {
  emitPlan,
  type QueryPlan,
} from "../implementations/dms-builder/engine/query-plan";
import {
  executePlan,
  type PlanArguments,
  type PlanRow,
  type PlanStream,
  type PlanValue,
} from "../implementations/dms-builder/engine/query-plan-execute";
import type { ResourceFieldStructure } from "@antelopejs/interface-dms-builder";

function field(name: string, dataType: string): ResourceFieldStructure {
  return { name, dataType: { $dataType: dataType } };
}

const FIELDS = [
  field("amount", "number"),
  field("status", "string"),
  field("createdAt", "date"),
  field("archived", "boolean"),
];

/** The source text a value or a stream was written down as. */
interface Transcript {
  text: string;
}

function carriesText(node: unknown): node is Transcript {
  return (
    typeof node === "object" &&
    node !== null &&
    "text" in node &&
    typeof node.text === "string"
  );
}

/** A value, written down rather than computed. */
function value(text: string): PlanValue & Transcript {
  const call =
    (name: string): PlanValue["eq"] =>
    (argument) =>
      value(
        argument === undefined
          ? `${text}.${name}()`
          : `${text}.${name}(${literal(argument)})`,
      );
  return {
    text,
    eq: call("eq"),
    ne: call("ne"),
    gt: call("gt"),
    ge: call("ge"),
    lt: call("lt"),
    le: call("le"),
    year: call("year"),
    month: call("month"),
    day: call("day"),
    dayofyear: call("dayofyear"),
    dayofweek: call("dayofweek"),
    mul: call("mul"),
    div: call("div"),
    add: call("add"),
    sub: call("sub"),
    floor: () => value(`${text}.floor()`),
  };
}

function literal(input: unknown): string {
  if (input instanceof Date) {
    return `new Date(${JSON.stringify(input.toISOString())})`;
  }
  if (carriesText(input)) {
    return input.text;
  }
  return JSON.stringify(input);
}

function members(fields: unknown): string {
  const entries = Object.entries(fields ?? {}).map(
    ([key, member]) => `${key}: ${textOf(member)}`,
  );
  return `{ ${entries.join(", ")} }`;
}

function textOf(node: unknown): string {
  return carriesText(node) ? node.text : literal(node);
}

/**
 * A stream that writes down what it is asked to do instead of querying anything.
 *
 * The executor and the emitter are two renderings of one plan, and nothing but a
 * test keeps them saying the same thing: this one transcribes the calls back into
 * the source the emitter writes, so any divergence is a failing assertion rather
 * than a preview that disagrees with the page it previews.
 */
function stream(text: string): PlanStream & Transcript {
  return {
    text,
    filter: (predicate) =>
      stream(`${text}.filter((row) => ${textOf(predicate(row("row")))})`),
    map: (mapper) =>
      stream(`${text}.map((row) => (${members(mapper(row("row")))}))`),
    group: (index, mapper) =>
      stream(
        `${text}.group(${JSON.stringify(index)}, (rows, group) => (${members(
          mapper(stream("rows"), value("group")),
        )}))`,
      ),
    orderBy: (index: string, direction?: "asc" | "desc") =>
      stream(
        `${text}.orderBy(${JSON.stringify(index)}, ${JSON.stringify(direction)})`,
      ),
    slice: (offset: number, count?: number) =>
      stream(`${text}.slice(${offset}, ${count})`),
    count: () => value(`${text}.count()`),
    sum: (over?: string) => value(`${text}.sum(${JSON.stringify(over)})`),
    avg: (over?: string) => value(`${text}.avg(${JSON.stringify(over)})`),
    min: (over?: string) => value(`${text}.min(${JSON.stringify(over)})`),
    max: (over?: string) => value(`${text}.max(${JSON.stringify(over)})`),
  };
}

function row(name: string): PlanRow {
  return {
    key: (name2: string) => value(`${name}.key(${JSON.stringify(name2)})`),
  };
}

/** What the executor would run, written as the emitter would have written it. */
function ran(plan: QueryPlan, args: PlanArguments = {}): string {
  const result = executePlan(stream("this.table"), plan, FIELDS, args);
  return `{ return ${textOf(result)}; }`;
}

const COUNT = { kind: "count" } as const;
const SUM_AMOUNT = { kind: "aggregate", op: "sum", field: "amount" } as const;

/**
 * Running a plan and writing it are the same calculation twice, and a preview
 * that disagreed with the code it previews would be worse than no preview. Each
 * case asserts the two renderings agree, compared on the calculation rather than
 * on the layout: where the emitter breaks its chain across lines is its own
 * business, and pinning it would make every formatting change look like a
 * divergence between the two backends.
 */
describe("running a plan", () => {
  const renderings = (plan: QueryPlan) => ({
    executed: canonicalBody(ran(plan), []),
    written: canonicalBody(emitPlan(plan, FIELDS).body, []),
  });

  it("counts every row", () => {
    const { executed, written } = renderings({ filters: [], measure: COUNT });
    expect(executed).to.equal(written);
  });

  it("aggregates a field", () => {
    const { executed, written } = renderings({
      filters: [],
      measure: SUM_AMOUNT,
    });
    expect(executed).to.equal(written);
  });

  it("narrows the rows first", () => {
    const { executed, written } = renderings({
      filters: [
        { field: "status", op: "eq", value: "paid" },
        { field: "amount", op: "gt", value: 10 },
      ],
      measure: SUM_AMOUNT,
    });
    expect(executed).to.equal(written);
  });

  it("compares a date as a date", () => {
    const { executed, written } = renderings({
      filters: [
        { field: "createdAt", op: "ge", value: "2026-01-01T00:00:00.000Z" },
      ],
      measure: COUNT,
    });
    expect(executed).to.equal(written);
  });

  it("groups by a field", () => {
    const { executed, written } = renderings({
      filters: [],
      measure: COUNT,
      group: { field: "status" },
    });
    expect(executed).to.equal(written);
  });

  it("groups by a month, carrying the measured field", () => {
    const { executed, written } = renderings({
      filters: [{ field: "status", op: "eq", value: "paid" }],
      measure: SUM_AMOUNT,
      group: {
        field: "createdAt",
        bucket: "month",
        timezone: "Europe/Brussels",
      },
    });
    expect(executed).to.equal(written);
  });

  for (const bucket of ["day", "week", "month", "quarter", "year"] as const) {
    it(`buckets by ${bucket} the same way`, () => {
      const { executed, written } = renderings({
        filters: [],
        measure: COUNT,
        group: { field: "createdAt", bucket },
      });
      expect(executed).to.equal(written);
    });
  }

  it("orders and limits a ranking", () => {
    const { executed, written } = renderings({
      filters: [],
      measure: SUM_AMOUNT,
      group: { field: "status" },
      order: { by: "measure", direction: "desc" },
      limit: 5,
    });
    expect(executed).to.equal(written);
  });

  describe("values supplied per request", () => {
    const bound: QueryPlan = {
      filters: [
        { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
        { field: "amount", op: "lt", value: { $param: { name: "cap" } } },
      ],
      measure: COUNT,
    };

    it("substitutes the argument the route would have passed", () => {
      const text = ran(bound, {
        from: "2026-01-01T00:00:00.000Z",
        cap: 100,
      });
      expect(
        text,
        "a date argument is coerced, as the route coerces it",
      ).to.contain(
        'row.key("createdAt").ge(new Date("2026-01-01T00:00:00.000Z"))',
      );
      expect(text).to.contain('row.key("amount").lt(100)');
    });

    it("takes a Date it was handed as it is", () => {
      const text = ran(bound, {
        from: new Date("2026-03-01T00:00:00.000Z"),
        cap: 1,
      });
      expect(text).to.contain('new Date("2026-03-01T00:00:00.000Z")');
    });

    it("coerces a number the way the route's `Number(x)` does", () => {
      const text = ran(bound, { from: "2026-01-01T00:00:00.000Z", cap: "100" });
      expect(text).to.contain('row.key("amount").lt(100)');
      expect(text).to.not.contain('lt("100")');
    });

    it('coerces a boolean the way the route\'s `x === "true"` does', () => {
      const flagged: QueryPlan = {
        filters: [
          {
            field: "archived",
            op: "eq",
            value: { $param: { name: "archived" } },
          },
        ],
        measure: COUNT,
      };
      expect(ran(flagged, { archived: "false" })).to.contain(
        'row.key("archived").eq(false)',
      );
      expect(ran(flagged, { archived: "true" })).to.contain(
        'row.key("archived").eq(true)',
      );
    });

    it("refuses before building anything, not inside a predicate", () => {
      const table = stream("this.table");
      let built = false;
      const watched = {
        ...table,
        filter: () => {
          built = true;
          return table;
        },
      };
      expect(() =>
        executePlan(watched, bound, FIELDS, {
          from: "2026-01-01T00:00:00.000Z",
        }),
      ).to.throw(/"cap"/);
      expect(built, "no call was built before it refused").to.equal(false);
    });
  });
});
