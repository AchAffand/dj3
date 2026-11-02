import type { ExpressionNode } from "./ast";
import { parseFormula } from "./parser";

export type FormulaVariables = Readonly<Record<string, number | undefined>>;
export type FormulaQuantities = Readonly<Record<number, number | undefined>>;

export function evaluateFormula(
  expression: ExpressionNode,
  variables: FormulaVariables,
  quantities: FormulaQuantities = {},
): number {
  function evaluate(node: ExpressionNode): number {
    if (node.type === "number") return node.value;
    if (node.type === "variable") {
      const value = variables[node.name];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Nilai input ${node.name} belum diisi`);
      }
      return value;
    }
    if (node.type === "quantity") {
      const value = quantities[node.materialCode];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Qty material ${node.materialCode} belum tersedia`);
      }
      return value;
    }
    if (node.type === "unary") {
      const value = evaluate(node.operand);
      return node.operator === "-" ? -value : value;
    }

    const left = evaluate(node.left);
    const right = evaluate(node.right);
    if (node.operator === "/" && right === 0) throw new Error("Pembagian dengan nol tidak diizinkan");
    const result = node.operator === "+" ? left + right
      : node.operator === "-" ? left - right
        : node.operator === "*" ? left * right : left / right;
    if (!Number.isFinite(result)) throw new Error("Hasil rumus bukan angka terbatas");
    return result;
  }

  return evaluate(expression);
}

export function calculateExpression(
  expression: string,
  variables: FormulaVariables,
  quantities: FormulaQuantities = {},
): number {
  return evaluateFormula(parseFormula(expression), variables, quantities);
}
