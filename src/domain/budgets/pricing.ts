import type { BudgetCatalogDetail } from "./types";
import { resolveBudgetPrice } from "./calculateBudget";

export function normalizeMaterialKey(name: string, unit: string): string {
  return `${name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID")}|${unit.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID")}`;
}

export function budgetPriceForMaterial(
  detail: BudgetCatalogDetail | undefined,
  materialCode: number,
  name: string,
  unit: string,
  variantId: string | null | undefined,
  doorLeafSourceColumn?: string | null,
) {
  if (!detail || !variantId) return null;
  const mapping = detail.mappings.find((item) => item.materialKey === normalizeMaterialKey(name, unit) && item.active);
  if (!mapping?.componentId) return null;
  const selectedDoorLeaf = doorLeafSourceColumn && /^[R-X]$/.test(doorLeafSourceColumn)
    ? detail.components.find((item) => item.sourceColumn === doorLeafSourceColumn && item.active)
    : undefined;
  const component = selectedDoorLeaf ?? detail.components.find((item) => item.id === mapping.componentId);
  const variant = detail.variants.find((item) => item.id === variantId);
  if (!component || !variant) return null;
  const price = component.prices[variant.key];
  if (!price || (price.amount === null && !price.expression)) return null;
  try {
    return {
      priceKey: `${detail.catalog.id}:${variant.id}:${materialCode}`,
      catalogId: detail.catalog.id,
      variantId: variant.id,
      unitPrice: resolveBudgetPrice(detail, component.id, variant.id),
      priceVersion: price.version,
      expressionSnapshot: price.expression,
      componentId: component.id,
      priceSourceLabel: `${detail.catalog.label} · ${variant.label}`,
    };
  } catch {
    return null;
  }
}
