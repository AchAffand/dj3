export type BudgetCatalog = {
  id: string;
  slug: string;
  label: string;
  position: number;
  active: boolean;
};

export type BudgetVariant = { id: string; key: string; label: string; position: number };
export type BudgetComponent = {
  id: string;
  key: string;
  sourceColumn: string;
  label: string;
  unit: string;
  groupLabel?: string;
  category: string;
  position: number;
  prices: Record<string, { amount: number | null; expression: string | null; version: number }>;
};
export type BudgetRule = { linePosition: number; componentId: string; variantId: string; sourceFormula: string };
export type BudgetMaterialMapping = { materialKey: string; materialName: string; materialUnit: string; componentId: string | null; active: boolean };
export type BudgetLine = { position: number; description: string; unitCount: number; quantities: Record<string, number>; };
export type BudgetEstimate = {
  id?: string;
  catalogId: string;
  projectName: string;
  location: string;
  floor: string;
  reportDate: string;
  authorLabel: string;
  grandTotal: number;
  snapshot: Record<string, unknown>;
  lines: BudgetLine[];
};
export type BudgetCatalogDetail = { catalog: BudgetCatalog; components: BudgetComponent[]; variants: BudgetVariant[]; rules: BudgetRule[]; mappings: BudgetMaterialMapping[] };
export type BudgetComponentResult = { componentId: string; quantity: number; unitRate: number | null; amount: number | null; error?: string };
export type BudgetLineResult = { position: number; subtotal: number; components: BudgetComponentResult[]; errors: string[] };
export type BudgetCalculation = { lines: BudgetLineResult[]; grandTotal: number; errors: string[] };

export type MasterItemOption = {
  id: string;
  materialCode: number;
  modelCode: number | null;
  itemId: string;
  itemKey: string;
  itemLabel: string;
  unit: string;
  groupLabel: string | null;
  brandId: string | null;
  brandLabel: string | null;
  variantId: string | null;
  variantLabel: string | null;
  unitPrice: number | null;
  priceExpression: string | null;
  priceVersion: number | null;
  isDefault: boolean;
  position: number;
};
