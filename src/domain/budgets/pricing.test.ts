import { describe, expect, it } from "vitest";
import { accessoryPriceOptions, budgetPriceForMaterial, displayMaterialName, excelColumnFromNumber, excelColumnToNumber, normalizeMaterialKey } from "./pricing";
import type { BudgetCatalogDetail } from "./types";

const detail: BudgetCatalogDetail = {
  catalog: { id: "catalog-1", slug: "hpm-inka-dacon", label: "HPM / INKA / DACON", position: 1, active: true },
  variants: [
    { id: "brown-id", key: "brown", label: "Brown", position: 1 },
    { id: "cream-id", key: "cream", label: "Putih / Cream", position: 2 },
    { id: "coating-id", key: "coating", label: "Coating", position: 3 },
  ],
  rules: [],
  mappings: [
    { materialKey: "engsel casement|pcs", materialName: "Engsel Casement", materialUnit: "pcs", componentId: "casement", active: true },
  ],
  components: [
    { id: "casement", key: "col_bb", sourceColumn: "BB", label: "Engsel Casement", unit: "pcs", category: "Aksesori", position: 1, prices: { brown: { amount: 100000, expression: null, version: 1 } } },
    { id: "kupu-4", key: "col_bc", sourceColumn: "BC", label: "Engsel Kupu 4 inch", unit: "pcs", category: "Aksesori", position: 2, prices: {
      brown: { amount: 55000, expression: null, version: 1 },
      cream: { amount: 56000, expression: null, version: 1 },
      coating: { amount: 57000, expression: null, version: 1 },
    } },
    { id: "kupu-km", key: "col_bi", sourceColumn: "BI", label: "Engsel Kupu KM", unit: "pcs", category: "Aksesori", position: 3, prices: {
      brown: { amount: 35000, expression: null, version: 1 },
      cream: { amount: 36000, expression: null, version: 1 },
      coating: { amount: 37000, expression: null, version: 1 },
    } },
    { id: "handle-set", key: "col_bd", sourceColumn: "BD", label: "Handle + kunci", unit: "pcs", category: "Aksesori", position: 4, prices: { brown: { amount: 350000, expression: null, version: 1 } } },
    { id: "handle-35", key: "col_be", sourceColumn: "BE", label: "Handle H P 35 cm", unit: "pcs", category: "Aksesori", position: 5, prices: { brown: { amount: 350000, expression: null, version: 1 } } },
    { id: "handle-45", key: "col_bf", sourceColumn: "BF", label: "Handle H P 45 cm", unit: "pcs", category: "Aksesori", position: 6, prices: { brown: { amount: 600000, expression: null, version: 1 } } },
    { id: "handle", key: "col_bg", sourceColumn: "BG", label: "Handle", unit: "pcs", category: "Aksesori", position: 7, prices: { brown: { amount: 0, expression: null, version: 1 } } },
    { id: "kunci-pelor", key: "col_bh", sourceColumn: "BH", label: "Kunci pelor", unit: "pcs", category: "Aksesori", position: 8, prices: { brown: { amount: 350000, expression: null, version: 1 } } },
    { id: "handle-km", key: "col_bj", sourceColumn: "BJ", label: "Handle Kunci KM", unit: "pcs", category: "Aksesori", position: 9, prices: { brown: { amount: 150000, expression: null, version: 1 } } },
    { id: "kunci-sliding-door", key: "col_bn", sourceColumn: "BN", label: "Kunci Sliding Pintu", unit: "pcs", category: "Aksesori", position: 10, prices: { brown: { amount: 250000, expression: null, version: 1 } } },
    { id: "kunci-sliding-window", key: "col_bo", sourceColumn: "BO", label: "Kunci Sliding Jendela RA", unit: "pcs", category: "Aksesori", position: 11, prices: { brown: { amount: 150000, expression: null, version: 1 } } },
  ],
};

describe("Excel column encoding", () => {
  it("round-trips single- and double-letter workbook columns", () => {
    for (const column of ["A", "R", "X", "AZ", "BA", "BB", "BC", "BD", "BI", "BN", "BO", "BU"]) {
      expect(excelColumnFromNumber(excelColumnToNumber(column))).toBe(column);
    }
  });

  it("uses distinct numeric values for accessory columns", () => {
    expect(excelColumnToNumber("BC")).toBe(55);
    expect(excelColumnToNumber("BI")).toBe(61);
    expect(excelColumnToNumber("BD")).toBe(56);
    expect(excelColumnToNumber("BF")).toBe(58);
  });
});

describe("legacy material display names", () => {
  it("shows canonical names for legacy snapshots", () => {
    expect(displayMaterialName("Engsel Casmat")).toBe("Engsel Casement");
    expect(displayMaterialName("Engsel casment")).toBe("Engsel Casement");
    expect(displayMaterialName("Rambancis")).toBe("Rambuncis");
    expect(displayMaterialName("Flashbolt")).toBe("Flushbolt");
  });
});

describe("model accessory price mapping", () => {
  it("normalizes common legacy spellings before looking up the mapping", () => {
    expect(normalizeMaterialKey("Engsel casmat", "pcs")).toBe("engsel casement|pcs");
    expect(normalizeMaterialKey("Engsel casment", "pcs")).toBe("engsel casement|pcs");
    expect(normalizeMaterialKey("Rambancis", "pcs")).toBe("rambuncis|pcs");
    expect(normalizeMaterialKey("Flashbolt", "pcs")).toBe("flushbolt|pcs");
  });

  it("uses the selected accessory type instead of the default mapping", () => {
    const result = budgetPriceForMaterial(detail, 10105, "Engsel kupu", "pcs", "brown-id", null, "BI");
    expect(result?.componentId).toBe("kupu-km");
    expect(result?.unitPrice).toBe(35000);
  });

  it("offers both butterfly hinge options and applies the first option by default", () => {
    expect(accessoryPriceOptions(detail, "Engsel kupu").map((item) => item.sourceColumn)).toEqual(["BC", "BI"]);
    const defaultPrice = budgetPriceForMaterial(detail, 10105, "Engsel kupu", "pcs", "brown-id", null, "BC");
    expect(defaultPrice?.unitPrice).toBe(55000);
  });

  it("recalculates the selected accessory when the finish variant changes", () => {
    const brown = budgetPriceForMaterial(detail, 10105, "Engsel kupu", "pcs", "brown-id", null, "BC");
    const cream = budgetPriceForMaterial(detail, 10105, "Engsel kupu", "pcs", "cream-id", null, "BC");
    const coating = budgetPriceForMaterial(detail, 10105, "Engsel kupu", "pcs", "coating-id", null, "BC");
    expect([brown?.unitPrice, cream?.unitPrice, coating?.unitPrice]).toEqual([55000, 56000, 57000]);
  });

  it("recognizes the plus sign in Handle + Kunci and offers its workbook variants", () => {
    expect(accessoryPriceOptions(detail, "Handel + kunci").map((item) => item.sourceColumn)).toEqual(["BD", "BE", "BF", "BG", "BH", "BJ"]);
    const selected = budgetPriceForMaterial(detail, 10106, "Handel + kunci", "set", "brown-id", null, "BF");
    expect(selected?.unitPrice).toBe(600000);
  });

  it("offers both sliding-lock variants", () => {
    expect(accessoryPriceOptions(detail, "Kunci Sliding").map((item) => item.sourceColumn)).toEqual(["BN", "BO"]);
    const selected = budgetPriceForMaterial(detail, 10108, "Kunci Sliding", "set", "brown-id", null, "BO");
    expect(selected?.unitPrice).toBe(150000);
  });

  it("keeps the standard mapping when no accessory variation is selected", () => {
    const result = budgetPriceForMaterial(detail, 20106, "Engsel casmat", "pcs", "brown-id");
    expect(result?.componentId).toBe("casement");
    expect(result?.unitPrice).toBe(100000);
  });
});