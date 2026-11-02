import type { CalculatedMaterial, CalculationError, DoorModel, InputVariables } from "../catalog/types";
import { evaluateFormula } from "./evaluate";
import { parseFormula } from "./parser";

export function calculateModel(
  model: DoorModel,
  inputs: InputVariables,
  catalog: ReadonlyMap<number, DoorModel>,
): { items: CalculatedMaterial[]; errors: CalculationError[] } {
  const models = new Map(catalog);
  models.set(model.code, model);
  const materialsByCode = new Map(
    [...models.values()].flatMap((catalogModel) => catalogModel.materials.map((item) => [item.code, item] as const)),
  );
  const quantities = new Map<number, number>();
  const errorsByCode = new Map<number, string>();
  const state = new Map<number, "visiting" | "done" | "error">();

  function quantityReferences(expression: ReturnType<typeof parseFormula>): number[] {
    if (expression.type === "quantity") return [expression.materialCode];
    if (expression.type === "binary") {
      return [...quantityReferences(expression.left), ...quantityReferences(expression.right)];
    }
    if (expression.type === "unary") return quantityReferences(expression.operand);
    return [];
  }

  function calculateItem(materialCode: number): number {
    if (state.get(materialCode) === "done") return quantities.get(materialCode)!;
    if (state.get(materialCode) === "visiting") {
      throw new Error("Ketergantungan rumus melingkar");
    }
    const material = materialsByCode.get(materialCode);
    if (!material) throw new Error(`Material ${materialCode} tidak ditemukan pada model ini`);
    if (material.expression === null) {
      state.set(materialCode, "error");
      errorsByCode.set(materialCode, "Rumus belum tersedia");
      throw new Error("Rumus belum tersedia");
    }

    state.set(materialCode, "visiting");
    try {
      const ast = parseFormula(material.expression);
      const itemQuantities: Record<number, number> = {};
      for (const reference of quantityReferences(ast)) {
        itemQuantities[reference] = calculateItem(reference);
      }
      const quantity = evaluateFormula(ast, inputs, itemQuantities);
      quantities.set(materialCode, quantity);
      state.set(materialCode, "done");
      return quantity;
    } catch (error) {
      state.set(materialCode, "error");
      const reason = error instanceof Error ? error.message : "Rumus tidak dapat dihitung";
      errorsByCode.set(materialCode, reason);
      throw error;
    }
  }

  for (const material of model.materials) {
    try {
      calculateItem(material.code);
    } catch {
      // The error stays attached to the originating and dependent material rows.
    }
  }

  return {
    items: model.materials
      .filter((material) => state.get(material.code) === "done")
      .map((material) => ({
        code: material.code,
        name: material.name,
        unit: material.unit,
        quantity: quantities.get(material.code)!,
      })),
    errors: [...errorsByCode]
      .filter(([materialCode]) => model.materials.some((material) => material.code === materialCode))
      .map(([materialCode, reason]) => ({ materialCode, reason })),
  };
}
