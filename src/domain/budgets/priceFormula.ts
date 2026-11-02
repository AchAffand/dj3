import { calculateExpression } from "../formulas/evaluate";

export type BudgetPriceVariable = { key: string; value: number | null };

export function validateBudgetPriceFormula(expression: string, variables: readonly BudgetPriceVariable[]): { value: number | null; error: string | null } {
  try {
    const values = Object.fromEntries(variables.flatMap((item) => item.value === null ? [] : [[item.key, item.value]]));
    const value = calculateExpression(expression, values);
    if (value < 0) throw new Error("Harga hasil rumus tidak boleh negatif");
    return { value, error: null };
  } catch (error) { return { value: null, error: error instanceof Error ? error.message : "Rumus harga tidak valid" }; }
}
