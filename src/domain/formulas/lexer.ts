export type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "paren"; value: "(" | ")" }
  | { type: "eof" };

export function tokenizeFormula(expression: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;

  while (position < expression.length) {
    const rest = expression.slice(position);
    if (/^\s+/.test(rest)) {
      position += rest.match(/^\s+/)![0].length;
      continue;
    }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/)?.[0];
    if (number) {
      const value = Number(number);
      if (!Number.isFinite(value)) throw new Error("Angka rumus tidak valid");
      tokens.push({ type: "number", value });
      position += number.length;
      continue;
    }
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier });
      position += identifier.length;
      continue;
    }
    const character = expression[position];
    if (character === "+" || character === "-" || character === "*" || character === "/") {
      tokens.push({ type: "operator", value: character });
      position += 1;
      continue;
    }
    if (character === "(" || character === ")") {
      tokens.push({ type: "paren", value: character });
      position += 1;
      continue;
    }
    throw new Error(`Karakter rumus tidak didukung: ${character}`);
  }

  tokens.push({ type: "eof" });
  return tokens;
}
