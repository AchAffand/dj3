export type ExpressionNode =
  | { type: "number"; value: number }
  | { type: "variable"; name: string }
  | { type: "quantity"; materialCode: number }
  | { type: "unary"; operator: "+" | "-"; operand: ExpressionNode }
  | {
      type: "binary";
      operator: "+" | "-" | "*" | "/";
      left: ExpressionNode;
      right: ExpressionNode;
    };
