import type { BudgetCatalogDetail } from "./types";
import { resolveBudgetPrice } from "./calculateBudget";

export function displayMaterialName(name: string): string {
  const normalized = name.normalize("NFKC").trim().replace(/\\s+/g, " ").toLocaleLowerCase("id-ID");
  if (/^engsel casm(at|ent|et)$/.test(normalized)) return "Engsel Casement";
  if (normalized === "rambancis") return "Rambuncis";
  if (normalized === "flashbolt") return "Flushbolt";
  return name;
}

export function excelColumnToNumber(column: string): number {
  return [...column.toUpperCase()].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);
}

export function excelColumnFromNumber(number: number): string {
  if (!Number.isInteger(number) || number < 1) return "";
  let value = number;
  let column = "";
  while (value > 0) {
    value -= 1;
    column = String.fromCharCode(65 + (value % 26)) + column;
    value = Math.floor(value / 26);
  }
  return column;
}

function canonicalMaterialName(name: string): string {
  const normalized = name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
  if (/^engsel casm(at|ent|et)$/.test(normalized)) return "engsel casement";
  if (normalized === "rambancis") return "rambuncis";
  if (normalized === "flashbolt") return "flushbolt";
  return normalized;
}

export function normalizeMaterialKey(name: string, unit: string): string {
  const normalizedUnit = unit.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
  return `${canonicalMaterialName(name)}|${normalizedUnit}`;
}
export function accessoryPriceOptions(detail: BudgetCatalogDetail | undefined, materialName: string) {
  if (!detail) return [];
  const name = materialName.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
  let allowedColumns: string[] = [];
  if (name.includes("engsel kupu")) allowedColumns = ["BC", "BI"];
  else if (name.includes("kunci sliding")) allowedColumns = ["BN", "BO"];
  else if (/^(handel|handle)\s*\+\s*kunci$/.test(name) || /^handle$/.test(name)) {
    allowedColumns = ["BD", "BE", "BF", "BG", "BH", "BJ", "BM", "BR"];
  }
  return detail.components
    .filter((component) => allowedColumns.includes(component.sourceColumn))
    .sort((a, b) => a.position - b.position);
}

export function budgetPriceForMaterial(
  detail: BudgetCatalogDetail | undefined,
  materialCode: number,
  name: string,
  unit: string,
  variantId: string | null | undefined,
  doorLeafSourceColumn?: string | null,
  accessorySourceColumn?: string | null,
) {
  if (!detail || !variantId) return null;
  const mapping = detail.mappings.find((item) => item.materialKey === normalizeMaterialKey(name, unit) && item.active);
  const selectedDoorLeaf = doorLeafSourceColumn && /^[R-X]$/.test(doorLeafSourceColumn)
    ? detail.components.find((item) => item.sourceColumn === doorLeafSourceColumn)
    : undefined;
  const selectedAccessory = accessorySourceColumn && /^[A-Z]{2}$/.test(accessorySourceColumn)
    ? detail.components.find((item) => item.sourceColumn === accessorySourceColumn)
    : undefined;
  const component = selectedDoorLeaf ?? selectedAccessory ?? (mapping?.componentId ? detail.components.find((item) => item.id === mapping.componentId) : undefined);
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
