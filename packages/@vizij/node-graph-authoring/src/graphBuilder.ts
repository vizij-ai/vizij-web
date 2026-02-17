import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import type { AnimatableComponent } from "@vizij/utils";
import type { RigBindingMetadata } from "@vizij/utils";
import {
  buildAnimatableValue,
  cloneDeepSafe,
  isRigElementStandardInputPath,
  resolveStandardRigInputId,
} from "@vizij/utils";
import { SELF_BINDING_ID } from "@vizij/utils";
import { nodeRegistryVersion } from "@vizij/node-graph-wasm/metadata";
import type { BindingMap } from "./state";
import {
  ensureBindingStructure,
  bindingTargetFromComponent,
  bindingTargetFromInput,
  type AnimatableBinding,
  type BindingValueType,
  type BindingTarget,
  type InputBindingMap,
  PRIMARY_SLOT_ALIAS,
  PRIMARY_SLOT_ID,
} from "./state";
import {
  collectExpressionReferences,
  parseControlExpression,
  type ControlExpressionNode,
} from "./expression";
import {
  SCALAR_FUNCTIONS,
  type ExpressionValueType,
  type ScalarFunctionDefinition,
} from "./expressionFunctions";
import {
  createExpressionVariableTable,
  type ExpressionVariableTable,
} from "./expressionVariables";
import { RESERVED_EXPRESSION_VARIABLES } from "./expressionVocabulary";
import { createIrGraphBuilder, toIrBindingSummary } from "./ir/builder";
import { compileIrGraph } from "./ir/compiler";
import { buildBindingMetadataFromExpression } from "./bindingMetadata";
import type {
  IrConstant,
  IrEdge,
  IrGraph,
  IrGraphSummary,
  IrIssue,
  IrNode,
  IrCompileOptions,
  IrCompileResult,
} from "./ir/types";

type VectorComponent = "x" | "y" | "z" | "r" | "g" | "b";
type GraphEdge = IrEdge;

interface BindingGraphContext {
  nodes: IrNode[];
  edges: IrEdge[];
  inputsById: Map<string, StandardRigInput>;
  inputBindings: InputBindingMap;
  ensureInputNode: (
    inputId: string,
  ) => { nodeId: string; input: StandardRigInput } | null;
  bindingIssues: Map<string, Set<string>>;
  summaryBindings: GraphBindingSummary[];
  graphReservedNodes: Map<string, string>;
  generateReservedNodeId: (kind: string) => string;
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
  enforceRigBoundaryRules?: boolean;
}

function resolveBindingSlotInputId(
  bindingInputId: string | null | undefined,
  inputsById: Map<string, StandardRigInput>,
): string | null | undefined {
  if (!bindingInputId || bindingInputId === SELF_BINDING_ID) {
    return bindingInputId;
  }
  const resolvedInputId = resolveStandardRigInputId(bindingInputId, inputsById);
  if (inputsById.has(resolvedInputId)) {
    return resolvedInputId;
  }
  return bindingInputId;
}

function isRigElementAliasInput(
  inputId: string,
  inputsById: Map<string, StandardRigInput>,
): boolean {
  const input = inputsById.get(inputId);
  if (!input?.path) {
    return false;
  }
  return isRigElementStandardInputPath(input.path);
}

function isHigherOrderRigBindingInput(
  inputId: string,
  inputsById: Map<string, StandardRigInput>,
): boolean {
  const input = inputsById.get(inputId);
  if (!input?.path) {
    return false;
  }
  if (isRigElementAliasInput(inputId, inputsById)) {
    return false;
  }
  return true;
}

function bindingReferencesRigElementInput(
  binding: AnimatableBinding,
  inputsById: Map<string, StandardRigInput>,
): boolean {
  const candidateInputIds = new Set<string>();
  if (binding.inputId && binding.inputId !== SELF_BINDING_ID) {
    candidateInputIds.add(binding.inputId);
  }
  binding.slots.forEach((slot) => {
    if (slot.inputId && slot.inputId !== SELF_BINDING_ID) {
      candidateInputIds.add(slot.inputId);
    }
  });

  for (const candidateInputId of candidateInputIds) {
    if (isRigElementStandardInputPath(candidateInputId)) {
      return true;
    }
    const resolvedCandidateId = resolveBindingSlotInputId(
      candidateInputId,
      inputsById,
    );
    if (!resolvedCandidateId || resolvedCandidateId === SELF_BINDING_ID) {
      continue;
    }
    const resolvedInput = inputsById.get(resolvedCandidateId);
    if (resolvedInput && isRigElementStandardInputPath(resolvedInput.path)) {
      return true;
    }
  }

  return false;
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
  enforceRigBoundaryRules = false,
}: EvaluateBindingArgs): {
  valueNodeId: string | null;
  hasActiveSlot: boolean;
} {
  const {
    nodes,
    edges,
    ensureInputNode,
    bindingIssues,
    summaryBindings,
    inputsById,
    inputBindings,
  } = context;
  const exprContext: ExpressionBuildContext = {
    componentSafeId: safeId,
    nodes,
    edges,
    constants: new Map(),
    counter: 0,
    reservedNodes: new Map(),
    nodeValueTypes: new Map(),
    graphReservedNodes: context.graphReservedNodes,
    generateReservedNodeId: context.generateReservedNodeId,
  };
  const targetValueType: BindingValueType =
    target.valueType === "vector" ? "vector" : "scalar";
  const variableTable = createExpressionVariableTable();
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
    const resolvedSlotInputId = resolveBindingSlotInputId(
      slot.inputId,
      inputsById,
    );
    const slotValueType: BindingValueType =
      slot.valueType === "vector" ? "vector" : "scalar";
    let slotOutputId: string;
    if (slot.inputId === SELF_BINDING_ID) {
      if (selfNodeId) {
        slotOutputId = selfNodeId;
        hasActiveSlot = true;
        setNodeValueType(
          exprContext,
          slotOutputId,
          slotValueType === "vector" ? "vector" : "scalar",
        );
      } else {
        expressionIssues.push("Self reference unavailable for this input.");
        slotOutputId = getConstantNodeId(exprContext, target.defaultValue);
      }
    } else if (resolvedSlotInputId) {
      const inputId = resolvedSlotInputId;
      const sourceBinding = inputBindings[inputId];
      const allowedHigherOrderViaRigElementSource =
        sourceBinding !== undefined &&
        bindingReferencesRigElementInput(sourceBinding, inputsById);
      if (
        enforceRigBoundaryRules &&
        isHigherOrderRigBindingInput(inputId, inputsById) &&
        !allowedHigherOrderViaRigElementSource &&
        inputId !== SELF_BINDING_ID
      ) {
        expressionIssues.push(
          `Input "${inputId}" is a higher-order rig input and cannot directly drive animatable "${target.id}".`,
        );
        slotOutputId = getConstantNodeId(exprContext, 0);
        hasActiveSlot = true;
      } else {
        const inputNode = ensureInputNode(inputId);
        if (inputNode) {
          slotOutputId = inputNode.nodeId;
          hasActiveSlot = true;
          setNodeValueType(
            exprContext,
            slotOutputId,
            slotValueType === "vector" ? "vector" : "scalar",
          );
        } else {
          expressionIssues.push(`Missing standard input "${inputId}".`);
          slotOutputId = getConstantNodeId(exprContext, 0);
        }
      }
    } else {
      slotOutputId = getConstantNodeId(exprContext, 0);
    }
    variableTable.registerSlotVariable({
      name: alias,
      nodeId: slotOutputId,
      slotId,
      slotAlias: alias,
      inputId: resolvedSlotInputId ?? null,
      targetId,
      animatableId,
      component,
      valueType: slotValueType,
    });
    setNodeValueType(
      exprContext,
      slotOutputId,
      slotValueType === "vector" ? "vector" : "scalar",
    );
    slotSummaries.push({
      targetId,
      animatableId,
      component,
      slotId,
      slotAlias: alias,
      inputId: resolvedSlotInputId ?? null,
      expression: trimmedExpression,
      valueType: slotValueType,
      nodeId: slotOutputId,
      expressionNodeId: slotOutputId,
    });
  });

  if (slotSummaries.length === 0) {
    const alias = PRIMARY_SLOT_ALIAS;
    const constantId = getConstantNodeId(exprContext, 0);
    variableTable.registerSlotVariable({
      name: alias,
      nodeId: constantId,
      slotId: PRIMARY_SLOT_ID,
      slotAlias: alias,
      inputId: null,
      targetId,
      animatableId,
      component,
      valueType: targetValueType,
    });
    setNodeValueType(
      exprContext,
      constantId,
      targetValueType === "vector" ? "vector" : "scalar",
    );
    slotSummaries.push({
      targetId,
      animatableId,
      component,
      slotId: PRIMARY_SLOT_ID,
      slotAlias: alias,
      inputId: null,
      expression: trimmedExpression,
      valueType: targetValueType,
      nodeId: constantId,
      expressionNodeId: constantId,
    });
  }

  RESERVED_EXPRESSION_VARIABLES.forEach((reserved) => {
    if (reserved.available === false) {
      return;
    }
    let nodeId: string | null = null;
    if (reserved.name === "self") {
      nodeId = selfNodeId ?? null;
    } else {
      nodeId = ensureReservedVariableNode(reserved.name, exprContext);
    }
    variableTable.registerReservedVariable({
      name: reserved.name,
      nodeId,
      description: reserved.description,
      targetId: reserved.scope === "binding" ? targetId : undefined,
      animatableId: reserved.scope === "binding" ? animatableId : undefined,
      component: reserved.scope === "binding" ? component : undefined,
    });
  });

  const defaultAlias = slotSummaries[0]?.slotAlias ?? PRIMARY_SLOT_ALIAS;
  const expressionText =
    trimmedExpression.length > 0 ? trimmedExpression : defaultAlias;

  const parseResult = parseControlExpression(expressionText);
  let expressionAst: ControlExpressionNode | null = null;

  if (parseResult.node && parseResult.errors.length === 0) {
    const references = Array.from(
      collectExpressionReferences(parseResult.node),
    );
    const missing = variableTable.missing(references);
    if (missing.length === 0) {
      expressionAst = parseResult.node;
    } else {
      validateLiteralParamArguments(parseResult.node, expressionIssues);
      missing.forEach((missingVar) => {
        if (
          missingVar.reason === "unresolved" &&
          missingVar.entry?.kind === "reserved"
        ) {
          expressionIssues.push(
            `Reserved variable "${missingVar.name}" is unavailable for this binding.`,
          );
        } else {
          expressionIssues.push(`Unknown control "${missingVar.name}".`);
        }
      });
    }
  } else {
    parseResult.errors.forEach((error) => {
      expressionIssues.push(error.message);
    });
  }

  const expressionMetadata = buildBindingMetadataFromExpression(
    expressionAst,
    variableTable,
  );

  let valueNodeId: string | null = null;

  if (expressionAst) {
    valueNodeId = materializeExpression(
      expressionAst,
      exprContext,
      variableTable,
      expressionIssues,
    );
  }

  if (!valueNodeId) {
    const fallbackNodeId =
      variableTable.resolveNodeId(defaultAlias) ?? variableTable.firstNodeId();
    valueNodeId = fallbackNodeId ?? getConstantNodeId(exprContext, 0);
  }

  const issuesCopy = expressionIssues.length
    ? [...new Set(expressionIssues)]
    : undefined;
  slotSummaries.forEach((summary) => {
    summary.expression = expressionText;
    summary.expressionNodeId = valueNodeId;
    if (expressionMetadata) {
      summary.metadata = expressionMetadata;
    }
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

interface InputExportMetadata {
  source?: "auto" | "custom" | "preset";
  root?: string;
}

export interface BuildGraphOptions {
  faceId: string;
  animatables: Record<string, AnimatableValue>;
  components: AnimatableComponent[];
  bindings: BindingMap;
  inputsById: Map<string, StandardRigInput>;
  inputBindings: InputBindingMap;
  inputMetadata?: Map<string, InputExportMetadata>;
}

export interface GraphBindingSummary {
  targetId: string;
  animatableId: string;
  component?: VectorComponent;
  slotId: string;
  slotAlias: string;
  inputId: string | null;
  expression: string;
  valueType: BindingValueType;
  nodeId: string;
  expressionNodeId: string;
  issues?: string[];
  metadata?: RigBindingMetadata;
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
  ir?: {
    graph: IrGraph;
    compile: (options?: IrCompileOptions) => IrCompileResult;
  };
}

function sanitizeNodeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function buildRigInputPath(faceId: string, inputPath: string): string {
  let trimmed = inputPath.startsWith("/") ? inputPath.slice(1) : inputPath;
  if (!trimmed) {
    return `rig/${faceId}`;
  }
  while (trimmed.startsWith("rig/")) {
    const segments = trimmed.split("/");
    if (segments.length >= 3) {
      const existingFaceId = segments[1];
      const remainder = segments.slice(2).join("/");
      if (existingFaceId === faceId) {
        return trimmed;
      }
      trimmed = remainder || "";
    } else {
      trimmed = segments.slice(1).join("/");
    }
  }
  const suffix = trimmed ? `/${trimmed}` : "";
  return `rig/${faceId}${suffix}`;
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
  nodes: IrNode[];
  edges: IrEdge[];
  constants: Map<string, string>;
  counter: number;
  reservedNodes: Map<string, string>;
  nodeValueTypes: Map<string, ExpressionValueType>;
  graphReservedNodes: Map<string, string>;
  generateReservedNodeId: (kind: string) => string;
}

function setNodeValueType(
  context: ExpressionBuildContext,
  nodeId: string,
  valueType: ExpressionValueType,
): void {
  context.nodeValueTypes.set(nodeId, valueType);
}

function getNodeValueType(
  context: ExpressionBuildContext,
  nodeId: string,
): ExpressionValueType {
  return context.nodeValueTypes.get(nodeId) ?? "any";
}

function matchesValueType(
  actual: ExpressionValueType,
  expected: ExpressionValueType,
): boolean {
  if (expected === "any" || actual === "any") {
    return true;
  }
  if (expected === "scalar") {
    return actual === "scalar" || actual === "boolean";
  }
  return actual === expected;
}

function ensureOperandValueType(
  context: ExpressionBuildContext,
  operandId: string,
  expected: ExpressionValueType,
  functionName: string,
  inputId: string,
  issues: string[],
): void {
  if (expected === "any") {
    return;
  }
  const actual = getNodeValueType(context, operandId);
  if (matchesValueType(actual, expected)) {
    return;
  }
  const expectation =
    expected === "vector"
      ? "a vector"
      : expected === "boolean"
        ? "a boolean"
        : "a scalar";
  issues.push(
    `Function "${functionName}" expects ${expectation} input for "${inputId}", but the expression produced ${actual}.`,
  );
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
  setNodeValueType(context, nodeId, "scalar");
  return nodeId;
}

function getVectorConstantNodeId(
  context: ExpressionBuildContext,
  values: number[],
): string {
  const normalized = values.map((value) =>
    Number.isFinite(value) ? value : 0,
  );
  const key = `vector:${normalized.join(",")}`;
  const existing = context.constants.get(key);
  if (existing) {
    return existing;
  }
  const nodeId = `const_${context.componentSafeId}_${context.constants.size + 1}`;
  context.nodes.push({
    id: nodeId,
    type: "constant",
    params: {
      value: {
        vector: normalized,
      },
    },
  });
  context.constants.set(key, nodeId);
  setNodeValueType(context, nodeId, "vector");
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
  setNodeValueType(context, nodeId, "scalar");
  const leftInput =
    operator === "subtract" || operator === "divide" ? "lhs" : "operand_1";
  const rightInput =
    operator === "subtract" || operator === "divide" ? "rhs" : "operand_2";
  context.edges.push({
    from: { nodeId: leftId },
    to: { nodeId: nodeId, portId: leftInput },
  });
  context.edges.push({
    from: { nodeId: rightId },
    to: { nodeId: nodeId, portId: rightInput },
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
  setNodeValueType(context, nodeId, "scalar");
  operandIds.forEach((operandId, index) => {
    context.edges.push({
      from: { nodeId: operandId },
      to: { nodeId: nodeId, portId: `operand_${index + 1}` },
    });
  });
  return nodeId;
}

function createNamedOperationNode(
  context: ExpressionBuildContext,
  operator: string,
  inputNames: string[],
  operandIds: string[],
  resultType: ExpressionValueType = "scalar",
  params?: Record<string, unknown>,
): string {
  const nodeId = `expr_${context.componentSafeId}_${context.counter++}`;
  const node: IrNode = {
    id: nodeId,
    type: operator,
  };
  if (params && Object.keys(params).length > 0) {
    node.params = params;
  }
  context.nodes.push(node);
  setNodeValueType(context, nodeId, resultType);
  inputNames.forEach((inputName, index) => {
    const operandId = operandIds[index]!;
    context.edges.push({
      from: { nodeId: operandId },
      to: { nodeId: nodeId, portId: inputName },
    });
  });
  return nodeId;
}

function ensureReservedVariableNode(
  name: string,
  context: ExpressionBuildContext,
): string | null {
  const existing = context.reservedNodes.get(name);
  if (existing) {
    return existing;
  }
  if (name === "time" || name === "deltaTime" || name === "frame") {
    const nodeId = ensureGraphTimeNode(context);
    context.reservedNodes.set(name, nodeId);
    return nodeId;
  }
  return null;
}

function ensureGraphTimeNode(context: ExpressionBuildContext): string {
  const existing = context.graphReservedNodes.get("time");
  if (existing) {
    return existing;
  }
  const nodeId = context.generateReservedNodeId("time");
  context.nodes.push({
    id: nodeId,
    type: "time",
    metadata: {
      reservedVariable: "time",
    },
  });
  setNodeValueType(context, nodeId, "scalar");
  context.graphReservedNodes.set("time", nodeId);
  return nodeId;
}

function emitScalarFunctionNode(
  definition: ScalarFunctionDefinition,
  operands: string[],
  argNodes: ControlExpressionNode[],
  totalArgCount: number,
  context: ExpressionBuildContext,
  variables: ExpressionVariableTable,
  issues: string[],
  paramArgOverride?: ControlExpressionNode[],
): string {
  if (definition.nodeType === "case") {
    return emitCaseFunctionNode(
      definition,
      operands,
      argNodes,
      context,
      variables,
      issues,
    );
  }

  const orderedOperands = operands.slice(0, definition.inputs.length);
  definition.inputs.forEach((input, index) => {
    const operandId = orderedOperands[index];
    if (!operandId) {
      return;
    }
    ensureOperandValueType(
      context,
      operandId,
      input.valueType,
      definition.nodeType,
      input.id,
      issues,
    );
  });

  const availableAfterInputs = Math.max(
    0,
    totalArgCount - definition.inputs.length,
  );
  const paramArgCount =
    definition.params.length > 0
      ? Math.min(definition.params.length, availableAfterInputs)
      : 0;
  const variadicArgCount = definition.variadic
    ? Math.max(0, availableAfterInputs - paramArgCount)
    : 0;
  const variadicOperands = definition.variadic
    ? operands.slice(
        definition.inputs.length,
        definition.inputs.length + variadicArgCount,
      )
    : [];
  if (definition.variadic) {
    variadicOperands.forEach((operandId, _variadicIndex) => {
      ensureOperandValueType(
        context,
        operandId,
        definition.variadic!.valueType,
        definition.nodeType,
        definition.variadic!.id,
        issues,
      );
    });
  }

  const paramArgStart = definition.inputs.length + variadicArgCount;
  const paramArgNodes =
    paramArgCount > 0
      ? (paramArgOverride ??
        argNodes.slice(paramArgStart, paramArgStart + paramArgCount))
      : [];

  const isSlewDebugEnabled =
    typeof process !== "undefined" &&
    process?.env &&
    process.env.DEBUG_SLEW === "1";
  if (isSlewDebugEnabled && definition.nodeType === "slew") {
    console.log("slew-debug", {
      totalArgs: totalArgCount,
      inputs: definition.inputs.length,
      paramCount: definition.params.length,
      paramArgCount,
      paramArgNodesTypes: paramArgNodes.map((node) => node?.type ?? null),
    });
  }
  const nodeParams = buildParamAssignments(definition, paramArgNodes, issues);

  if (definition.variadic && definition.inputs.length === 0) {
    const nodeId = `expr_${context.componentSafeId}_${context.counter++}`;
    const node: IrNode = {
      id: nodeId,
      type: definition.nodeType,
    };
    if (nodeParams) {
      node.params = nodeParams;
    }
    context.nodes.push(node);
    variadicOperands.forEach((operandId, index) => {
      context.edges.push({
        from: { nodeId: operandId },
        to: {
          nodeId,
          portId: `${definition.variadic!.id}_${index + 1}`,
        },
      });
    });
    setNodeValueType(context, nodeId, definition.resultValueType);
    return nodeId;
  }

  const providedNames: string[] = [];
  const providedOperands: string[] = [];
  definition.inputs.forEach((input, index) => {
    const operandId = orderedOperands[index];
    if (!operandId) {
      return;
    }
    providedNames.push(input.id);
    providedOperands.push(operandId);
  });

  const nodeId = createNamedOperationNode(
    context,
    definition.nodeType,
    providedNames,
    providedOperands,
    definition.resultValueType,
    nodeParams ?? undefined,
  );

  if (definition.variadic) {
    variadicOperands.forEach((operandId, index) => {
      context.edges.push({
        from: { nodeId: operandId },
        to: {
          nodeId,
          portId: `${definition.variadic!.id}_${index + 1}`,
        },
      });
    });
  }

  return nodeId;
}

function emitCaseFunctionNode(
  definition: ScalarFunctionDefinition,
  operands: string[],
  argNodes: ControlExpressionNode[],
  context: ExpressionBuildContext,
  variables: ExpressionVariableTable,
  issues: string[],
): string {
  const selectorId = operands[0];
  const defaultId = operands[1];
  const branchOperands = operands.slice(2);
  const branchArgs = argNodes.slice(2);

  if (!selectorId || branchOperands.length === 0) {
    issues.push(
      'Function "case" requires a selector, default, and at least one branch.',
    );
    return getConstantNodeId(context, 0);
  }

  const nodeId = `expr_${context.componentSafeId}_${context.counter++}`;
  const caseLabels = branchOperands.map((_, index) => {
    const extracted = extractCaseLabel(branchArgs[index], variables);
    if (extracted) {
      return extracted;
    }
    const fallback = `case_${index + 1}`;
    issues.push(
      `Case branch ${index + 1} is missing an alias; generated fallback label ${fallback}.`,
    );
    return fallback;
  });

  context.nodes.push({
    id: nodeId,
    type: definition.nodeType,
    params: caseLabels.length > 0 ? { case_labels: caseLabels } : undefined,
  });

  ensureOperandValueType(
    context,
    selectorId,
    definition.inputs[0]?.valueType ?? "any",
    definition.nodeType,
    definition.inputs[0]?.id ?? "selector",
    issues,
  );
  context.edges.push({
    from: { nodeId: selectorId },
    to: { nodeId, portId: definition.inputs[0]?.id ?? "selector" },
  });

  if (defaultId) {
    ensureOperandValueType(
      context,
      defaultId,
      definition.inputs[1]?.valueType ?? "any",
      definition.nodeType,
      "default",
      issues,
    );
    context.edges.push({
      from: { nodeId: defaultId },
      to: { nodeId, portId: "default" },
    });
  }

  branchOperands.forEach((operandId, index) => {
    const portId = `${definition.variadic?.id ?? "operand"}_${index + 1}`;
    ensureOperandValueType(
      context,
      operandId,
      definition.variadic?.valueType ?? "any",
      definition.nodeType,
      portId,
      issues,
    );
    context.edges.push({
      from: { nodeId: operandId },
      to: { nodeId, portId },
    });
  });

  setNodeValueType(context, nodeId, "any");
  return nodeId;
}

type ScalarFunctionParamSpec = ScalarFunctionDefinition["params"][number];

function buildParamAssignments(
  definition: ScalarFunctionDefinition,
  paramArgNodes: ControlExpressionNode[],
  issues: string[],
): Record<string, unknown> | null {
  if (!definition.params.length || paramArgNodes.length === 0) {
    return null;
  }
  const assignments: Record<string, unknown> = {};
  paramArgNodes.forEach((node, index) => {
    const spec = definition.params[index];
    if (!spec) {
      return;
    }
    const literal = extractParamLiteral(
      node,
      spec,
      definition.nodeType,
      issues,
    );
    if (literal !== null) {
      assignments[spec.id] = literal;
    }
  });
  return Object.keys(assignments).length > 0 ? assignments : null;
}

function extractParamLiteral(
  node: ControlExpressionNode,
  spec: ScalarFunctionParamSpec,
  functionName: string,
  issues: string[],
): number | number[] | boolean | null {
  if (spec.valueType === "vector") {
    if (node.type !== "VectorLiteral") {
      issues.push(
        `Function "${functionName}" requires a literal vector for "${spec.id}".`,
      );
      return null;
    }
    if (!Array.isArray(node.values) || node.values.length === 0) {
      issues.push(
        `Function "${functionName}" requires at least one value for "${spec.id}".`,
      );
      return null;
    }
    return node.values.map((value) => clampScalarParamValue(value, spec));
  }
  if (node.type !== "Literal") {
    issues.push(
      `Function "${functionName}" requires a literal ${describeParamExpectation(spec.valueType)} for "${spec.id}".`,
    );
    return null;
  }
  const numeric = Number(node.value);
  if (!Number.isFinite(numeric)) {
    issues.push(
      `Function "${functionName}" requires a finite ${describeParamExpectation(spec.valueType)} for "${spec.id}".`,
    );
    return null;
  }
  const clamped = clampScalarParamValue(numeric, spec);
  if (spec.valueType === "boolean") {
    return clamped !== 0;
  }
  return clamped;
}

function clampScalarParamValue(
  value: number,
  spec: ScalarFunctionParamSpec,
): number {
  let next = Number.isFinite(value) ? value : 0;
  if (typeof spec.min === "number" && next < spec.min) {
    next = spec.min;
  }
  if (typeof spec.max === "number" && next > spec.max) {
    next = spec.max;
  }
  return next;
}

function describeParamExpectation(valueType: ExpressionValueType): string {
  switch (valueType) {
    case "vector":
      return "vector";
    case "boolean":
      return "boolean";
    default:
      return "scalar";
  }
}

function extractCaseLabel(
  node: ControlExpressionNode | undefined,
  variables: ExpressionVariableTable,
): string | null {
  if (!node || node.type !== "Reference") {
    return null;
  }
  const entry = variables.resolve(node.name);
  if (entry && entry.metadata && "slotAlias" in entry.metadata) {
    const alias = entry.metadata.slotAlias?.trim();
    if (alias && alias.length > 0) {
      return alias;
    }
  }
  return node.name;
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

function validateLiteralParamArguments(
  node: ControlExpressionNode,
  issues: string[],
): void {
  if (node.type === "Function") {
    const definition = SCALAR_FUNCTIONS.get(node.name.toLowerCase());
    if (definition && definition.params.length > 0) {
      const totalArgCount = node.args.length;
      const availableAfterInputs = Math.max(
        0,
        totalArgCount - definition.inputs.length,
      );
      const paramArgCount = Math.min(
        definition.params.length,
        availableAfterInputs,
      );
      const variadicArgCount = definition.variadic
        ? Math.max(0, availableAfterInputs - paramArgCount)
        : 0;
      const paramArgStart = definition.inputs.length + variadicArgCount;
      for (let index = 0; index < paramArgCount; index++) {
        const spec = definition.params[index];
        const paramNode = node.args[paramArgStart + index];
        if (!spec || !paramNode) {
          continue;
        }
        extractParamLiteral(paramNode, spec, node.name, issues);
      }
    }
    node.args.forEach((child) => validateLiteralParamArguments(child, issues));
    return;
  }
  if (node.type === "Unary") {
    validateLiteralParamArguments(node.operand, issues);
    return;
  }
  if (node.type === "Binary") {
    validateLiteralParamArguments(node.left, issues);
    validateLiteralParamArguments(node.right, issues);
  }
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
  variables: ExpressionVariableTable,
  issues: string[],
): string {
  switch (node.type) {
    case "Literal": {
      return getConstantNodeId(context, node.value);
    }
    case "VectorLiteral": {
      return getVectorConstantNodeId(context, node.values);
    }
    case "Reference": {
      const entry = variables.resolve(node.name);
      if (!entry) {
        issues.push(`Unknown control "${node.name}".`);
        return getConstantNodeId(context, 0);
      }
      const mappedId = entry.nodeId ?? getConstantNodeId(context, 0);
      return mappedId;
    }
    case "Unary": {
      const operandId = materializeExpression(
        node.operand,
        context,
        variables,
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
          return emitScalarFunctionNode(
            definition,
            [operandId],
            [node.operand],
            1,
            context,
            variables,
            issues,
          );
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
          materializeExpression(child, context, variables, issues),
        );
        return createVariadicOperationNode(context, "add", operandIds);
      }
      if (operator === "*") {
        const children: ControlExpressionNode[] = [];
        collectOperands(node, "*", children);
        const operandIds = children.map((child) =>
          materializeExpression(child, context, variables, issues),
        );
        return createVariadicOperationNode(context, "multiply", operandIds);
      }

      const leftId = materializeExpression(
        node.left,
        context,
        variables,
        issues,
      );
      const rightId = materializeExpression(
        node.right,
        context,
        variables,
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
        return emitScalarFunctionNode(
          definition,
          [leftId, rightId],
          [node.left, node.right],
          2,
          context,
          variables,
          issues,
        );
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

      const argNodes = node.args;
      const argCount = argNodes.length;

      if (argCount < definition.minArgs) {
        issues.push(
          `Function "${name}" expects at least ${definition.minArgs} arguments, received ${argCount}.`,
        );
        return getConstantNodeId(context, 0);
      }

      if (definition.maxArgs !== null && argCount > definition.maxArgs) {
        issues.push(
          `Function "${name}" expects at most ${definition.maxArgs} arguments, received ${argCount}.`,
        );
        return getConstantNodeId(context, 0);
      }

      if (name === "slew") {
        const maxRateArg = argNodes[1];
        if (!maxRateArg || maxRateArg.type !== "Literal") {
          issues.push(
            'Function "slew" requires a literal scalar for "max_rate".',
          );
        }
      }

      const availableAfterInputs = Math.max(
        0,
        argCount - definition.inputs.length,
      );
      const paramArgCount =
        definition.params.length > 0
          ? Math.min(definition.params.length, availableAfterInputs)
          : 0;
      const variadicArgCount = definition.variadic
        ? Math.max(0, availableAfterInputs - paramArgCount)
        : 0;
      const operandLimit = Math.min(
        argCount,
        definition.inputs.length + variadicArgCount,
      );
      const operandNodes = argNodes.slice(0, operandLimit);
      const operands = operandNodes.map((arg, _index) =>
        materializeExpression(arg, context, variables, issues),
      );

      const paramArgStart = operandLimit;
      const paramArgNodes =
        paramArgCount > 0
          ? argNodes.slice(paramArgStart, paramArgStart + paramArgCount)
          : [];
      const paramOverride =
        definition.nodeType === "case" ? undefined : paramArgNodes;

      return emitScalarFunctionNode(
        definition,
        operands,
        argNodes,
        argCount,
        context,
        variables,
        issues,
        paramOverride,
      );
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
  inputMetadata,
}: BuildGraphOptions): BuildGraphResult {
  const metadataByInputId =
    inputMetadata ?? new Map<string, InputExportMetadata>();
  const irBuilder = createIrGraphBuilder({
    faceId,
    registryVersion: nodeRegistryVersion,
    source: "graphBuilder",
    generatedAt: new Date().toISOString(),
  });

  const nodes: IrNode[] = [];
  const edges: IrEdge[] = [];
  const graphReservedNodes = new Map<string, string>();
  const reservedNodeCounters = new Map<string, number>();
  const generateReservedNodeId = (kind: string): string => {
    const nextValue = (reservedNodeCounters.get(kind) ?? 0) + 1;
    reservedNodeCounters.set(kind, nextValue);
    return `reserved_${kind}_${nextValue}`;
  };
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
          enforceRigBoundaryRules: false,
          context: {
            inputsById,
            inputBindings,
            nodes,
            edges,
            ensureInputNode,
            bindingIssues,
            summaryBindings,
            graphReservedNodes,
            generateReservedNodeId,
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
          enforceRigBoundaryRules: true,
          context: {
            inputsById,
            inputBindings,
            nodes,
            edges,
            ensureInputNode,
            bindingIssues,
            summaryBindings,
            graphReservedNodes,
            generateReservedNodeId,
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
        expression: PRIMARY_SLOT_ALIAS,
        valueType: target.valueType === "vector" ? "vector" : "scalar",
        issues: ["Binding not found."],
        nodeId: PRIMARY_SLOT_ID,
        expressionNodeId: PRIMARY_SLOT_ID,
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

    entry.values.set(key, valueNodeId);
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
        from: { nodeId: valueNodeId },
        to: { nodeId: outputNodeId, portId: "in" },
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
        from: { nodeId: sourceId },
        to: { nodeId: joinNodeId, portId: `operand_${index + 1}` },
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
      from: { nodeId: joinNodeId },
      to: { nodeId: outputNodeId, portId: "in" },
    });
  });

  const nodeById = new Map<string, IrNode>();
  nodes.forEach((node) => {
    nodeById.set(node.id, node);
  });

  const constantUsage = new Map<string, number>();
  edges.forEach((edge: GraphEdge) => {
    const source = nodeById.get(edge.from.nodeId);
    if (source?.type === "constant") {
      constantUsage.set(source.id, (constantUsage.get(source.id) ?? 0) + 1);
    }
  });

  const updatedEdges: IrEdge[] = [];
  const constantsToRemove = new Set<string>();

  edges.forEach((edge: GraphEdge) => {
    const source = nodeById.get(edge.from.nodeId);
    if (
      source?.type === "constant" &&
      constantUsage.get(source.id) === 1 &&
      source.params &&
      Object.prototype.hasOwnProperty.call(source.params, "value")
    ) {
      const target = nodeById.get(edge.to.nodeId);
      if (target) {
        const value = (source.params as { value?: unknown }).value;
        if (value !== undefined) {
          const targetPort = edge.to.portId ?? "in";
          target.inputDefaults = {
            ...(target.inputDefaults ?? {}),
            [targetPort]: value,
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

  const vizijMetadata = {
    vizij: {
      faceId,
      inputs: Array.from(inputsById.values()).map((input) => {
        const meta = metadataByInputId.get(input.id);
        const derivedRoot = meta?.root ?? input.group;
        let derivedSource = meta?.source;
        if (!derivedSource && input.path.startsWith("/standard/")) {
          derivedSource = "preset";
        }
        const entry: Record<string, unknown> = {
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
        };
        if (derivedSource) {
          entry.source = derivedSource;
        }
        if (derivedRoot) {
          entry.root = derivedRoot;
        }
        return entry;
      }),
      bindings: filteredSummaryBindings.map((binding) => ({
        ...binding,
        expression: binding.expression,
        valueType: binding.valueType,
        issues: binding.issues ? [...binding.issues] : undefined,
        metadata: binding.metadata
          ? cloneJsonLike(binding.metadata)
          : undefined,
      })),
    },
  };

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

  const summaryPayload = {
    faceId,
    inputs: Array.from(inputNodes.values()).map(({ input }) =>
      buildRigInputPath(faceId, input.path),
    ),
    outputs: [...dynamicOutputs, ...computedInputList],
    bindings: filteredSummaryBindings,
  };

  const irSummary: IrGraphSummary = {
    faceId: summaryPayload.faceId,
    inputs: [...summaryPayload.inputs],
    outputs: [...summaryPayload.outputs],
    bindings: toIrBindingSummary(
      filteredSummaryBindings.map((binding) => ({
        ...binding,
        issues: binding.issues ? [...binding.issues] : undefined,
      })),
    ),
  };

  const fatalIssueList = Array.from(fatalIssues);
  const irIssues = createIrIssuesFromLegacy(issuesByTarget, fatalIssueList);

  filteredNodes.forEach((node) => {
    irBuilder.addNode(cloneIrNode(node));
    const constant = extractIrConstantFromNode(node);
    if (constant) {
      irBuilder.addConstant(constant);
    }
  });
  updatedEdges.forEach((edge: GraphEdge) => {
    irBuilder.addEdge(cloneIrEdge(edge));
  });
  irBuilder.setSummary(irSummary);
  irIssues.forEach((issue) => irBuilder.addIssue(issue));
  irBuilder.updateMetadata({
    annotations: {
      graphSpecMetadata: cloneJsonLike(vizijMetadata),
    },
  });
  const irGraph = irBuilder.build();
  const compiled = compileIrGraph(irGraph, { preferLegacySpec: false });

  return {
    spec: compiled.spec,
    summary: summaryPayload,
    issues: {
      byTarget: issuesByTarget,
      fatal: fatalIssueList,
    },
    ir: {
      graph: irGraph,
      compile: (options?: IrCompileOptions) => compileIrGraph(irGraph, options),
    },
  };
}
function createIrIssuesFromLegacy(
  issuesByTarget: Record<string, string[]>,
  fatalIssues: string[],
): IrIssue[] {
  const fatalSet = new Set(fatalIssues);
  const collected: IrIssue[] = [];
  let counter = 0;

  Object.entries(issuesByTarget).forEach(([targetId, messages]) => {
    messages.forEach((message) => {
      counter += 1;
      collected.push({
        id: `issue_${counter}`,
        severity: fatalSet.has(message) ? "error" : "warning",
        message,
        targetId,
        tags: fatalSet.has(message) ? ["fatal"] : undefined,
      });
    });
  });

  fatalSet.forEach((message) => {
    const alreadyCaptured = collected.some(
      (issue) => issue.message === message,
    );
    if (alreadyCaptured) {
      return;
    }
    counter += 1;
    collected.push({
      id: `issue_${counter}`,
      severity: "error",
      message,
      tags: ["fatal"],
    });
  });

  return collected;
}

function cloneIrNode(node: IrNode): IrNode {
  return {
    id: node.id,
    type: node.type,
    category: node.category,
    label: node.label,
    description: node.description,
    params: cloneJsonLike(node.params),
    inputDefaults: cloneJsonLike(node.inputDefaults),
    metadata: cloneJsonLike(node.metadata),
  };
}

function cloneIrEdge(edge: IrEdge): IrEdge {
  return {
    id: edge.id,
    from: {
      nodeId: edge.from.nodeId,
      portId: edge.from.portId,
      component: edge.from.component,
    },
    to: {
      nodeId: edge.to.nodeId,
      portId: edge.to.portId,
      component: edge.to.component,
    },
    metadata: cloneJsonLike(edge.metadata),
  };
}

function extractIrConstantFromNode(node: IrNode): IrConstant | null {
  if (node.type !== "constant") {
    return null;
  }
  const value = (node.params as { value?: unknown } | undefined)?.value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return {
    id: node.id,
    value,
    valueType: "scalar",
    metadata: cloneJsonLike(node.metadata),
  };
}

function cloneJsonLike<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  return cloneDeepSafe(value);
}

function validateRemapDefaults(nodes: IrNode[]): string[] {
  const issues: string[] = [];
  nodes.forEach((node) => {
    if (node.type !== "centered_remap") {
      return;
    }
    const defaults = node.inputDefaults ?? {};
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
