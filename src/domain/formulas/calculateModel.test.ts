import { describe, expect, it } from "vitest";
import { calculateModel } from "./calculateModel";
import { doorCatalog } from "../catalog/doorCatalog";

describe("door model calculations", () => {
  it("calculates model 10100 dimensions, dependencies, and leaf counts", () => {
    const result = calculateModel(doorCatalog.get(10100)!, {
      T1: 2000,
      L1: 1754,
      daunPintu: 2,
    }, doorCatalog);
    expect(result.items.find((item) => item.code === 10101)?.quantity).toBe(5.754);
    expect(result.items.find((item) => item.code === 10105)?.quantity).toBe(6);
    expect(result.errors).toEqual([]);
  });

  it("calculates model 10200 glass area and one hinge per door leaf", () => {
    const result = calculateModel(doorCatalog.get(10200)!, {
      T1: 2000,
      L1: 1754,
      daunPintu: 2,
    }, doorCatalog);
    expect(result.items.find((item) => item.code === 10204)?.quantity).toBe(3.508);
    expect(result.items.find((item) => item.code === 10206)?.quantity).toBe(2);
  });

  it("reports missing formulas without returning a fake zero", () => {
    const incomplete = {
      code: 19900,
      groupCode: 10000,
      name: "Model incomplete",
      inputs: [] as const,
      status: "incomplete" as const,
      materials: [{ code: 19901, name: "contoh", unit: "pcs", expression: null, sourceCell: "L999" }],
    };
    const result = calculateModel(incomplete, {}, new Map([[incomplete.code, incomplete]]));
    expect(result.items).toEqual([]);
    expect(result.errors).toContainEqual({ materialCode: 19901, reason: "Rumus belum tersedia" });
  });

  it("rejects cyclic formula dependencies", () => {
    const cyclic = {
      code: 19800,
      groupCode: 10000,
      name: "Model siklus",
      inputs: [] as const,
      status: "ready" as const,
      materials: [
        { code: 19801, name: "A", unit: "pcs", expression: "qty_19802", sourceCell: "L1" },
        { code: 19802, name: "B", unit: "pcs", expression: "qty_19801", sourceCell: "L2" },
      ],
    };
    const result = calculateModel(cyclic, {}, new Map([[cyclic.code, cyclic]]));
    expect(result.items).toEqual([]);
    expect(result.errors.every((item) => item.reason === "Ketergantungan rumus melingkar")).toBe(true);
  });
});
