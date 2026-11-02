import type { ExpressionNode } from "./ast";
import { tokenizeFormula, type Token } from "./lexer";

export function parseFormula(expression: string): ExpressionNode {
  const tokens = tokenizeFormula(expression);
  let position = 0;
  const current = () => tokens[position];
  const consume = () => tokens[position++];

  function primary(): ExpressionNode {
    const token = consume();
    if (token.type === "number") return { type: "number", value: token.value };
    if (token.type === "identifier") {
      const materialCode = token.value.match(/^qty_(\d+)$/i)?.[1];
      return materialCode
        ? { type: "quantity", materialCode: Number(materialCode) }
        : { type: "variable", name: token.value };
    }
    if (token.type === "paren" && token.value === "(") {
      const node = additive();
      const closing = current();
      if (closing.type !== "paren" || closing.value !== ")") {
        throw new Error("Tanda kurung rumus belum ditutup");
      }
      consume();
      return node;
    }
    throw new Error("Bagian rumus tidak lengkap");
  }

  function unary(): ExpressionNode {
    const token = current();
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      consume();
      return { type: "unary", operator: token.value, operand: unary() };
    }
    return primary();
  }

  function multiplicative(): ExpressionNode {
    let node = unary();
    while (true) {
      const next = current();
      if (next.type !== "operator" || (next.value !== "*" && next.value !== "/")) break;
      const operator = (consume() as Extract<Token, { type: "operator" }>).value;
      node = { type: "binary", operator, left: node, right: unary() };
    }
    return node;
  }

  function additive(): ExpressionNode {
    let node = multiplicative();
    while (true) {
      const next = current();
      if (next.type !== "operator" || (next.value !== "+" && next.value !== "-")) break;
      const operator = (consume() as Extract<Token, { type: "operator" }>).value;
      node = { type: "binary", operator, left: node, right: multiplicative() };
    }
    return node;
  }

  if (current().type === "eof") throw new Error("Rumus tidak boleh kosong");
  const node = additive();
  if (current().type !== "eof") throw new Error("Ada bagian rumus yang tidak dapat dibaca");
  return node;
}
