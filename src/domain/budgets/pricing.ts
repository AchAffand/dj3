import type { BudgetCatalogDetail } from "./types";
import { resolveBudgetPrice } from "./calculateBudget";

function canonicalMaterialName(name: string): string {
  const normalized = name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
  if (/^engsel casm(at|ent|et)$/.test(normalized)) return "engsel casement";
  if (normalized === "rambancis") return "rambuncis";
  if (normalized === "flashbolt") return "flushbolt";
  return normalized;
}

export function normalizeMaterialDisplayName(name: string): string {
  const canonical = canonicalMaterialName(name);
  if (canonical === "engsel casement") return "Engsel Casement";
  if (canonical === "rambuncis") return "Rambuncis";
  if (canonical === "flushbolt") return "Flushbolt";
  return name.trim().replace(/\s+/g, " ");
}

export function excelColumnToNumber(column: string): number {
  let result = 0;
  for (const char of column.toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) return 0;
    result = result * 26 + code - 64;
  }
  return result;
}

export function excelColumnFromNumber(value: number): string {
  if (!Number.isInteger(value) || value < 1) return "";
  let current = value;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
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

export function windowPriceOptions(detail: BudgetCatalogDetail | undefined) {
  if (!detail) return [];
  return detail.components
    .filter((component) => ["AA", "AB", "AC"].includes(component.sourceColumn))
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
  windowSourceColumn?: string | null,
) {
  if (!detail || !variantId) return null;
  const mapping = detail.mappings.find((item) => item.materialKey === normalizeMaterialKey(name, unit) && item.active);
  const selectedDoorLeaf = doorLeafSourceColumn && /^[R-X]$/.test(doorLeafSourceColumn)
    ? detail.components.find((item) => item.sourceColumn === doorLeafSourceColumn)
    : undefined;
  const selectedAccessory = accessorySourceColumn && /^[A-Z]{2}$/.test(accessorySourceColumn)
    ? detail.components.find((item) => item.sourceColumn === accessorySourceColumn)
    : undefined;
  const selectedWindow = windowSourceColumn && ["AA", "AB", "AC"].includes(windowSourceColumn)
    ? detail.components.find((item) => item.sourceColumn === windowSourceColumn)
    : undefined;
  const component = selectedDoorLeaf ?? selectedAccessory ?? selectedWindow ?? (mapping?.componentId ? detail.components.find((item) => item.id === mapping.componentId) : undefined);
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
