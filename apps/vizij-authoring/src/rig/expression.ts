export type ControlExpressionNode =
  | {
      type: "Literal";
      value: number;
    }
  | {
      type: "Reference";
      name: string;
    }
  | {
      type: "Unary";
      operator: "+" | "-";
      operand: ControlExpressionNode;
    }
  | {
      type: "Binary";
      operator: "+" | "-" | "*" | "/";
      left: ControlExpressionNode;
      right: ControlExpressionNode;
    };

export interface ExpressionParseError {
  index: number;
  message: string;
}

export interface ExpressionParseResult {
  node: ControlExpressionNode | null;
  errors: ExpressionParseError[];
}

const WHITESPACE = /\s/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

class ControlExpressionParser {
  private index = 0;
  private readonly errors: ExpressionParseError[] = [];

  constructor(private readonly input: string) {}

  parse(): ExpressionParseResult {
    this.skipWhitespace();
    const node = this.parseExpression();
    this.skipWhitespace();
    if (!node) {
      if (this.errors.length === 0) {
        this.errors.push({
          index: this.index,
          message: "Empty expression.",
        });
      }
      return { node: null, errors: this.errors };
    }
    if (!this.isAtEnd()) {
      this.errors.push({
        index: this.index,
        message: `Unexpected token "${this.peek()}"`,
      });
      return { node: null, errors: this.errors };
    }
    return { node, errors: this.errors };
  }

  private parseExpression(): ControlExpressionNode | null {
    let left = this.parseTerm();
    if (!left) {
      return null;
    }
    while (true) {
      this.skipWhitespace();
      const operator = this.peek();
      if (operator !== "+" && operator !== "-") {
        break;
      }
      this.index += 1;
      const right = this.parseTerm();
      if (!right) {
        this.errors.push({
          index: this.index,
          message: "Expected expression after operator.",
        });
        return null;
      }
      left = {
        type: "Binary",
        operator,
        left,
        right,
      };
    }
    return left;
  }

  private parseTerm(): ControlExpressionNode | null {
    let left = this.parseFactor();
    if (!left) {
      return null;
    }
    while (true) {
      this.skipWhitespace();
      const operator = this.peek();
      if (operator !== "*" && operator !== "/") {
        break;
      }
      this.index += 1;
      const right = this.parseFactor();
      if (!right) {
        this.errors.push({
          index: this.index,
          message: "Expected expression after operator.",
        });
        return null;
      }
      left = {
        type: "Binary",
        operator,
        left,
        right,
      };
    }
    return left;
  }

  private parseFactor(): ControlExpressionNode | null {
    this.skipWhitespace();
    const char = this.peek();
    if (!char) {
      this.errors.push({
        index: this.index,
        message: "Unexpected end of expression.",
      });
      return null;
    }
    if (char === "+" || char === "-") {
      this.index += 1;
      const operand = this.parseFactor();
      if (!operand) {
        this.errors.push({
          index: this.index,
          message: `Expected operand after unary "${char}".`,
        });
        return null;
      }
      return {
        type: "Unary",
        operator: char,
        operand,
      };
    }
    if (char === "(") {
      this.index += 1;
      const expression = this.parseExpression();
      this.skipWhitespace();
      if (this.peek() === ")") {
        this.index += 1;
        return expression;
      }
      this.errors.push({
        index: this.index,
        message: "Unmatched parenthesis.",
      });
      return null;
    }
    if (IDENT_START.test(char)) {
      return this.parseIdentifier();
    }
    if (DIGIT.test(char) || char === ".") {
      return this.parseNumber();
    }
    this.errors.push({
      index: this.index,
      message: `Unexpected character "${char}".`,
    });
    return null;
  }

  private parseIdentifier(): ControlExpressionNode | null {
    const start = this.index;
    while (!this.isAtEnd() && IDENT_PART.test(this.peek()!)) {
      this.index += 1;
    }
    const name = this.input.slice(start, this.index);
    if (!name) {
      this.errors.push({
        index: start,
        message: "Invalid identifier.",
      });
      return null;
    }
    return {
      type: "Reference",
      name,
    };
  }

  private parseNumber(): ControlExpressionNode | null {
    const start = this.index;
    let hasDigits = false;
    while (!this.isAtEnd()) {
      const char = this.peek()!;
      if (DIGIT.test(char)) {
        hasDigits = true;
        this.index += 1;
        continue;
      }
      if (char === ".") {
        this.index += 1;
        continue;
      }
      break;
    }
    const raw = this.input.slice(start, this.index);
    const value = Number(raw);
    if (!hasDigits || Number.isNaN(value)) {
      this.errors.push({
        index: start,
        message: `Invalid numeric literal "${raw}".`,
      });
      return null;
    }
    return {
      type: "Literal",
      value,
    };
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd() && WHITESPACE.test(this.peek()!)) {
      this.index += 1;
    }
  }

  private peek(): string | null {
    if (this.index >= this.input.length) {
      return null;
    }
    return this.input[this.index] ?? null;
  }

  private isAtEnd(): boolean {
    return this.index >= this.input.length;
  }
}

export function parseControlExpression(
  expression: string,
): ExpressionParseResult {
  const parser = new ControlExpressionParser(expression);
  return parser.parse();
}

export function collectExpressionReferences(
  node: ControlExpressionNode | null,
  target: Set<string> = new Set(),
): Set<string> {
  if (!node) {
    return target;
  }
  switch (node.type) {
    case "Reference":
      target.add(node.name);
      break;
    case "Unary":
      collectExpressionReferences(node.operand, target);
      break;
    case "Binary":
      collectExpressionReferences(node.left, target);
      collectExpressionReferences(node.right, target);
      break;
    default:
      break;
  }
  return target;
}

export function mapExpression(
  node: ControlExpressionNode,
  visit: (node: ControlExpressionNode) => void,
): void {
  visit(node);
  switch (node.type) {
    case "Unary":
      mapExpression(node.operand, visit);
      break;
    case "Binary":
      mapExpression(node.left, visit);
      mapExpression(node.right, visit);
      break;
    default:
      break;
  }
}
