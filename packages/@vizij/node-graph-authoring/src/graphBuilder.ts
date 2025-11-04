import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import type { AnimatableComponent } from "@vizij/utils";
import { buildAnimatableValue } from "@vizij/utils";
import { SELF_BINDING_ID } from "@vizij/utils";
import type { BindingMap } from "./state";
import {
  createDefaultRemap,
  ensureBindingStructure,
  bindingTargetFromComponent,
  bindingTargetFromInput,
  type AnimatableBinding,
  type BindingValueType,
  type BindingTarget,
  type InputBindingMap,
  type BindingOperator,
  PRIMARY_SLOT_ALIAS,
  PRIMARY_SLOT_ID,
} from "./state";
import type { RemapSettings } from "@vizij/utils";
import {
  collectExpressionReferences,
  parseControlExpression,
  type ControlExpressionNode,
} from "./expression";
import {
  SCALAR_FUNCTIONS,
  type ScalarFunctionDefinition,
} from "./expressionFunctions";
import {
  getBindingOperatorDefinition,
  type BindingOperatorDefinition,
} from "./operators";

type VectorComponent = "x" | "y" | "z" | "r" | "g" | "b";
type GraphEdge = NonNullable<GraphSpec["edges"]>[number];

interface BindingGraphContext {
  nodes: NodeSpec[];
  edges: NonNullable<GraphSpec["edges"]>;
  ensureInputNode: (
    inputId: string,
  ) => { nodeId: string; input: StandardRigInput } | null;
  bindingIssues: Map<string, Set<string>>;
  summaryBindings: GraphBindingSummary[];
}

interface EvaluateBindingArgs {
  binding: AnimatableBinding;
  target: BindingTarget;
  targetId: string;
  animatableId: string;
  component?: VectorComponent;
  safeId: string;
  context: BindingGraphContext;
  selfNodeId?: string;
}

function evaluateBinding({
  binding,
  target,
  targetId,
  animatableId,
  component,
  safeId,
  context,
  selfNodeId,
}: EvaluateBindingArgs): {
  valueNodeId: string | null;
  hasActiveSlot: boolean;
} {
  const { nodes, edges, ensureInputNode, bindingIssues, summaryBindings } =
    context;
  const exprContext: ExpressionBuildContext = {
    componentSafeId: safeId,
    nodes,
    edges,
    constants: new Map(),
    counter: 0,
  };
  const targetValueType: BindingValueType =
    target.valueType === "vector" ? "vector" : "scalar";
  const aliasNodes = new Map<string, string>();
  const slotSummaries: GraphBindingSummary[] = [];
  const expressionIssues: string[] = [];
  const rawExpression =
    typeof binding.expression === "string" ? binding.expression : "";
  const trimmedExpression = rawExpression.trim();
  let hasActiveSlot = false;

  binding.slots.forEach((slot, index) => {
    const aliasBase = slot.alias?.trim() ?? "";
    const fallbackAlias = `s${index + 1}`;
    const alias = aliasBase.length > 0 ? aliasBase : fallbackAlias;
    const slotId = slot.id && slot.id.length > 0 ? slot.id : alias;
    const slotValueType: BindingValueType =
      slot.valueType === "vector" ? "vector" : "scalar";
    let slotOutputId: string;
    if (slot.inputId === SELF_BINDING_ID) {
      if (selfNodeId) {
        slotOutputId = selfNodeId;
        hasActiveSlot = true;
      } else {
        expressionIssues.push("Self reference unavailable for this input.");
        slotOutputId = getConstantNodeId(exprContext, target.defaultValue);
      }
    } else if (slot.inputId) {
      const inputNode = ensureInputNode(slot.inputId);
      if (inputNode) {
        const remapNodeId = `remap_${safeId}_${sanitizeNodeId(slotId)}`;
        nodes.push({
          id: remapNodeId,
          type: "centered_remap",
          input_defaults: {
            in_low: slot.remap.inLow,
            in_anchor: slot.remap.inAnchor,
            in_high: slot.remap.inHigh,
            out_low: slot.remap.outLow,
            out_anchor: slot.remap.outAnchor,
            out_high: slot.remap.outHigh,
          },
        });
        edges.push({
          from: { node_id: inputNode.nodeId },
          to: { node_id: remapNodeId, input: "in" },
        });
        slotOutputId = remapNodeId;
        hasActiveSlot = true;
      } else {
        expressionIssues.push(`Missing standard input "${slot.inputId}".`);
        slotOutputId = getConstantNodeId(exprContext, 0);
      }
    } else {
      slotOutputId = getConstantNodeId(exprContext, 0);
    }
    aliasNodes.set(alias, slotOutputId);
    slotSummaries.push({
      targetId,
      animatableId,
      component,
      slotId,
      slotAlias: alias,
      inputId: slot.inputId ?? null,
      remap: { ...slot.remap },
      expression: trimmedExpression,
      valueType: slotValueType,
    });
  });

  if (slotSummaries.length === 0) {
    const alias = PRIMARY_SLOT_ALIAS;
    aliasNodes.set(alias, getConstantNodeId(exprContext, 0));
    slotSummaries.push({
      targetId,
      animatableId,
      component,
      slotId: PRIMARY_SLOT_ID,
      slotAlias: alias,
      inputId: null,
      remap: createDefaultRemap(target),
      expression: trimmedExpression,
      valueType: targetValueType,
    });
  }

  const defaultAlias = slotSummaries[0]?.slotAlias ?? PRIMARY_SLOT_ALIAS;
  const expressionText =
    trimmedExpression.length > 0 ? trimmedExpression : defaultAlias;

  const parseResult = parseControlExpression(expressionText);
  let expressionAst: ControlExpressionNode | null = null;

  if (parseResult.node && parseResult.errors.length === 0) {
    const references = collectExpressionReferences(parseResult.node);
    const missing: string[] = [];
    references.forEach((ref) => {
      if (!aliasNodes.has(ref)) {
        missing.push(ref);
      }
    });
    if (missing.length === 0) {
      expressionAst = parseResult.node;
    } else {
      missing.forEach((ref) => {
        expressionIssues.push(`Unknown control "${ref}".`);
      });
    }
  } else {
    parseResult.errors.forEach((error) => {
      expressionIssues.push(error.message);
    });
  }

  let valueNodeId: string | null = null;

  if (expressionAst) {
    valueNodeId = materializeExpression(
      expressionAst,
      exprContext,
      aliasNodes,
      expressionIssues,
    );
  }

  if (!valueNodeId) {
    const fallbackAlias = aliasNodes.has(defaultAlias)
      ? defaultAlias
      : aliasNodes.keys().next().value;
    valueNodeId =
      (fallbackAlias ? aliasNodes.get(fallbackAlias) : undefined) ??
      getConstantNodeId(exprContext, 0);
  }

  const issuesCopy = expressionIssues.length
    ? [...new Set(expressionIssues)]
    : undefined;
  slotSummaries.forEach((summary) => {
    summary.expression = expressionText;
    if (issuesCopy && issuesCopy.length > 0) {
      summary.issues = issuesCopy;
      const issueSet = bindingIssues.get(summary.targetId) ?? new Set<string>();
      issuesCopy.forEach((issue) => issueSet.add(issue));
      bindingIssues.set(summary.targetId, issueSet);
    }
  });
  summaryBindings.push(...slotSummaries);

  return {
    valueNodeId,
    hasActiveSlot,
  };
}

interface BuildGraphOptions {
  faceId: string;
  animatables: Record<string, AnimatableValue>;
  components: AnimatableComponent[];
  bindings: BindingMap;
  inputsById: Map<string, StandardRigInput>;
  inputBindings: InputBindingMap;
}

export interface GraphBindingSummary {
  targetId: string;
  animatableId: string;
  component?: VectorComponent;
  slotId: string;
  slotAlias: string;
  inputId: string | null;
  remap: RemapSettings;
  expression: string;
  valueType: BindingValueType;
  issues?: string[];
}

export interface BuildGraphResult {
  spec: GraphSpec;
  summary: {
    faceId: string;
    inputs: string[];
    outputs: string[];
    bindings: GraphBindingSummary[];
  };
  issues: {
    byTarget: Record<string, string[]>;
    fatal: string[];
  };
}

function sanitizeNodeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function buildRigInputPath(faceId: string, inputPath: string): string {
  const trimmed = inputPath.startsWith("/") ? inputPath.slice(1) : inputPath;
  return `rig/${faceId}/${trimmed}`;
}

function getComponentOrder(
  animatable: AnimatableValue,
): VectorComponent[] | null {
  switch (animatable.type) {
    case "vector2":
      return ["x", "y"];
    case "vector3":
    case "euler":
      return ["x", "y", "z"];
    case "rgb":
      return ["r", "g", "b"];
    default:
      return null;
  }
}

interface AnimatableGraphEntry {
  animatable: AnimatableValue;
  values: Map<string, string>;
  defaults: Map<string, number>;
  isDriven: boolean;
}

type ComponentRecord = Partial<
  Record<VectorComponent | "r" | "g" | "b", unknown>
>;

function isComponentRecord(value: unknown): value is ComponentRecord {
  return typeof value === "object" && value !== null;
}

function componentIndex(component: VectorComponent): number {
  switch (component) {
    case "x":
    case "r":
      return 0;
    case "y":
    case "g":
      return 1;
    default:
      return 2;
  }
}

function extractComponentDefault(
  value: RawValue,
  component: VectorComponent,
): number {
  if (typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    const candidate = value[componentIndex(component)];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    return 0;
  }
  if (value && typeof value === "object") {
    if (!isComponentRecord(value)) {
      return 0;
    }
    const direct = value[component];
    if (typeof direct === "number" && Number.isFinite(direct)) {
      return direct;
    }
    const alt =
      component === "x" ? value.r : component === "y" ? value.g : value.b;
    if (typeof alt === "number" && Number.isFinite(alt)) {
      return alt;
    }
  }
  return 0;
}

interface ExpressionBuildContext {
  componentSafeId: string;
  nodes: NodeSpec[];
  edges: NonNullable<GraphSpec["edges"]>;
  constants: Map<string, string>;
  counter: number;
}

function getConstantNodeId(
  context: ExpressionBuildContext,
  value: number,
): string {
  const key = Number.isFinite(value) ? value.toString() : "NaN";
  const existing = context.constants.get(key);
  if (existing) {
    return existing;
  }
  const nodeId = `const_${context.componentSafeId}_${context.constants.size + 1}`;
  context.nodes.push({
    id: nodeId,
    type: "constant",
    params: {
      value: Number.isFinite(value) ? value : 0,
    },
  });
  context.constants.set(key, nodeId);
  return nodeId;
}

function createBinaryOperationNode(
  context: ExpressionBuildContext,
  operator: "add" | "subtract" | "multiply" | "divide",
  leftId: string,
  rightId: string,
): string {
  const nodeId = `expr_${context.componentSafeId}_${context.counter++}`;
  context.nodes.push({
    id: nodeId,
    type: operator,
  });
  const leftInput =
    operator === "subtract" || operator === "divide" ? "lhs" : "operand_1";
  const rightInput =
    operator === "subtract" || operator === "divide" ? "rhs" : "operand_2";
  context.edges.push({
    from: { node_id: leftId },
    to: { node_id: nodeId, input: leftInput },
  });
  context.edges.push({
    from: { node_id: rightId },
    to: { node_id: nodeId, input: rightInput },
  });
  return nodeId;
}

function createVariadicOperationNode(
  context: ExpressionBuildContext,
  operator: "add" | "multiply",
  operandIds: string[],
): string {
  if (operandIds.length === 0) {
    return getConstantNodeId(context, operator === "add" ? 0 : 1);
  }
  if (operandIds.length === 1) {
    return operandIds[0]!;
  }
  const nodeId = `expr_${context.componentSafeId}_${context.counter++}`;
  context.nodes.push({
    id: nodeId,
    type: operator,
  });
  operandIds.forEach((operandId, index) => {
    context.edges.push({
      from: { node_id: operandId },
      to: { node_id: nodeId, input: `operand_${index + 1}` },
    });
  });
  return nodeId;
}

function createNamedOperationNode(
  context: ExpressionBuildContext,
  operator: string,
  inputNames: string[],
  operandIds: string[],
): string {
  const nodeId = `expr_${context.componentSafeId}_${context.counter++}`;
  context.nodes.push({
    id: nodeId,
    type: operator,
  });
  inputNames.forEach((inputName, index) => {
    const operandId = operandIds[index]!;
    context.edges.push({
      from: { node_id: operandId },
      to: { node_id: nodeId, input: inputName },
    });
  });
  return nodeId;
}

function emitScalarFunctionNode(
  definition: ScalarFunctionDefinition,
  operands: string[],
  context: ExpressionBuildContext,
): string {
  if (definition.variadic) {
    const nodeId = `expr_${context.componentSafeId}_${context.counter++}`;
    context.nodes.push({
      id: nodeId,
      type: definition.nodeType,
    });
    operands.forEach((operandId, index) => {
      context.edges.push({
        from: { node_id: operandId },
        to: {
          node_id: nodeId,
          input: `${definition.variadic!.id}_${index + 1}`,
        },
      });
    });
    return nodeId;
  }

  const providedNames: string[] = [];
  const providedOperands: string[] = [];
  definition.inputs.forEach((input, index) => {
    const operandId = operands[index];
    if (!operandId) {
      return;
    }
    providedNames.push(input.id);
    providedOperands.push(operandId);
  });

  return createNamedOperationNode(
    context,
    definition.nodeType,
    providedNames,
    providedOperands,
  );
}

function applyBindingOperators(
  operators: BindingOperator[],
  baseNodeId: string,
  safeId: string,
  nodes: NodeSpec[],
  edges: NonNullable<GraphSpec["edges"]>,
): string {
  let currentNodeId = baseNodeId;
  operators.forEach((operator, index) => {
    if (!operator.enabled) {
      return;
    }
    let definition: BindingOperatorDefinition;
    try {
      definition = getBindingOperatorDefinition(operator.type);
    } catch {
      return;
    }
    const nodeId = `${operator.type}_${safeId}_${index + 1}`;
    const params: Record<string, number> = {};
    definition.params.forEach((param) => {
      const configured = operator.params?.[param.id];
      params[param.id] =
        typeof configured === "number" ? configured : param.defaultValue;
    });
    nodes.push({
      id: nodeId,
      type: definition.nodeType,
      params: params as NodeSpec["params"],
    });
    const inputId = definition.inputs[0] ?? "in";
    edges.push({
      from: { node_id: currentNodeId },
      to: { node_id: nodeId, input: inputId },
    });
    currentNodeId = nodeId;
  });
  return currentNodeId;
}

function collectOperands(
  node: ControlExpressionNode,
  operator: "+" | "*",
  target: ControlExpressionNode[],
): void {
  if (node.type === "Binary" && node.operator === operator) {
    collectOperands(node.left, operator, target);
    collectOperands(node.right, operator, target);
    return;
  }
  target.push(node);
}

const BINARY_FUNCTION_OPERATOR_MAP: Record<string, string> = {
  ">": "greaterthan",
  "<": "lessthan",
  "==": "equal",
  "!=": "notequal",
  "&&": "and",
  "||": "or",
};

function materializeExpression(
  node: ControlExpressionNode,
  context: ExpressionBuildContext,
  aliasNodes: Map<string, string>,
  issues: string[],
): string {
  switch (node.type) {
    case "Literal": {
      return getConstantNodeId(context, node.value);
    }
    case "Reference": {
      const mapped = aliasNodes.get(node.name);
      if (!mapped) {
        issues.push(`Unknown control "${node.name}".`);
        return getConstantNodeId(context, 0);
      }
      return mapped;
    }
    case "Unary": {
      const operandId = materializeExpression(
        node.operand,
        context,
        aliasNodes,
        issues,
      );
      switch (node.operator) {
        case "+":
          return operandId;
        case "-": {
          const negativeOne = getConstantNodeId(context, -1);
          return createVariadicOperationNode(context, "multiply", [
            negativeOne,
            operandId,
          ]);
        }
        case "!": {
          const definition = SCALAR_FUNCTIONS.get("not");
          if (!definition) {
            issues.push('Function "not" is not available in metadata.');
            return getConstantNodeId(context, 0);
          }
          return emitScalarFunctionNode(definition, [operandId], context);
        }
        default:
          issues.push("Unsupported unary operator.");
          return operandId;
      }
    }
    case "Binary": {
      const operator = node.operator;
      if (operator === "+") {
        const children: ControlExpressionNode[] = [];
        collectOperands(node, "+", children);
        const operandIds = children.map((child) =>
          materializeExpression(child, context, aliasNodes, issues),
        );
        return createVariadicOperationNode(context, "add", operandIds);
      }
      if (operator === "*") {
        const children: ControlExpressionNode[] = [];
        collectOperands(node, "*", children);
        const operandIds = children.map((child) =>
          materializeExpression(child, context, aliasNodes, issues),
        );
        return createVariadicOperationNode(context, "multiply", operandIds);
      }

      const leftId = materializeExpression(
        node.left,
        context,
        aliasNodes,
        issues,
      );
      const rightId = materializeExpression(
        node.right,
        context,
        aliasNodes,
        issues,
      );

      if (operator === "-") {
        return createBinaryOperationNode(context, "subtract", leftId, rightId);
      }
      if (operator === "/") {
        return createBinaryOperationNode(context, "divide", leftId, rightId);
      }

      const mappedFunction = BINARY_FUNCTION_OPERATOR_MAP[operator];
      if (mappedFunction) {
        const definition = SCALAR_FUNCTIONS.get(mappedFunction);
        if (!definition) {
          issues.push(`Function "${mappedFunction}" is not available.`);
          return getConstantNodeId(context, 0);
        }
        return emitScalarFunctionNode(definition, [leftId, rightId], context);
      }

      issues.push(`Unsupported operator "${operator}".`);
      return getConstantNodeId(context, 0);
    }
    case "Function": {
      const name = node.name;
      const normalized = name.toLowerCase();
      const definition = SCALAR_FUNCTIONS.get(normalized);
      if (!definition) {
        issues.push(`Unknown function "${name}".`);
        return getConstantNodeId(context, 0);
      }

      const operands = node.args.map((arg) =>
        materializeExpression(arg, context, aliasNodes, issues),
      );

      if (operands.length < definition.minArgs) {
        issues.push(
          `Function "${name}" expects at least ${definition.minArgs} arguments, received ${operands.length}.`,
        );
        return getConstantNodeId(context, 0);
      }

      if (definition.maxArgs !== null && operands.length > definition.maxArgs) {
        issues.push(
          `Function "${name}" expects at most ${definition.maxArgs} arguments, received ${operands.length}.`,
        );
        return getConstantNodeId(context, 0);
      }

      return emitScalarFunctionNode(definition, operands, context);
    }
    default: {
      issues.push("Unsupported expression node.");
      return getConstantNodeId(context, 0);
    }
  }
}

export function buildRigGraphSpec({
  faceId,
  animatables,
  components,
  bindings,
  inputsById,
  inputBindings,
}: BuildGraphOptions): BuildGraphResult {
  const nodes: NodeSpec[] = [];
  const edges: NonNullable<GraphSpec["edges"]> = [];
  const inputNodes = new Map<
    string,
    { nodeId: string; input: StandardRigInput }
  >();
  const buildingDerived = new Set<string>();
  const computedInputs = new Set<string>();
  const summaryBindings: GraphBindingSummary[] = [];
  const bindingIssues = new Map<string, Set<string>>();
  const animatableEntries = new Map<string, AnimatableGraphEntry>();
  const outputs = new Set<string>();

  const ensureInputNode = (
    inputId: string,
  ): { nodeId: string; input: StandardRigInput } | null => {
    const existing = inputNodes.get(inputId);
    if (existing) {
      return existing;
    }
    const input = inputsById.get(inputId);
    if (!input) {
      return null;
    }
    const defaultValue = Number.isFinite(input.defaultValue)
      ? input.defaultValue
      : 0;

    const inputBindingRaw = inputBindings[inputId];
    if (inputBindingRaw) {
      if (buildingDerived.has(inputId)) {
        const issueSet = bindingIssues.get(inputId) ?? new Set<string>();
        issueSet.add("Derived input cycle detected.");
        bindingIssues.set(inputId, issueSet);
        return null;
      }
      buildingDerived.add(inputId);
      try {
        const target = bindingTargetFromInput(input);
        const binding = ensureBindingStructure(inputBindingRaw, target);
        const requiresSelf =
          binding.inputId === SELF_BINDING_ID ||
          binding.slots.some((slot) => slot.inputId === SELF_BINDING_ID);
        let selfNodeId: string | undefined;
        if (requiresSelf) {
          const sliderNodeId = `input_raw_${sanitizeNodeId(inputId)}`;
          nodes.push({
            id: sliderNodeId,
            type: "input",
            params: {
              path: buildRigInputPath(faceId, input.path),
              value: { float: defaultValue },
            },
          });
          selfNodeId = sliderNodeId;
        }
        const { valueNodeId, hasActiveSlot } = evaluateBinding({
          binding,
          target,
          targetId: inputId,
          animatableId: inputId,
          component: undefined,
          safeId: sanitizeNodeId(inputId),
          context: {
            nodes,
            edges,
            ensureInputNode,
            bindingIssues,
            summaryBindings,
          },
          selfNodeId,
        });
        if (!valueNodeId || !hasActiveSlot) {
          const constNodeId = `derived_default_${sanitizeNodeId(inputId)}`;
          nodes.push({
            id: constNodeId,
            type: "constant",
            params: {
              value: input.defaultValue,
            },
          });
          const record = { nodeId: constNodeId, input };
          inputNodes.set(inputId, record);
          return record;
        }
        computedInputs.add(inputId);
        const record = { nodeId: valueNodeId, input };
        inputNodes.set(inputId, record);
        return record;
      } finally {
        buildingDerived.delete(inputId);
      }
    }

    const nodeId = `input_${sanitizeNodeId(inputId)}`;
    nodes.push({
      id: nodeId,
      type: "input",
      params: {
        path: buildRigInputPath(faceId, input.path),
        value: { float: defaultValue },
      },
    });
    const record = { nodeId, input };
    inputNodes.set(inputId, record);
    return record;
  };

  const ensureAnimatableEntry = (
    animatableId: string,
  ): AnimatableGraphEntry | null => {
    const existing = animatableEntries.get(animatableId);
    if (existing) {
      return existing;
    }
    const animatable = animatables[animatableId];
    if (!animatable) {
      return null;
    }
    const entry: AnimatableGraphEntry = {
      animatable,
      values: new Map<string, string>(),
      defaults: new Map<string, number>(),
      isDriven: false,
    };
    animatableEntries.set(animatableId, entry);
    return entry;
  };

  components.forEach((component) => {
    const bindingRaw = bindings[component.id];
    const target = bindingTargetFromComponent(component);
    const binding = bindingRaw
      ? ensureBindingStructure(bindingRaw, target)
      : null;
    const entry = ensureAnimatableEntry(component.animatableId);
    if (!entry) {
      return;
    }

    const key = component.component ?? "scalar";
    let valueNodeId: string | null = null;

    let hasActiveSlot = false;

    if (binding) {
      const { valueNodeId: producedNodeId, hasActiveSlot: active } =
        evaluateBinding({
          binding,
          target,
          targetId: component.id,
          animatableId: component.animatableId,
          component: component.component,
          safeId: component.safeId,
          context: {
            nodes,
            edges,
            ensureInputNode,
            bindingIssues,
            summaryBindings,
          },
        });
      valueNodeId = producedNodeId;
      hasActiveSlot = active;
      if (active) {
        entry.isDriven = true;
      }
    } else {
      summaryBindings.push({
        targetId: component.id,
        animatableId: component.animatableId,
        component: component.component,
        slotId: PRIMARY_SLOT_ID,
        slotAlias: PRIMARY_SLOT_ALIAS,
        inputId: null,
        remap: createDefaultRemap(target),
        expression: PRIMARY_SLOT_ALIAS,
        valueType: target.valueType === "vector" ? "vector" : "scalar",
        issues: ["Binding not found."],
      });
      const fallbackIssues =
        bindingIssues.get(component.id) ?? new Set<string>();
      fallbackIssues.add("Binding not found.");
      bindingIssues.set(component.id, fallbackIssues);
    }

    if (!valueNodeId || !hasActiveSlot) {
      entry.defaults.set(key, component.defaultValue);
      return;
    }

    const operatorList = binding
      ? ((binding as AnimatableBinding & { operators?: BindingOperator[] })
          .operators ?? [])
      : [];
    const finalNodeId = applyBindingOperators(
      operatorList,
      valueNodeId,
      component.safeId,
      nodes,
      edges,
    );
    entry.values.set(key, finalNodeId);
  });

  inputsById.forEach((_input, inputId) => {
    ensureInputNode(inputId);
  });

  animatableEntries.forEach((entry, animatableId) => {
    if (!entry.isDriven) {
      return;
    }
    outputs.add(animatableId);
    const safeId = sanitizeNodeId(animatableId);
    const order = getComponentOrder(entry.animatable);
    if (!order) {
      const valueNodeId = entry.values.get("scalar");
      if (!valueNodeId) {
        return;
      }
      const outputNodeId = `out_${safeId}`;
      nodes.push({
        id: outputNodeId,
        type: "output",
        params: {
          path: animatableId,
        },
      });
      edges.push({
        from: { node_id: valueNodeId },
        to: { node_id: outputNodeId, input: "in" },
      });
      return;
    }

    const joinNodeId = `join_${safeId}`;
    nodes.push({
      id: joinNodeId,
      type: "join",
    });

    order.forEach((componentKey, index) => {
      let sourceId = entry.values.get(componentKey);
      if (!sourceId) {
        const componentDefault =
          entry.defaults.get(componentKey) ??
          extractComponentDefault(
            buildAnimatableValue(entry.animatable, undefined),
            componentKey,
          );
        const constNodeId = `const_${safeId}_${componentKey}`;
        nodes.push({
          id: constNodeId,
          type: "constant",
          params: {
            value: componentDefault,
          },
        });
        sourceId = constNodeId;
      }
      edges.push({
        from: { node_id: sourceId },
        to: { node_id: joinNodeId, input: `operand_${index + 1}` },
      });
    });

    const outputNodeId = `out_${safeId}`;
    nodes.push({
      id: outputNodeId,
      type: "output",
      params: {
        path: animatableId,
      },
    });
    edges.push({
      from: { node_id: joinNodeId },
      to: { node_id: outputNodeId, input: "in" },
    });
  });

  const nodeById = new Map<string, NodeSpec>();
  nodes.forEach((node) => {
    nodeById.set(node.id, node);
  });

  const constantUsage = new Map<string, number>();
  edges.forEach((edge: GraphEdge) => {
    const source = nodeById.get(edge.from.node_id);
    if (source?.type === "constant") {
      constantUsage.set(source.id, (constantUsage.get(source.id) ?? 0) + 1);
    }
  });

  const updatedEdges: NonNullable<GraphSpec["edges"]> = [];
  const constantsToRemove = new Set<string>();

  edges.forEach((edge: GraphEdge) => {
    const source = nodeById.get(edge.from.node_id);
    if (
      source?.type === "constant" &&
      constantUsage.get(source.id) === 1 &&
      source.params &&
      Object.prototype.hasOwnProperty.call(source.params, "value")
    ) {
      const target = nodeById.get(edge.to.node_id);
      if (target) {
        const value = (source.params as { value?: unknown }).value;
        if (value !== undefined) {
          target.input_defaults = {
            ...(target.input_defaults ?? {}),
            [edge.to.input]: value,
          };
          nodeById.set(target.id, target);
          constantsToRemove.add(source.id);
          return;
        }
      }
    }
    updatedEdges.push(edge);
  });

  const filteredNodes = nodes
    .filter((node) => !constantsToRemove.has(node.id))
    .map((node) => nodeById.get(node.id) ?? node);

  const remapDefaultIssues = validateRemapDefaults(filteredNodes);

  const dynamicOutputs = Array.from(outputs);
  const computedInputList = Array.from(computedInputs);
  const filteredSummaryBindings = summaryBindings.filter(
    (binding) =>
      outputs.has(binding.animatableId) ||
      computedInputs.has(binding.animatableId),
  );

  const spec: GraphSpec = {
    nodes: filteredNodes,
    edges: updatedEdges.length ? updatedEdges : undefined,
  };

  const baseSpec = spec as Record<string, unknown>;
  const specWithMetadata = {
    ...baseSpec,
    metadata: {
      ...(baseSpec.metadata as Record<string, unknown> | undefined),
      vizij: {
        faceId,
        inputs: Array.from(inputsById.values()).map((input) => ({
          id: input.id,
          path: input.path,
          sourceId: input.sourceId,
          label: input.label,
          group: input.group,
          defaultValue: input.defaultValue,
          range: {
            min: input.range.min,
            max: input.range.max,
          },
        })),
        bindings: filteredSummaryBindings.map((binding) => ({
          ...binding,
          remap: { ...binding.remap },
          expression: binding.expression,
          valueType: binding.valueType,
          issues: binding.issues ? [...binding.issues] : undefined,
        })),
      },
    },
  } as GraphSpec;

  const issuesByTarget: Record<string, string[]> = {};
  bindingIssues.forEach((issues, targetId) => {
    if (issues.size === 0) {
      return;
    }
    issuesByTarget[targetId] = Array.from(issues);
  });
  const fatalIssues = new Set<string>();
  Object.values(issuesByTarget).forEach((issues) => {
    issues.forEach((issue) => fatalIssues.add(issue));
  });
  remapDefaultIssues.forEach((issue) => fatalIssues.add(issue));

  return {
    spec: specWithMetadata,
    summary: {
      faceId,
      inputs: Array.from(inputNodes.values()).map(({ input }) =>
        buildRigInputPath(faceId, input.path),
      ),
      outputs: [...dynamicOutputs, ...computedInputList],
      bindings: filteredSummaryBindings,
    },
    issues: {
      byTarget: issuesByTarget,
      fatal: Array.from(fatalIssues),
    },
  };
}
function validateRemapDefaults(nodes: NodeSpec[]): string[] {
  const issues: string[] = [];
  nodes.forEach((node) => {
    if (node.type !== "centered_remap") {
      return;
    }
    const defaults = node.input_defaults ?? {};
    (
      [
        "in_low",
        "in_anchor",
        "in_high",
        "out_low",
        "out_anchor",
        "out_high",
      ] as const
    ).forEach((key) => {
      const value = (defaults as Record<string, unknown>)[key];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push(`Remap node ${node.id} missing ${key} default.`);
      }
    });
  });
  return issues;
}
