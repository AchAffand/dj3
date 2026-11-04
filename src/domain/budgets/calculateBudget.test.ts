import { describe, expect, it } from "vitest";
import { resolveBudgetPrice } from "./calculateBudget";
import type { BudgetCatalogDetail } from "./types";

function makeDetail(includeBaseVariant = false): BudgetCatalogDetail {
  const variants = [
    ...(includeBaseVariant ? [{ id: "variant-base", key: "base", label: "Base", position: 0 }] : []),
    { id: "variant-brown", key: "brown", label: "Brown", position: 1 },
    { id: "variant-cream", key: "cream", label: "Putih / Cream", position: 2 },
    { id: "variant-coating", key: "coating", label: "Coating", position: 3 },
  ];
  return {
    catalog: { id: "catalog-1", slug: "hpm-inka-dacon", label: "HPM / INKA / DACON", position: 1, active: true },
    variants,
    rules: [],
    mappings: [],
    components: [{
      id: "component-j",
      key: "col_j",
      sourceColumn: "J",
      label: "Kusen",
      unit: "m'",
      category: "Kusen",
      position: 1,
      prices: {
        brown: { amount: 117000, expression: null, version: 1 },
        cream: { amount: null, expression: "price_col_j_base + 5000", version: 1 },
        coating: { amount: null, expression: "price_col_j_base + 15000", version: 1 },
        ...(includeBaseVariant ? { base: { amount: 110000, expression: null, version: 1 } } : {}),
      },
    }],
  };
}

describe("resolveBudgetPrice base variant references", () => {
  it("uses Brown as the base price when the catalog has no base variant", () => {
    const detail = makeDetail();
    expect(resolveBudgetPrice(detail, "component-j", "variant-cream")).toBe(122000);
    expect(resolveBudgetPrice(detail, "component-j", "variant-coating")).toBe(132000);
  });

  it("prefers an explicit base variant when the catalog provides one", () => {
    const detail = makeDetail(true);
    expect(resolveBudgetPrice(detail, "component-j", "variant-cream")).toBe(115000);
    expect(resolveBudgetPrice(detail, "component-j", "variant-coating")).toBe(125000);
  });
});
