export type RecapInputMaterial = {
  materialCode: number;
  name: string;
  unit: string;
  quantity: number;
  priceKey?: string;
  unitPrice?: number | null;
  catalogId?: string | null;
  variantId?: string | null;
  priceVersion?: number | null;
  expressionSnapshot?: string | null;
  componentId?: string | null;
  priceSourceLabel?: string;
};

export type RecapLineInput = {
  materials: readonly RecapInputMaterial[];
  modelCount: number;
};

export type MaterialRecapRow = {
  materialCode: number;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number | null;
  subtotal: number | null;
  priceKey: string;
  catalogId: string | null;
  variantId: string | null;
  priceVersion: number | null;
  expressionSnapshot: string | null;
  componentId: string | null;
  priceSourceLabel: string;
};

export function aggregateMaterials(
  lines: readonly RecapLineInput[],
  prices: Readonly<Record<string, number | null | undefined>>,
): MaterialRecapRow[] {
  const totals = new Map<string, Omit<MaterialRecapRow, "unitPrice" | "subtotal"> & { configuredPrice: number | null | undefined }>();

  for (const line of lines) {
    for (const material of line.materials) {
      const priceKey = material.priceKey ?? `manual:${material.materialCode}`;
      const identity = `${material.materialCode}\u0000${material.unit}\u0000${priceKey}`;
      const row = totals.get(identity);
      const quantity = material.quantity * line.modelCount;
      if (row) row.quantity += quantity;
      else totals.set(identity, {
        materialCode: material.materialCode,
        name: material.name,
        unit: material.unit,
        quantity,
        priceKey,
        catalogId: material.catalogId ?? null,
        variantId: material.variantId ?? null,
        priceVersion: material.priceVersion ?? null,
        expressionSnapshot: material.expressionSnapshot ?? null,
        componentId: material.componentId ?? null,
        priceSourceLabel: material.priceSourceLabel ?? "Harga manual",
        // Older project snapshots can contain an explicit NULL from when a master-price
        // mapping was missing. Treat that as "no saved override" and fall back to the
        // currently resolved master price. A real numeric project override still wins.
        configuredPrice: typeof prices[priceKey] === "number" && Number.isFinite(prices[priceKey])
          ? prices[priceKey]
          : material.unitPrice,
      });
    }
  }

  return [...totals.values()]
    .sort((left, right) => left.materialCode - right.materialCode || left.unit.localeCompare(right.unit, "id"))
    .map((row) => {
      const configuredPrice = row.configuredPrice;
      const unitPrice = typeof configuredPrice === "number" && Number.isFinite(configuredPrice)
        ? configuredPrice
        : null;
      return {
        materialCode: row.materialCode, name: row.name, unit: row.unit, quantity: row.quantity, priceKey: row.priceKey,
        catalogId: row.catalogId, variantId: row.variantId, priceVersion: row.priceVersion,
        expressionSnapshot: row.expressionSnapshot, componentId: row.componentId, priceSourceLabel: row.priceSourceLabel,
        unitPrice,
        subtotal: unitPrice === null ? null : Math.round(row.quantity * unitPrice * 100) / 100,
      };
    });
}
