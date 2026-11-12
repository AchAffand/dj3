import { describe, expect, it } from "vitest";
import { accessoryPriceOptions, budgetPriceForMaterial, glassPriceOptions, isAccessoryMaterial, isGlassMaterial, windowPriceOptions, excelColumnFromNumber, excelColumnToNumber, normalizeMaterialDisplayName, normalizeMaterialKey } from "./pricing";
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
    { id: "window-casement", key: "col_aa", sourceColumn: "AA", label: "JENDELA CASEMENT/ M'", unit: "", category: "Daun pintu", position: 12, prices: { brown: { amount: 150000, expression: null, version: 1 } } },
    { id: "window-sliding", key: "col_ab", sourceColumn: "AB", label: "JENDELA SLIDING/ M'", unit: "", category: "Daun pintu", position: 13, prices: { brown: { amount: 185000, expression: null, version: 1 } } },
    { id: "window-pivot", key: "col_ac", sourceColumn: "AC", label: "DAUN JENDELA PIVOT / M'", unit: "", category: "Pintu dan jendela", position: 14, prices: { brown: { amount: 150000, expression: null, version: 1 } } },
  ],
};

describe("model accessory price mapping", () => {
  it("converts full Excel column names to and from numeric input values", () => {
    expect(excelColumnToNumber("BC")).toBe(55);
    expect(excelColumnToNumber("BI")).toBe(61);
    expect(excelColumnToNumber("BD")).toBe(56);
    expect(excelColumnToNumber("BO")).toBe(67);
    expect(excelColumnFromNumber(55)).toBe("BC");
    expect(excelColumnFromNumber(61)).toBe("BI");
    expect(excelColumnFromNumber(56)).toBe("BD");
    expect(excelColumnFromNumber(67)).toBe("BO");
  });

  it("normalizes legacy display names as well as their matching keys", () => {
    expect(normalizeMaterialDisplayName("Engsel casmat")).toBe("Engsel Casement");
    expect(normalizeMaterialDisplayName("Engsel casment")).toBe("Engsel Casement");
  });

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

  it("offers the three supported window types in workbook order", () => {
    expect(windowPriceOptions(detail).map((item) => item.sourceColumn)).toEqual(["AA", "AB", "AC"]);
  });

  it("uses the explicitly selected window component even without a material mapping", () => {
    const casement = budgetPriceForMaterial(detail, 20202, "Jendela", "m'", "brown-id", null, null, "AA");
    const sliding = budgetPriceForMaterial(detail, 20202, "Jendela", "m'", "brown-id", null, null, "AB");
    const pivot = budgetPriceForMaterial(detail, 20202, "Jendela", "m'", "brown-id", null, null, "AC");
    expect([casement?.unitPrice, sliding?.unitPrice, pivot?.unitPrice]).toEqual([150000, 185000, 150000]);
    expect([casement?.componentId, sliding?.componentId, pivot?.componentId]).toEqual(["window-casement", "window-sliding", "window-pivot"]);
  });

  it("keeps the standard mapping when no accessory variation is selected", () => {
    const result = budgetPriceForMaterial(detail, 20106, "Engsel casmat", "pcs", "brown-id");
    expect(result?.componentId).toBe("casement");
    expect(result?.unitPrice).toBe(100000);
  });
});

describe("independent glass and accessory catalog selection", () => {
  const glassDetail: BudgetCatalogDetail = {
    catalog: { id: "glass-catalog", slug: "kaca-umum", label: "Kaca", position: 4, active: true },
    variants: [{ id: "glass-standard", key: "standar", label: "Standar", position: 1 }],
    rules: [],
    mappings: [],
    components: [
      { id: "glass-clear", key: "glass_01", sourceColumn: "A", label: "KACA POLOS 5 MM / M2", unit: "", category: "Kaca", position: 1, prices: { standar: { amount: 300000, expression: null, version: 1 } } },
      { id: "glass-tempered", key: "glass_02", sourceColumn: "B", label: "KACA TEMPERED 8 MM / M2", unit: "", category: "Kaca", position: 2, prices: { standar: { amount: 850000, expression: null, version: 1 } } },
    ],
  };

  const accessoryDetail: BudgetCatalogDetail = {
    catalog: { id: "accessory-catalog", slug: "aksesoris-umum", label: "Aksesoris", position: 5, active: true },
    variants: [{ id: "accessory-standard", key: "standar", label: "Standar", position: 1 }],
    rules: [],
    mappings: [],
    components: [
      { id: "hinge-four", key: "col_bc", sourceColumn: "BC", label: "Engsel Kupu 4 inch", unit: "pcs", category: "Aksesori", position: 1, prices: { standar: { amount: 55000, expression: null, version: 1 } } },
      { id: "hinge-km", key: "col_bi", sourceColumn: "BI", label: "Engsel Kupu KM", unit: "pcs", category: "Aksesori", position: 2, prices: { standar: { amount: 35000, expression: null, version: 1 } } },
    ],
  };

  it("identifies glass materials without capturing combined ACP/spandrel materials", () => {
    expect(isGlassMaterial({ name: "Kaca", unit: "m\"" })).toBe(true);
    expect(isGlassMaterial({ name: "kaca/jendela", unit: "m\"" })).toBe(true);
    expect(isGlassMaterial({ name: "kaca/acp/spndrel/pintu", unit: "m\"" })).toBe(false);\n    expect(isGlassMaterial({ name: "Kaca", unit: "m\'" })).toBe(false);
  });

  it("recognizes accessories that still need a price entered by an administrator", () => {
    expect(isAccessoryMaterial({ name: "Doorcloser", unit: "set" })).toBe(true);
    expect(isAccessoryMaterial({ name: "Kunci Folding", unit: "set" })).toBe(true);
    expect(isAccessoryMaterial({ name: "Engsel Pintu", unit: "set" })).toBe(true);
    expect(isAccessoryMaterial({ name: "Handle", unit: "m'" })).toBe(false);
  });

  it("offers independent glass choices and calculates the selected glass item", () => {
    expect(glassPriceOptions(glassDetail).map((item) => item.sourceColumn)).toEqual(["A", "B"]);
    const selected = budgetPriceForMaterial(glassDetail, 20201, "Kaca", 'm"', "glass-standard", null, null, null, "B");
    expect(selected?.componentId).toBe("glass-tempered");
    expect(selected?.unitPrice).toBe(850000);
    expect(selected?.priceKey).toBe("glass-catalog:glass-standard:20201:glass-tempered");
  });

  it("uses the shared accessory catalog while retaining individual accessory options", () => {
    expect(accessoryPriceOptions(accessoryDetail, "Engsel kupu").map((item) => item.sourceColumn)).toEqual(["BC", "BI"]);
    const selected = budgetPriceForMaterial(accessoryDetail, 10105, "Engsel kupu", "pcs", "accessory-standard", null, "BI");
    expect(selected?.componentId).toBe("hinge-km");
    expect(selected?.unitPrice).toBe(35000);
  });
});
