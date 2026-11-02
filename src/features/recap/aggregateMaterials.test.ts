import { describe, expect, it } from "vitest";
import { aggregateMaterials } from "./aggregateMaterials";

describe("material recap", () => {
  it("multiplies model counts, aggregates stable material identity, then prices", () => {
    const frame = { materialCode: 10101, name: "kusen", unit: "m'", quantity: 5.754 };
    const rows = aggregateMaterials([
      { materials: [frame], modelCount: 2 },
      { materials: [frame], modelCount: 1 },
    ], { "manual:10101": 50000 });
    expect(rows).toMatchObject([{
      materialCode: 10101,
      name: "kusen",
      unit: "m'",
      quantity: 17.262,
      unitPrice: 50000,
      subtotal: 863100,
    }]);
  });

  it("keeps same-name materials with different units separate", () => {
    const rows = aggregateMaterials([
      { materials: [{ materialCode: 20101, name: "seal", unit: "pcs", quantity: 2 }], modelCount: 1 },
      { materials: [{ materialCode: 20201, name: "seal", unit: "m'", quantity: 3 }], modelCount: 1 },
    ], { "manual:20101": 10, "manual:20201": 20 });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.unit)).toEqual(["pcs", "m'"]);
  });

  it("marks an unset price distinctly instead of turning it into a zero price", () => {
    const rows = aggregateMaterials([
      { materials: [{ materialCode: 10101, name: "kusen", unit: "m'", quantity: 5.754 }], modelCount: 1 },
    ], {});
    expect(rows[0]).toMatchObject({ unitPrice: null, subtotal: null });
  });
});
