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
      operator: UnaryOperator;
      operand: ControlExpressionNode;
    }
  | {
      type: "Binary";
      operator: BinaryOperator;
      left: ControlExpressionNode;
      right: ControlExpressionNode;
    }
  | {
      type: "Function";
      name: string;
      args: ControlExpressionNode[];
    };

type UnaryOperator = "+" | "-" | "!";

type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | ">"
  | "<"
  | "=="
  | "!="
  | "&&"
  | "||";

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
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): ControlExpressionNode | null {
    let left = this.parseLogicalAnd();
    if (!left) {
      return null;
    }
    while (true) {
      this.skipWhitespace();
      const operator = this.matchAny(["||"]);
      if (!operator) {
        break;
      }
      const right = this.parseLogicalAnd();
      if (!right) {
        this.errors.push({
          index: this.index,
          message: "Expected expression after operator.",
        });
        return null;
      }
      left = {
        type: "Binary",
        operator: operator as BinaryOperator,
        left,
        right,
      };
    }
    return left;
  }

  private parseLogicalAnd(): ControlExpressionNode | null {
    let left = this.parseComparison();
    if (!left) {
      return null;
    }
    while (true) {
      this.skipWhitespace();
      const operator = this.matchAny(["&&"]);
      if (!operator) {
        break;
      }
      const right = this.parseComparison();
      if (!right) {
        this.errors.push({
          index: this.index,
          message: "Expected expression after operator.",
        });
        return null;
      }
      left = {
        type: "Binary",
        operator: operator as BinaryOperator,
        left,
        right,
      };
    }
    return left;
  }

  private parseComparison(): ControlExpressionNode | null {
    let left = this.parseAdditive();
    if (!left) {
      return null;
    }
    while (true) {
      this.skipWhitespace();
      if (
        this.input.startsWith(">=", this.index) ||
        this.input.startsWith("<=", this.index)
      ) {
        const op = this.input.slice(this.index, this.index + 2);
        this.index += 2;
        this.errors.push({
          index: this.index - 2,
          message: `Operator "${op}" is not supported.`,
        });
        return null;
      }
      const operator = this.matchAny(["==", "!=", ">", "<"]);
      if (!operator) {
        break;
      }
      const right = this.parseAdditive();
      if (!right) {
        this.errors.push({
          index: this.index,
          message: "Expected expression after operator.",
        });
        return null;
      }
      left = {
        type: "Binary",
        operator: operator as BinaryOperator,
        left,
        right,
      };
    }
    return left;
  }

  private parseAdditive(): ControlExpressionNode | null {
    let left = this.parseMultiplicative();
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
      const right = this.parseMultiplicative();
      if (!right) {
        this.errors.push({
          index: this.index,
          message: "Expected expression after operator.",
        });
        return null;
      }
      left = {
        type: "Binary",
        operator: operator as BinaryOperator,
        left,
        right,
      };
    }
    return left;
  }

  private parseMultiplicative(): ControlExpressionNode | null {
    let left = this.parseUnary();
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
      const right = this.parseUnary();
      if (!right) {
        this.errors.push({
          index: this.index,
          message: "Expected expression after operator.",
        });
        return null;
      }
      left = {
        type: "Binary",
        operator: operator as BinaryOperator,
        left,
        right,
      };
    }
    return left;
  }

  private parseUnary(): ControlExpressionNode | null {
    this.skipWhitespace();
    const char = this.peek();
    if (!char) {
      this.errors.push({
        index: this.index,
        message: "Unexpected end of expression.",
      });
      return null;
    }
    if (char === "+" || char === "-" || char === "!") {
      this.index += 1;
      const operand = this.parseUnary();
      if (!operand) {
        this.errors.push({
          index: this.index,
          message: `Expected operand after unary "${char}".`,
        });
        return null;
      }
      return {
        type: "Unary",
        operator: char as UnaryOperator,
        operand,
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ControlExpressionNode | null {
    this.skipWhitespace();
    const char = this.peek();
    if (!char) {
      this.errors.push({
        index: this.index,
        message: "Unexpected end of expression.",
      });
      return null;
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
      return this.parseIdentifierOrFunction();
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

  private parseIdentifierOrFunction(): ControlExpressionNode | null {
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
    this.skipWhitespace();
    if (this.peek() === "(") {
      this.index += 1;
      const args: ControlExpressionNode[] = [];
      this.skipWhitespace();
      if (this.peek() === ")") {
        this.index += 1;
        return {
          type: "Function",
          name,
          args,
        };
      }
      while (true) {
        const argument = this.parseExpression();
        if (!argument) {
          this.errors.push({
            index: this.index,
            message: `Expected expression for argument ${args.length + 1} of "${name}".`,
          });
          return null;
        }
        args.push(argument);
        this.skipWhitespace();
        const next = this.peek();
        if (next === ",") {
          this.index += 1;
          this.skipWhitespace();
          if (this.peek() === ")") {
            this.errors.push({
              index: this.index,
              message: `Expected expression after "," in call to "${name}".`,
            });
            return null;
          }
          continue;
        }
        if (next === ")") {
          this.index += 1;
          break;
        }
        if (next === null) {
          this.errors.push({
            index: this.index,
            message: `Unterminated call to "${name}".`,
          });
        } else {
          this.errors.push({
            index: this.index,
            message: `Expected "," or ")" in call to "${name}".`,
          });
        }
        return null;
      }
      return {
        type: "Function",
        name,
        args,
      };
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

  private matchAny(operators: readonly string[]): string | null {
    for (const operator of operators) {
      if (this.input.startsWith(operator, this.index)) {
        this.index += operator.length;
        return operator;
      }
    }
    return null;
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
    case "Function":
      node.args.forEach((arg) => collectExpressionReferences(arg, target));
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
    case "Function":
      node.args.forEach((arg) => mapExpression(arg, visit));
      break;
    default:
      break;
  }
}
