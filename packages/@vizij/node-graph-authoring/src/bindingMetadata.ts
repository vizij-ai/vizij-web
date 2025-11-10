import type {
  RigBindingMetadata,
  RigBindingOperandMetadata,
} from "@vizij/utils";
import type { ControlExpressionNode } from "./expression";
import type {
  ExpressionVariableEntry,
  ExpressionVariableTable,
  SlotVariableMetadata,
} from "./expressionVariables";

type OperandMetadata = RigBindingOperandMetadata;

function cloneOperand(entry: OperandMetadata): OperandMetadata {
  return JSON.parse(JSON.stringify(entry)) as OperandMetadata;
}

function describeSlot(entry: ExpressionVariableEntry): OperandMetadata {
  const metadata = entry.metadata as SlotVariableMetadata | undefined;
  return {
    kind: "slot",
    ref: entry.name,
    alias: metadata?.slotAlias ?? entry.name,
    slotId: metadata?.slotId,
    inputId: metadata?.inputId ?? null,
    valueType: metadata?.valueType,
  } satisfies OperandMetadata;
}

function describeReserved(entry: ExpressionVariableEntry): OperandMetadata {
  return {
    kind: "reserved",
    ref: entry.name,
    description: entry.description,
  } satisfies OperandMetadata;
}

function describeReference(
  node: Extract<ControlExpressionNode, { type: "Reference" }>,
  variables: ExpressionVariableTable,
): OperandMetadata {
  const entry = variables.resolve(node.name);
  if (!entry) {
    return {
      kind: "unknown",
      ref: node.name,
    } satisfies OperandMetadata;
  }
  if (entry.kind === "slot") {
    return describeSlot(entry);
  }
  if (entry.kind === "reserved") {
    return describeReserved(entry);
  }
  return {
    kind: "unknown",
    ref: entry.name,
  } satisfies OperandMetadata;
}

function stringifyExpression(node: ControlExpressionNode): string {
  switch (node.type) {
    case "Literal":
      return Number.isFinite(node.value) ? `${node.value}` : "0";
    case "VectorLiteral":
      return `vec(${node.values.join(", ")})`;
    case "Reference":
      return node.name;
    case "Unary":
      return `${node.operator}${stringifyExpression(node.operand)}`;
    case "Binary":
      return `${stringifyExpression(node.left)} ${node.operator} ${stringifyExpression(node.right)}`;
    case "Function":
      return `${node.name}(${node.args.map(stringifyExpression).join(", ")})`;
    default:
      return "";
  }
}

function describeOperand(
  node: ControlExpressionNode,
  variables: ExpressionVariableTable,
): OperandMetadata {
  switch (node.type) {
    case "Literal":
      return {
        kind: "literal",
        literalValue: node.value,
      } satisfies OperandMetadata;
    case "Reference":
      return describeReference(node, variables);
    case "Unary":
    case "Binary":
    case "Function":
    case "VectorLiteral":
      return {
        kind: "expression",
        expression: stringifyExpression(node),
      } satisfies OperandMetadata;
    default:
      return { kind: "unknown" } satisfies OperandMetadata;
  }
}

function describeCaseExpression(
  node: ControlExpressionNode,
  variables: ExpressionVariableTable,
) {
  if (node.type !== "Function") {
    return null;
  }
  if (node.name.toLowerCase() !== "case") {
    return null;
  }
  if ((node.args?.length ?? 0) < 3) {
    return null;
  }
  const [selector, defaultBranch, ...branches] = node.args;
  return {
    kind: "case" as const,
    selector: describeOperand(selector, variables),
    defaultBranch: describeOperand(defaultBranch, variables),
    branches: branches.map((branch) => describeOperand(branch, variables)),
  };
}

export function buildBindingMetadataFromExpression(
  node: ControlExpressionNode | null,
  variables: ExpressionVariableTable,
): RigBindingMetadata | undefined {
  if (!node) {
    return undefined;
  }
  const caseMetadata = describeCaseExpression(node, variables);
  if (!caseMetadata) {
    return undefined;
  }
  return {
    expression: {
      case: {
        kind: "case",
        selector: caseMetadata.selector
          ? cloneOperand(caseMetadata.selector)
          : undefined,
        defaultBranch: caseMetadata.defaultBranch
          ? cloneOperand(caseMetadata.defaultBranch)
          : undefined,
        branches: caseMetadata.branches.map(cloneOperand),
      },
    },
  } satisfies RigBindingMetadata;
}
