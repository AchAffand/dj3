import { describe, expect, it } from "vitest";
import { evaluateFormula } from "./evaluate";
import { parseFormula } from "./parser";

describe("formula parser and evaluator", () => {
  it("honors multiplication precedence and parentheses", () => {
    const formula = parseFormula("(T1 + L1) * 2 / 1000");
    expect(evaluateFormula(formula, { T1: 2000, L1: 1754 })).toBe(7.508);
  });

  it("resolves a same-model quantity reference by stable item code", () => {
    expect(evaluateFormula(parseFormula("qty_10101 * 2"), {}, { 10101: 5.754 })).toBe(11.508);
  });

  it.each(["unknown + 1", "T1 / 0", "sum(T1)", "T1 ** 2", "T1 +"]) (
    "rejects unsafe or invalid formula %s",
    (expression) => {
      expect(() => evaluateFormula(parseFormula(expression), { T1: 10 })).toThrow();
    },
  );
});
