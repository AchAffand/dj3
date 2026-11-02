import type { DoorModel } from "../../domain/catalog/types";
import type { FormulaChange } from "../../domain/projects/types";
import { validateFormulaChange } from "../../domain/formulas/validateFormulaChange";

type FormulaRepository = { saveFormulaChange(change: FormulaChange): Promise<void> };

export async function saveValidatedFormulaChange(
  repository: FormulaRepository,
  catalog: ReadonlyMap<number, DoorModel>,
  change: FormulaChange,
): Promise<void> {
  const validation = validateFormulaChange(catalog, change);
  if (!validation.valid) throw new Error(validation.error);
  await repository.saveFormulaChange({ ...change, expression: change.expression.trim() });
}
