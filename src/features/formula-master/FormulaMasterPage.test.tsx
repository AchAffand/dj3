import { describe, expect, it, vi } from "vitest";
import { doorCatalog } from "../../domain/catalog/doorCatalog";
import { saveValidatedFormulaChange } from "./formulaService";

describe("formula master validation", () => {
  it("does not persist an invalid formula", async () => {
    const repository = { saveFormulaChange: vi.fn(async () => undefined) };
    await expect(saveValidatedFormulaChange(repository, doorCatalog, {
      materialCode: 10101,
      expression: "runSomething(T1)",
    })).rejects.toThrow();
    expect(repository.saveFormulaChange).not.toHaveBeenCalled();
  });

  it("rejects a formula change that creates a dependency cycle", async () => {
    const repository = { saveFormulaChange: vi.fn(async () => undefined) };
    await expect(saveValidatedFormulaChange(repository, doorCatalog, {
      materialCode: 10101,
      expression: "qty_10102",
    })).rejects.toThrow(/melingkar/i);
    expect(repository.saveFormulaChange).not.toHaveBeenCalled();
  });

  it("does not persist division by zero", async () => {
    const repository = { saveFormulaChange: vi.fn(async () => undefined) };
    await expect(saveValidatedFormulaChange(repository, doorCatalog, {
      materialCode: 10101,
      expression: "T1 / (2 - 2)",
    })).rejects.toThrow(/nol/i);
    expect(repository.saveFormulaChange).not.toHaveBeenCalled();
  });
});
