import { describe, expect, it } from "vitest";
import { doorCatalog } from "./doorCatalog";
import { modelGroupLabel } from "./types";
import { calculateModel } from "../formulas/calculateModel";

describe("workbook-derived door catalog", () => {
  it("includes the source door models in hundred-code increments", () => {
    expect(doorCatalog.size).toBe(100);
    expect([...doorCatalog.keys()].filter((code) => Math.floor(code / 10000) * 10000 === 10000))
      .toEqual(Array.from({ length: 23 }, (_, index) => 10100 + index * 100));
    expect([...doorCatalog.keys()].filter((code) => Math.floor(code / 10000) * 10000 === 30000))
      .toEqual(Array.from({ length: 56 }, (_, index) => 30100 + index * 100));
    expect([...doorCatalog.keys()].filter((code) => Math.floor(code / 10000) * 10000 === 40000))
      .toEqual(Array.from({ length: 21 }, (_, index) => 40100 + index * 100));
    expect(doorCatalog.get(30100)).toMatchObject({ code: 30100, groupCode: 30000 });
    expect(doorCatalog.get(40100)).toMatchObject({ code: 40100, groupCode: 40000 });
  });

  it("labels each model family represented in the door workbook", () => {
    expect(modelGroupLabel(10000)).toBe("Pintu");
    expect(modelGroupLabel(30000)).toBe("Pintu Jendela");
    expect(modelGroupLabel(40000)).toBe("Pintu Sliding");
  });

  it("preserves item codes, units, and stable same-model quantity references", () => {
    const model = doorCatalog.get(10100)!;
    expect(model.materials.find((item) => item.code === 10101)).toMatchObject({
      name: "kusen",
      unit: "m'",
      expression: "(T1*2+L1)/1000",
      sourceCell: "L2",
    });
    expect(model.materials.find((item) => item.code === 10102)?.expression).toBe("qty_10101");
    expect(model.materials.some((item) => item.name === "-")).toBe(false);
  });

  it("keeps workbook qty references to material codes outside the selected model", () => {
    expect(doorCatalog.get(10500)?.materials.find((item) => item.code === 10502)?.expression)
      .toBe("qty_10101");
  });

  it("preserves the Excel blank-cell-as-zero reference found in model 30500", () => {
    expect(doorCatalog.get(30500)?.materials.find((item) => item.code === 30501)).toMatchObject({
      expression: "(T1*4+L2*3*2+0)/1000",
      sourceFormula: "=(C2*4+F2*3*2+D321)/1000",
      sourceCachedQuantity: 11,
    });
  });

  it("keeps 34200 accessories together and records their mistyped source codes", () => {
    expect(doorCatalog.get(34200)?.materials.find((item) => item.code === 34204)).toMatchObject({
      sourceCode: 34104,
      name: "coak",
      unit: "pcs",
    });
  });

  it("uses the confirmed model 12100 frame formula against project inputs", () => {
    const model = doorCatalog.get(12100)!;
    expect(model.materials.find((item) => item.code === 12101)).toMatchObject({
      expression: "((T1+T2)*2+L1*2)/1000",
      sourceCell: "L242",
    });
    const result = calculateModel(model, {
      T1: 2000,
      L1: 1754,
      T2: 500,
      L2: 500,
      T3: 1000,
      L3: 500,
      daunPintu: 2,
      daunJendela: 1,
    }, doorCatalog);
    expect(result.items.find((item) => item.code === 12101)?.quantity).toBe(8.508);
    expect(result.errors).toEqual([]);
  });

  it("matches cached workbook examples for complete models", () => {
    const door10100 = calculateModel(doorCatalog.get(10100)!, { T1: 2000, L1: 1754, daunPintu: 2 }, doorCatalog);
    const door10200 = calculateModel(doorCatalog.get(10200)!, { T1: 2000, L1: 1754, daunPintu: 2 }, doorCatalog);
    expect(door10100.items.find((item) => item.code === 10101)?.quantity).toBe(5.754);
    expect(door10200.items.find((item) => item.code === 10204)?.quantity).toBe(3.508);
    expect(door10200.items.find((item) => item.code === 10206)?.quantity).toBe(2);
  });

  it("matches every numeric cached qty from the workbook's sample dimensions", () => {
    const inputs = {
      T1: 2000,
      L1: 1754,
      T2: 500,
      L2: 500,
      T3: 1000,
      L3: 500,
      daunPintu: 2,
      daunJendela: 2,
    };
    for (const model of doorCatalog.values()) {
      const result = calculateModel(model, inputs, doorCatalog);
      expect(result.errors.map((error) => error.materialCode).sort((a, b) => a - b), `model ${model.code}`)
        .toEqual(model.materials.filter((item) => !item.expression).map((item) => item.code).sort((a, b) => a - b));
      for (const sourceItem of model.materials) {
        if (sourceItem.code === 12101 || typeof sourceItem.sourceCachedQuantity !== "number") continue;
        const actual = result.items.find((item) => item.code === sourceItem.code)?.quantity;
        expect(actual, `material ${sourceItem.code}`).toBeCloseTo(sourceItem.sourceCachedQuantity, 8);
      }
    }
  });
});
