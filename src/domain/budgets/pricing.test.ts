import { describe, expect, it } from "vitest";
import { budgetPriceForMaterial, normalizeMaterialKey } from "./pricing";
import type { BudgetCatalogDetail } from "./types";

const detail: BudgetCatalogDetail = {
  catalog: { id: "catalog-1", slug: "hpm-inka-dacon", label: "HPM / INKA / DACON", position: 1, active: true },
  variants: [{ id: "brown-id", key: "brown", label: "Brown", position: 1 }],
  rules: [],
  mappings: [
    { materialKey: "engsel casement|pcs", materialName: "Engsel Casement", materialUnit: "pcs", componentId: "casement", active: true },
  ],
  components: [
    { id: "casement", key: "col_bb", sourceColumn: "BB", label: "Engsel Casement", unit: "pcs", category: "Aksesori", position: 1, prices: { brown: { amount: 100000, expression: null, version: 1 } } },
    { id: "kupu-4", key: "col_bc", sourceColumn: "BC", label: "Engsel Kupu 4 inch", unit: "pcs", category: "Aksesori", position: 2, prices: { brown: { amount: 55000, expression: null, version: 1 } } },
    { id: "kupu-km", key: "col_bi", sourceColumn: "BI", label: "Engsel Kupu KM", unit: "pcs", category: "Aksesori", position: 3, prices: { brown: { amount: 35000, expression: null, version: 1 } } },
  ],
};

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

  it("keeps the standard mapping when no accessory variation is selected", () => {
    const result = budgetPriceForMaterial(detail, 20106, "Engsel casmat", "pcs", "brown-id");
    expect(result?.componentId).toBe("casement");
    expect(result?.unitPrice).toBe(100000);
  });
});