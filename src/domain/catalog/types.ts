// Formula variables are intentionally open-ended so new dimensions can be
// introduced in the formula master without changing the application.
export type InputVariableName = string;

export type InputVariables = Partial<Record<InputVariableName, number>>;

export type MaterialFormula = {
  code: number;
  sourceCode?: number;
  name: string;
  unit: string;
  expression: string | null;
  sourceCell: string;
  formulaVersion?: number;
  sourceFormula?: string | null;
  sourceCachedQuantity?: number | string | null;
  active?: boolean;
};

export type DoorModel = {
  code: number;
  groupCode: number;
  groupName?: string;
  name: string;
  inputs: readonly InputVariableName[];
  materials: readonly MaterialFormula[];
  status: "ready" | "incomplete";
  active?: boolean;
};

export function modelGroupLabel(groupCode: number, customName?: string): string {
  if (customName?.trim()) return customName;
  switch (groupCode) {
    case 10000: return "Pintu";
    case 20000: return "Jendela";
    case 30000: return "Pintu Jendela";
    case 40000: return "Pintu Sliding";
    default: return "Model Kusen";
  }
}

export type CalculationError = { materialCode: number; reason: string };
export type CalculatedMaterial = {
  code: number;
  name: string;
  unit: string;
  quantity: number;
};
