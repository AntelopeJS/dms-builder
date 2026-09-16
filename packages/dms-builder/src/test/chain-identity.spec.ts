import { expect } from "chai";
import { canonicalChain } from "../implementations/dms-builder/engine/query-chain";

/**
 * Two queries may share one model method only when they compute the same thing.
 * That judgement is this key, and it decides whether reconfiguring a query
 * rewrites its method or quietly reuses another — so what it does and does not
 * distinguish is worth stating outright.
 */
describe("a chain's identity", () => {
  it("is the same for chains that differ only in what a bound value is called", () => {
    const left = canonicalChain("count", {
      where: [{ field: "price", op: "lt", value: { $param: { name: "max" } } }],
    });
    const right = canonicalChain("count", {
      where: [{ field: "price", op: "lt", value: { $bind: "maxPrice" } }],
    });
    expect(left).to.equal(right);
  });

  it("differs as soon as a baked value differs", () => {
    const of = (value: number) =>
      canonicalChain("count", {
        where: [{ field: "price", op: "lt", value }],
      });
    expect(of(10)).to.not.equal(of(20));
  });

  it("counts every parameter, not a fixed list of them", () => {
    const of = (params: Record<string, unknown>) =>
      canonicalChain("series", { op: "sum", field: "amount", ...params });

    // The regression this guards: a key outside the known list was ignored, so
    // a series and the same series bucketed differently read as one chain —
    // and reconfiguring one reused the other's method, changing nothing.
    expect(
      of({ groupBy: "createdAt", bucket: "month" }),
      "the period is part of what a chain computes",
    ).to.not.equal(of({ groupBy: "createdAt", bucket: "quarter" }));

    expect(of({ groupBy: "status" })).to.not.equal(of({ groupBy: "country" }));
    expect(of({ groupBy: "status", limit: 5 })).to.not.equal(
      of({ groupBy: "status", limit: 10 }),
    );
    expect(of({ groupBy: "status", direction: "asc" })).to.not.equal(
      of({ groupBy: "status", direction: "desc" }),
    );
    expect(
      of({
        groupBy: "createdAt",
        bucket: "month",
        timezone: "Europe/Brussels",
      }),
      "the zone changes which rows land in which period",
    ).to.not.equal(of({ groupBy: "createdAt", bucket: "month" }));
  });

  it("ignores the order the parameters were written in", () => {
    expect(
      canonicalChain("series", { groupBy: "status", op: "count", limit: 5 }),
    ).to.equal(
      canonicalChain("series", { limit: 5, groupBy: "status", op: "count" }),
    );
  });

  it("treats an absent parameter as absent, not as a value", () => {
    expect(canonicalChain("count", { where: undefined })).to.equal(
      canonicalChain("count", {}),
    );
  });
});
