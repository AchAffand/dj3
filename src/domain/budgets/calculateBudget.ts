import { calculateExpression } from "../formulas/evaluate";
import type { BudgetCalculation, BudgetCatalogDetail, BudgetEstimate, BudgetLineResult } from "./types";

export function resolveBudgetPrice(detail: BudgetCatalogDetail, componentId: string, variantId: string, stack = new Set<string>()): number {
  const component = detail.components.find((item) => item.id === componentId);
  const variant = detail.variants.find((item) => item.id === variantId);
  if (!component || !variant) throw new Error("Aturan harga tidak lengkap");
  const entry = component.prices[variant.key];
  if (!entry) throw new Error("Harga belum tersedia");
  if (entry.amount !== null) return entry.amount;
  if (!entry.expression) throw new Error("Harga belum diisi");
  const key = `${component.id}:${variant.id}`;
  if (stack.has(key)) throw new Error("Rumus harga mengandung referensi berulang");
  const nextStack = new Set(stack).add(key);
  return calculateExpression(entry.expression, new Proxy({}, {
    get: (_target, name) => {
      if (typeof name !== "string") return undefined;
      const match = name.match(/^price_(col_[a-z]+)_([a-z_]+)$/);
      if (!match) return undefined;
      const refComponent = detail.components.find((item) => item.key === match[1]);
      if (!refComponent) return undefined;

      // Legacy/master-price formulas use the semantic key "base" for the
      // default finish. In catalogs without an explicit "base" variant,
      // Brown is that base price. Prefer a real "base" variant when present.
      const refVariant = detail.variants.find((item) => item.key === match[2])
        ?? (match[2] === "base" ? detail.variants.find((item) => item.key === "brown") : undefined);
      if (!refVariant) return undefined;
      return resolveBudgetPrice(detail, refComponent.id, refVariant.id, nextStack);
    },
  }) as Record<string, number | undefined>);
}

export function calculateBudget(detail: BudgetCatalogDetail, estimate: Pick<BudgetEstimate, "lines">): BudgetCalculation {
  const lines: BudgetLineResult[] = [];
  const errors: string[] = [];
  const variantById = new Map(detail.variants.map((item) => [item.id, item]));
  for (const line of estimate.lines) {
    const components = detail.components.map((component) => {
      const quantity = Number(line.quantities[component.id] ?? 0);
      const rule = detail.rules.find((item) => item.linePosition === line.position && item.componentId === component.id);
      if (!rule) return { componentId: component.id, quantity, unitRate: null, amount: 0 };
      try {
        const variant = variantById.get(rule.variantId);
        if (!variant) throw new Error("Varian harga pada aturan tidak ditemukan");
        const unitRate = resolveBudgetPrice(detail, component.id, variant.id, new Set());
        return { componentId: component.id, quantity, unitRate, amount: quantity * unitRate };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Harga tidak dapat dihitung";
        return { componentId: component.id, quantity, unitRate: null, amount: null, error: reason };
      }
    });
    const lineErrors = components.flatMap((item) => item.error ? [`Baris ${line.position}, ${detail.components.find((c) => c.id === item.componentId)?.label}: ${item.error}`] : []);
    const subtotal = components.reduce((sum, item) => sum + (item.amount ?? 0), 0) * Number(line.unitCount || 0);
    lines.push({ position: line.position, subtotal, components, errors: lineErrors });
    errors.push(...lineErrors);
  }
  return { lines, grandTotal: lines.reduce((sum, line) => sum + line.subtotal, 0), errors };
}
