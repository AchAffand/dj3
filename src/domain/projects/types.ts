import type { InputVariables } from "../catalog/types";

export type ProjectMaterialResult = {
  materialCode: number;
  name: string;
  unit: string;
  quantity: number;
};

export type ProjectFormulaSnapshot = {
  materialCode: number;
  expression: string | null;
  version: number;
};

export type ProjectResultSnapshot = {
  items: ProjectMaterialResult[];
  errors: { materialCode: number; reason: string }[];
};

export type ProjectModelLineInput = {
  id?: string;
  modelCode: number;
  inputs: InputVariables;
  count: number;
  formulaSnapshot: ProjectFormulaSnapshot[];
  resultSnapshot: ProjectResultSnapshot;
  priceCatalogId?: string | null;
  priceVariantId?: string | null;
};

export type ProjectPriceInput = {
  materialCode: number;
  name: string;
  unit: string;
  unitPrice: number | null;
  catalogId?: string | null;
  variantId?: string | null;
  priceVersion?: number | null;
  expressionSnapshot?: string | null;
  componentId?: string | null;
};

export type ProjectInput = {
  id?: string;
  name: string;
  location?: string;
  floor?: string;
  lines: ProjectModelLineInput[];
  prices: ProjectPriceInput[];
};

export type Project = ProjectInput & { id: string; createdAt?: string; updatedAt?: string };
export type ProjectSummary = { id: string; name: string; updatedAt: string; modelCount: number };

export type FormulaChange = { materialCode: number; expression: string };
export type FormulaVersionRecord = {
  id: string;
  materialCode: number;
  version: number;
  expression: string | null;
  createdBy: string | null;
  createdAt: string;
};
