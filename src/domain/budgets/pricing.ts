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

export function isDoorLeafMaterial(material: { name: string; unit: string; expression?: string | null }): boolean {
  const name = material.name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
  const unit = material.unit.normalize("NFKC").trim().toLocaleLowerCase("id-ID");
  if (/^daun pintu$/.test(name) && ["unit", "daun"].includes(unit)) return true;
  // Some models label the leaf material simply "Pintu" (unit: set).
  // Only treat it as a leaf selector when its formula explicitly uses daunPintu;
  // linear-meter door-frame formulas remain untouched.
  return name === "pintu" && ["set", "unit", "daun"].includes(unit) && /\bdaunPintu\b/i.test(material.expression ?? "");
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
export function isGlassMaterial(material: { name: string; unit?: string }): boolean {
  const name = material.name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
  const unit = (material.unit ?? "").normalize("NFKC").trim().toLocaleLowerCase("id-ID");
  if (["m'", "m''", "m’", "m″"].includes(unit)) return false;
  if (/^kaca\s*\/\s*(acp|spndrel|spandrel)|^kaca\/acp\//.test(name)) return false;
  return /^(kaca|kaca jendela|kaca\/jendela|kaca temp(?:ered)?\s*12mm)$/.test(name)
    || /^kaca\s+(polos|es|riben|cermin|sunblast|tempered)\b/.test(name);
}

export function isAccessoryMaterial(material: { name: string; unit?: string }): boolean {
  const name = canonicalMaterialName(material.name);
  const unit = (material.unit ?? "").normalize("NFKC").trim().toLocaleLowerCase("id-ID");
  if (name === "handle" && !["pcs", "set"].includes(unit)) return false;
  return /rambuncis|engsel|handel|handle|kunci sliding|kunci folding|kunci ra|flushbolt|bracket|rell sliding|rel sliding|roda (?:sliding|atas|bawah)|doorcloser/.test(name);
}

export function glassPriceOptions(detail: BudgetCatalogDetail | undefined) {
  if (!detail) return [];
  return detail.components
    .filter((component) => component.category === "Kaca" && !/^sealant\b/i.test(component.label))
    .sort((a, b) => a.position - b.position);
}

export function accessoryPriceOptions(detail: BudgetCatalogDetail | undefined, materialName: string) {
  if (!detail) return [];
  const name = canonicalMaterialName(materialName);
  let allowedColumns: string[] = [];
  if (name.includes("engsel kupu")) allowedColumns = ["BC", "BI"];
  else if (name.includes("kunci sliding")) allowedColumns = ["BN", "BO"];
  else if (/^(handel|handle)\s*\+\s*kunci$/.test(name) || /^handle$/.test(name)) {
    allowedColumns = ["BD", "BE", "BF", "BG", "BH", "BJ", "BM", "BR"];
  } else if (name.includes("engsel casement")) allowedColumns = ["BB"];
  else if (name.includes("rambuncis")) allowedColumns = ["BA"];
  else if (name.includes("flushbolt")) allowedColumns = ["BK"];
  else if (name.includes("bracket")) allowedColumns = ["BS"];
  else if (name.includes("handel mangkok")) allowedColumns = ["BM"];
  else if (name.includes("kunci ra")) allowedColumns = ["BO"];
  else if (name.includes("rell sliding") || name.includes("rel sliding")) allowedColumns = ["BL"];
  else if (name.includes("roda sliding")) allowedColumns = ["BP"];
  else if (name.includes("roda atas")) allowedColumns = ["BT"];
  else if (name.includes("roda bawah")) allowedColumns = ["BU"];
  else if (name.includes("doorcloser")) allowedColumns = ["BV"];
  else if (name.includes("kunci folding")) allowedColumns = ["BW"];
  else if (name.includes("engsel pintu")) allowedColumns = ["BY"];
  else if (name === "engsel") allowedColumns = ["BX"];
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

export function tatapanPriceOptions(detail: BudgetCatalogDetail | undefined) {
  if (!detail) return [];
  return detail.components
    .filter((component) => ["M", "N"].includes(component.sourceColumn))
    .sort((a, b) => a.position - b.position);
}

export function isTatapanMaterial(material: { name: string }) {
  return /tat(?:apan|pen|apn)\s+samping/i.test(material.name.normalize("NFKC").trim().replace(/\s+/g, " "));
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
  glassSourceColumn?: string | null,
  tatapanSourceColumn?: string | null,
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
  const selectedGlass = glassSourceColumn && /^[A-Z]$/.test(glassSourceColumn)
    ? detail.components.find((item) => item.sourceColumn === glassSourceColumn)
    : undefined;
  const selectedTatapan = tatapanSourceColumn && ["M", "N"].includes(tatapanSourceColumn)
    ? detail.components.find((item) => item.sourceColumn === tatapanSourceColumn)
    : undefined;
  const component = selectedDoorLeaf ?? selectedAccessory ?? selectedWindow ?? selectedGlass ?? selectedTatapan ?? (mapping?.componentId ? detail.components.find((item) => item.id === mapping.componentId) : undefined);
  const variant = detail.variants.find((item) => item.id === variantId);
  if (!component || !variant) return null;
  const price = component.prices[variant.key];
  if (!price || (price.amount === null && !price.expression)) return null;
  try {
    return {
      priceKey: `${detail.catalog.id}:${variant.id}:${materialCode}:${component.id}`,
      catalogId: detail.catalog.id,
      variantId: variant.id,
      unitPrice: resolveBudgetPrice(detail, component.id, variant.id),
      priceVersion: price.version,
      expressionSnapshot: price.expression,
      componentId: component.id,
      priceSourceLabel: `${detail.catalog.label} · ${component.label} · ${variant.label}`,
    };
  } catch {
    return null;
  }
}
