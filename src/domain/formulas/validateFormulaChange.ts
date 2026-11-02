import type { DoorModel } from "../catalog/types";
import { parseFormula } from "./parser";
import type { ExpressionNode } from "./ast";
import type { FormulaChange } from "../projects/types";

function quantityReferences(node: ExpressionNode): number[] {
  if (node.type === "quantity") return [node.materialCode];
  if (node.type === "binary") return [...quantityReferences(node.left), ...quantityReferences(node.right)];
  if (node.type === "unary") return quantityReferences(node.operand);
  return [];
}

function constantValue(node: ExpressionNode): number | undefined {
  if (node.type === "number") return node.value;
  if (node.type === "unary") {
    const operand = constantValue(node.operand);
    return operand === undefined ? undefined : node.operator === "-" ? -operand : operand;
  }
  if (node.type !== "binary") return undefined;
  const left = constantValue(node.left);
  const right = constantValue(node.right);
  if (left === undefined || right === undefined) return undefined;
  if (node.operator === "+") return left + right;
  if (node.operator === "-") return left - right;
  if (node.operator === "*") return left * right;
  return right === 0 ? undefined : left / right;
}

function assertNoConstantDivisionByZero(node: ExpressionNode): void {
  if (node.type === "binary") {
    if (node.operator === "/" && constantValue(node.right) === 0) {
      throw new Error("Pembagian dengan nol tidak diizinkan");
    }
    assertNoConstantDivisionByZero(node.left);
    assertNoConstantDivisionByZero(node.right);
  } else if (node.type === "unary") {
    assertNoConstantDivisionByZero(node.operand);
  }
}

export type FormulaValidation = { valid: true } | { valid: false; error: string };

export function validateFormulaChange(
  catalog: ReadonlyMap<number, DoorModel>,
  change: FormulaChange,
): FormulaValidation {
  const materials = new Map(
    [...catalog.values()].flatMap((model) => model.materials.map((material) => [material.code, material] as const)),
  );
  if (!materials.has(change.materialCode)) return { valid: false, error: "Material tidak ditemukan di katalog" };
  if (!change.expression.trim() || change.expression.length > 500) {
    return { valid: false, error: "Rumus harus berisi 1 sampai 500 karakter" };
  }

  try {
    const candidate = parseFormula(change.expression);
    assertNoConstantDivisionByZero(candidate);
    const state = new Map<number, "visiting" | "done">();
    function visit(materialCode: number): void {
      if (state.get(materialCode) === "visiting") throw new Error("Ketergantungan rumus melingkar");
      if (state.get(materialCode) === "done") return;
      const material = materials.get(materialCode);
      if (!material) throw new Error(`Material ${materialCode} tidak ditemukan`);
      const expression = materialCode === change.materialCode ? change.expression : material.expression;
      if (expression === null) throw new Error(`Rumus material ${materialCode} belum tersedia`);
      state.set(materialCode, "visiting");
      const ast = materialCode === change.materialCode ? candidate : parseFormula(expression);
      assertNoConstantDivisionByZero(ast);
      for (const reference of quantityReferences(ast)) visit(reference);
      state.set(materialCode, "done");
    }

    visit(change.materialCode);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Rumus tidak valid" };
  }
}
