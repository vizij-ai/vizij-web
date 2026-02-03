import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { requireNodeSignature } from "@vizij/node-graph-wasm/metadata";
import {
  SELF_BINDING_ID,
  type StandardRigInput,
  type RigBindingMetadata,
  type RigBindingOperandMetadata,
} from "@vizij/utils";
import type {
  AnimatableBinding,
  BindingValueType,
} from "@vizij/node-graph-authoring";
import {
  EXPRESSION_FUNCTION_VOCABULARY,
  RESERVED_EXPRESSION_VARIABLES,
  SCALAR_FUNCTIONS,
  parseControlExpression,
} from "@vizij/node-graph-authoring";
import type {
  ControlExpressionNode,
  ScalarFunctionDefinition,
} from "@vizij/node-graph-authoring";
import {
  Combobox,
  type ComboboxOption,
  Button,
  CollapsibleRow,
  Select,
  TextArea,
  Checkbox,
} from "../ui";
import { formatRigPathLabel } from "../../utils/rigPaths";
import { cn } from "../../utils/cn";
import { createSlotKey, getSlotIdentifier } from "./slotKeys";
import { useSlotDiagnosticsResolver } from "./SlotDiagnosticsContext";

type BindingFeatureFlags = {
  vectorAuthoringBeta?: boolean;
  conditionalAuthoringBeta?: boolean;
};

type CaseExpressionConfig = {
  selector: string;
  defaultBranch: string;
  branches: string[];
};

type NodeSignature = ReturnType<typeof requireNodeSignature>;

const FUNCTION_CATEGORY_LABELS: Record<string, string> = {
  math: "Math",
  logic: "Logic",
  time: "Time",
  utility: "Utility",
  vector: "Vector",
};

const FUNCTION_CATEGORY_ORDER = [
  "math",
  "logic",
  "time",
  "utility",
  "vector",
] as const;

type ExpressionFunctionEntry = (typeof EXPRESSION_FUNCTION_VOCABULARY)[number];

type FunctionParameterDetail = {
  id: string;
  label: string;
  doc?: string;
  optional: boolean;
  typeLabel: string;
  kind: "ordered" | "variadic" | "param";
  repeatRange?: {
    min: number;
    max: number | null;
  };
};

type ExpressionFunctionDetail = ExpressionFunctionEntry & {
  signature: NodeSignature | null;
  signatureDoc?: string;
  parameters: FunctionParameterDetail[];
  argumentRange: {
    min: number;
    max: number | null;
  };
  returnTypeLabel: string;
};

type CaseMetadata = NonNullable<
  NonNullable<RigBindingMetadata["expression"]>["case"]
>;

function formatPortTypeLabel(type?: string | null): string {
  if (!type) {
    return "Value";
  }
  const normalized = type.toLowerCase();
  switch (normalized) {
    case "float":
      return "Scalar";
    case "bool":
    case "boolean":
      return "Boolean";
    case "vec2":
    case "vec3":
    case "vec4":
      return normalized.toUpperCase();
    case "quat":
      return "Quaternion";
    case "transform":
      return "Transform";
    case "vector":
      return "Vector";
    case "any":
      return "Any";
    default:
      return normalized.replace(/^\w/, (char) => char.toUpperCase());
  }
}

function formatExpressionValueTypeLabel(valueType: string): string {
  switch (valueType) {
    case "vector":
      return "Vector";
    case "boolean":
      return "Boolean";
    case "any":
      return "Any";
    default:
      return "Scalar";
  }
}

function buildParameterDetails(
  signature: NodeSignature | null,
  definition?: ScalarFunctionDefinition | null,
): FunctionParameterDetail[] {
  if (!signature) {
    return [];
  }
  const ordered = signature.inputs.map(
    (input: NodeSignature["inputs"][number]) => ({
      id: input.id,
      label: input.label ?? input.id,
      doc: input.doc,
      optional: Boolean(input.optional),
      typeLabel: formatPortTypeLabel(input.ty),
      kind: "ordered" as const,
    }),
  );
  const variadic = signature.variadic_inputs
    ? [
        {
          id: signature.variadic_inputs.id,
          label:
            signature.variadic_inputs.label ?? signature.variadic_inputs.id,
          doc: signature.variadic_inputs.doc,
          optional: false,
          typeLabel: formatPortTypeLabel(signature.variadic_inputs.ty),
          kind: "variadic" as const,
          repeatRange: {
            min: signature.variadic_inputs.min ?? 0,
            max:
              typeof signature.variadic_inputs.max === "number"
                ? signature.variadic_inputs.max
                : null,
          },
        },
      ]
    : [];
  const params: FunctionParameterDetail[] =
    definition?.params?.map(
      (param: ScalarFunctionDefinition["params"][number]) => ({
        id: param.id,
        label: param.label,
        doc: param.doc,
        optional: param.optional,
        typeLabel: formatExpressionValueTypeLabel(param.valueType),
        kind: "param" as const,
      }),
    ) ?? [];
  return [...ordered, ...variadic, ...params];
}

function deriveArgumentRange(signature: NodeSignature | null): {
  min: number;
  max: number | null;
} {
  if (!signature) {
    return { min: 0, max: null };
  }
  const requiredOrdered = signature.inputs.filter(
    (input: NodeSignature["inputs"][number]) => !input.optional,
  ).length;
  const totalOrdered = signature.inputs.length;
  if (!signature.variadic_inputs) {
    return {
      min: requiredOrdered,
      max: totalOrdered,
    };
  }
  const variadicMin = signature.variadic_inputs.min ?? 0;
  const variadicMax =
    typeof signature.variadic_inputs.max === "number"
      ? signature.variadic_inputs.max
      : null;
  const min = requiredOrdered + variadicMin;
  const max = variadicMax === null ? null : totalOrdered + variadicMax;
  return { min, max };
}

function describeArgumentRange(range: { min: number; max: number | null }) {
  if (range.min === 0 && (range.max === 0 || range.max === null)) {
    return "No arguments";
  }
  if (range.max === null) {
    return `${range.min}+ argument${range.min === 1 ? "" : "s"}`;
  }
  if (range.min === range.max) {
    return `${range.min} argument${range.min === 1 ? "" : "s"}`;
  }
  return `${range.min}–${range.max} arguments`;
}

function describeVariadicRange(range?: { min: number; max: number | null }) {
  if (!range) {
    return "";
  }
  if (range.min === 0 && (range.max === null || range.max > 0)) {
    return "Accepts any number of values.";
  }
  if (range.max === null) {
    return `Provide at least ${range.min} value${range.min === 1 ? "" : "s"}.`;
  }
  if (range.min === range.max) {
    return `Provide exactly ${range.min} value${range.min === 1 ? "" : "s"}.`;
  }
  return `Provide between ${range.min} and ${range.max} values.`;
}

function buildFunctionDetail(
  entry: ExpressionFunctionEntry,
): ExpressionFunctionDetail {
  let signature: NodeSignature | null = null;
  try {
    signature = requireNodeSignature(entry.nodeType);
  } catch (error) {
    console.warn(
      `[BindingEditor] Unable to load signature for '${entry.name}':`,
      error,
    );
  }
  const definition =
    SCALAR_FUNCTIONS.get(entry.nodeType) ??
    SCALAR_FUNCTIONS.get(entry.name.toLowerCase()) ??
    null;
  const argumentRange = definition
    ? {
        min: definition.minArgs,
        max: definition.maxArgs ?? null,
      }
    : deriveArgumentRange(signature);
  return {
    ...entry,
    signature,
    signatureDoc: signature?.doc,
    parameters: buildParameterDetails(signature, definition),
    argumentRange,
    returnTypeLabel: formatPortTypeLabel(signature?.outputs?.[0]?.ty),
  };
}

function buildSignaturePreview(detail: ExpressionFunctionDetail): string {
  if (!detail.parameters.length) {
    return `${detail.name}()`;
  }
  const args = detail.parameters.map((param) => {
    if (param.kind === "variadic") {
      if (
        param.repeatRange?.max &&
        param.repeatRange.max === param.repeatRange.min
      ) {
        return `${param.id}×${param.repeatRange.min}`;
      }
      if (param.repeatRange?.min && param.repeatRange.min > 1) {
        return `${param.id}×${param.repeatRange.min}+`;
      }
      return `${param.id}…`;
    }
    return param.optional ? `${param.id}?` : param.id;
  });
  return `${detail.name}(${args.join(", ")})`;
}

function ensureDistinctDescriptions(values: Array<string | undefined>) {
  const seen = new Set<string>();
  return values
    .filter((value): value is string => Boolean(value && value.trim().length))
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
}

function stringifyExpressionNode(node: ControlExpressionNode): string {
  switch (node.type) {
    case "Literal":
      return Number.isFinite(node.value) ? `${node.value}` : "0";
    case "Reference":
      return node.name;
    case "Unary":
      return `${node.operator}${stringifyExpressionNode(node.operand)}`;
    case "Binary":
      return `${stringifyExpressionNode(node.left)} ${node.operator} ${stringifyExpressionNode(node.right)}`;
    case "Function":
      return `${node.name}(${node.args.map(stringifyExpressionNode).join(", ")})`;
    default:
      return "";
  }
}

function extractCaseExpressionConfig(
  expression: string,
): CaseExpressionConfig | null {
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = parseControlExpression(trimmed);
  if (!parsed.node || parsed.errors.length > 0) {
    return null;
  }
  const root = parsed.node;
  if (root.type !== "Function" || root.name?.toLowerCase() !== "case") {
    return null;
  }
  if (!Array.isArray(root.args) || root.args.length < 3) {
    return null;
  }
  const [selectorNode, defaultNode, ...branches] = root.args;
  const toToken = (node: ControlExpressionNode) => {
    if (node.type === "Reference") {
      return node.name;
    }
    return stringifyExpressionNode(node);
  };
  return {
    selector: toToken(selectorNode),
    defaultBranch: toToken(defaultNode),
    branches: branches.map(toToken).filter((token) => token.length > 0),
  };
}

interface BindingEditorProps {
  binding: AnimatableBinding;
  targetId: string;
  label: string;
  standardInputs: StandardRigInput[];
  standardInputLookup: Map<string, StandardRigInput>;
  faceId?: string | null;
  issues?: readonly string[];
  onBindingInputChange: (
    targetId: string,
    inputId: string | null,
    slotId?: string,
  ) => void;
  onAddBindingSlot: (targetId: string) => void;
  onRemoveBindingSlot: (targetId: string, slotId: string) => void;
  onBindingExpressionChange: (targetId: string, expression: string) => void;
  onBindingSlotAliasChange: (
    targetId: string,
    slotId: string,
    alias: string,
  ) => void;
  onBindingSlotValueTypeChange: (
    targetId: string,
    slotId: string,
    valueType: BindingValueType,
  ) => void;
  onNormalizeBindingSlot?: (targetId: string, slotId: string) => void;
  onRequestCreateStandardInput?: (
    suggestedPath?: string,
  ) => StandardRigInput | null;
  onResetBinding?: (targetId: string) => void;
  headerActions?: ReactNode;
  children?: ReactNode;
  expandable?: boolean;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  featureFlags: BindingFeatureFlags;
  currentValues?: Record<string, number>;
  onInputValueChange?: (inputId: string, value: number) => void;
  hiddenDriverIds?: ReadonlySet<string> | Set<string>;
  onHideDriver?: (inputId: string) => void;
  onShowDriver?: (inputId: string) => void;
}

export function BindingEditor({
  binding,
  targetId,
  label,
  standardInputs,
  standardInputLookup,
  faceId,
  issues,
  onBindingInputChange,
  onAddBindingSlot,
  onRemoveBindingSlot,
  onBindingExpressionChange,
  onBindingSlotAliasChange,
  onBindingSlotValueTypeChange,
  onNormalizeBindingSlot,
  onRequestCreateStandardInput: _onRequestCreateStandardInput,
  onResetBinding,
  headerActions,
  children,
  expandable = true,
  defaultExpanded = false,
  expanded,
  onExpandedChange,
  featureFlags,
  currentValues,
  onInputValueChange,
  hiddenDriverIds,
  onHideDriver,
  onShowDriver: _onShowDriver,
}: BindingEditorProps) {
  const vectorAuthoringEnabled = featureFlags.vectorAuthoringBeta !== false;
  const conditionalAuthoringEnabled =
    featureFlags.conditionalAuthoringBeta !== false;
  const isControlled = typeof expanded === "boolean";
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = isControlled ? (expanded as boolean) : internalExpanded;

  const slots = binding.slots ?? [];
  const resolveSlotDiagnostics = useSlotDiagnosticsResolver();

  const [expandedSlotDiagnostics, setExpandedSlotDiagnostics] = useState<
    Set<string>
  >(() => new Set());
  const expressionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [functionReferenceExpanded, setFunctionReferenceExpanded] =
    useState(false);
  const [caseBuilderExpanded, setCaseBuilderExpanded] = useState(false);
  useEffect(() => {
    const activeKeys = new Set(
      slots.map((slot, index) =>
        createSlotKey(targetId, getSlotIdentifier(slot, index)),
      ),
    );
    setExpandedSlotDiagnostics((previous) => {
      if (previous.size === 0) {
        return previous;
      }
      let changed = false;
      const next = new Set<string>();
      previous.forEach((key) => {
        if (activeKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [slots, targetId]);

  const toggleExpanded = useCallback(() => {
    if (!expandable) {
      return;
    }
    const next = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(next);
    }
    onExpandedChange?.(next);
  }, [expandable, isExpanded, isControlled, onExpandedChange]);

  const expressionValue = binding.expression ?? slots[0]?.alias ?? "";
  const [expressionDraft, setExpressionDraft] = useState(expressionValue);
  const [expressionDirty, setExpressionDirty] = useState(false);
  const [expressionFocused, setExpressionFocused] = useState(false);

  useEffect(() => {
    if (!expressionFocused) {
      setExpressionDraft(expressionValue);
      setExpressionDirty(false);
    }
  }, [expressionFocused, expressionValue]);

  const commitExpressionDraft = useCallback(() => {
    if (!expressionDirty) {
      return;
    }
    onBindingExpressionChange(targetId, expressionDraft);
    setExpressionDirty(false);
  }, [expressionDirty, expressionDraft, onBindingExpressionChange, targetId]);

  const handleExpressionDraftChange = useCallback((nextValue: string) => {
    setExpressionDraft(nextValue);
    setExpressionDirty(true);
  }, []);

  const aliasHints = useMemo(() => {
    return slots
      .map((slot) => {
        if (slot.inputId === SELF_BINDING_ID) {
          return `${slot.alias} → Slider`;
        }
        const inputMeta =
          slot.inputId !== null ? standardInputLookup.get(slot.inputId) : null;
        if (inputMeta) {
          return `${slot.alias} → ${inputMeta.path}`;
        }
        return slot.alias;
      })
      .filter(Boolean)
      .join(", ");
  }, [slots, standardInputLookup]);

  const reservedHints = useMemo(() => {
    const available = RESERVED_EXPRESSION_VARIABLES.filter(
      (variable) => variable.available !== false,
    )
      .map((variable) => variable.name)
      .join(", ");
    return available ? `Reserved: ${available}` : "";
  }, []);

  const reservedVariableNames = useMemo(
    () =>
      RESERVED_EXPRESSION_VARIABLES.filter(
        (variable) => variable.available !== false,
      ).map((variable) => variable.name),
    [],
  );

  const expressionFunctionGroups = useMemo(() => {
    const map = new Map<string, ExpressionFunctionEntry[]>();
    EXPRESSION_FUNCTION_VOCABULARY.forEach((entry) => {
      const current = map.get(entry.category) ?? [];
      current.push(entry);
      map.set(entry.category, current);
    });
    const baseOrder: string[] = Array.from(FUNCTION_CATEGORY_ORDER);
    const orderedCategories = [
      ...baseOrder,
      ...Array.from(map.keys()).filter(
        (category) => !baseOrder.includes(category),
      ),
    ];
    return orderedCategories
      .map((category) => ({
        category,
        entries: (map.get(category) ?? [])
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter(({ entries }) => entries.length > 0);
  }, []);

  const expressionFunctionDetails = useMemo<ExpressionFunctionDetail[]>(() => {
    return EXPRESSION_FUNCTION_VOCABULARY.map((entry) =>
      buildFunctionDetail(entry),
    );
  }, []);

  const functionDetailLookup = useMemo(() => {
    const lookup = new Map<string, ExpressionFunctionDetail>();
    expressionFunctionDetails.forEach((detail) => {
      lookup.set(detail.nodeType, detail);
    });
    return lookup;
  }, [expressionFunctionDetails]);

  const [selectedFunctionId, setSelectedFunctionId] = useState<string | null>(
    () => expressionFunctionDetails[0]?.nodeType ?? null,
  );

  useEffect(() => {
    if (!expressionFunctionDetails.length) {
      return;
    }
    if (selectedFunctionId && functionDetailLookup.has(selectedFunctionId)) {
      return;
    }
    setSelectedFunctionId(expressionFunctionDetails[0].nodeType);
  }, [expressionFunctionDetails, functionDetailLookup, selectedFunctionId]);

  const selectedFunctionDetail =
    (selectedFunctionId
      ? functionDetailLookup.get(selectedFunctionId)
      : null) ??
    expressionFunctionDetails[0] ??
    null;

  const functionSelectOptions = useMemo<ComboboxOption[]>(() => {
    return expressionFunctionGroups.flatMap(({ category, entries }) => {
      const categoryLabel = FUNCTION_CATEGORY_LABELS[category] ?? category;
      return entries.map((entry) => {
        const detail = functionDetailLookup.get(entry.nodeType);
        const descriptionSources = ensureDistinctDescriptions([
          detail?.signatureDoc,
          entry.description,
        ]);
        const parameterKeywords =
          detail?.parameters.flatMap((param) => [param.label, param.id]) ?? [];
        return {
          value: entry.nodeType,
          label: `${entry.name}()`,
          description: categoryLabel,
        };
      });
    });
  }, [expressionFunctionGroups, functionDetailLookup]);

  const selectedFunctionCategoryLabel = selectedFunctionDetail
    ? (FUNCTION_CATEGORY_LABELS[selectedFunctionDetail.category] ??
      selectedFunctionDetail.category)
    : null;

  const functionSelectCurrentLabel = selectedFunctionDetail ? (
    <div className="flex items-center gap-2">
      <span className="font-bold text-text-primary">
        {selectedFunctionDetail.name}()
      </span>
      {selectedFunctionCategoryLabel && (
        <span className="px-1.5 py-0.5 rounded-full bg-accent-subtle border border-accent/20 text-[9px] font-black uppercase tracking-widest text-accent">
          {selectedFunctionCategoryLabel}
        </span>
      )}
    </div>
  ) : undefined;

  const functionSignaturePreview = selectedFunctionDetail
    ? buildSignaturePreview(selectedFunctionDetail)
    : null;

  const selectedFunctionDescriptions = selectedFunctionDetail
    ? ensureDistinctDescriptions([
        selectedFunctionDetail.signatureDoc,
        selectedFunctionDetail.description,
      ])
    : [];

  const selectedFunctionArgumentSummary = selectedFunctionDetail
    ? describeArgumentRange(selectedFunctionDetail.argumentRange)
    : null;

  const selectedFunctionReturnType =
    selectedFunctionDetail?.returnTypeLabel ?? "Value";

  const selectedFunctionParameters = selectedFunctionDetail?.parameters ?? [];

  const selectedFunctionAliases = selectedFunctionDetail
    ? Array.from(new Set(selectedFunctionDetail.aliases))
    : [];

  const selectedFunctionHasParameters = selectedFunctionParameters.length > 0;

  const selectedFunctionParameterSummary = selectedFunctionHasParameters
    ? `${selectedFunctionParameters.length} parameter${selectedFunctionParameters.length === 1 ? "" : "s"}`
    : "No parameters";

  const slotAliasOptions = useMemo(
    () =>
      slots
        .map((slot) => {
          const trimmedAlias = slot.alias?.trim();
          if (trimmedAlias && trimmedAlias.length > 0) {
            return trimmedAlias;
          }
          return slot.id?.trim() ?? null;
        })
        .filter((alias): alias is string => Boolean(alias)),
    [slots],
  );

  const slotAliasOrder = useMemo(() => {
    const order = new Map<string, number>();
    slotAliasOptions.forEach((alias, index) => order.set(alias, index));
    return order;
  }, [slotAliasOptions]);

  const parsedCaseConfig = useMemo(
    () => extractCaseExpressionConfig(expressionValue),
    [expressionValue],
  );

  const [caseSelector, setCaseSelector] = useState<string>(
    parsedCaseConfig?.selector ??
      slotAliasOptions[0] ??
      reservedVariableNames[0] ??
      "self",
  );
  const [caseDefault, setCaseDefault] = useState<string>(
    parsedCaseConfig?.defaultBranch ?? "self",
  );
  const [caseBranches, setCaseBranches] = useState<string[]>(
    parsedCaseConfig?.branches?.filter((alias) => slotAliasOrder.has(alias)) ??
      slotAliasOptions.slice(0),
  );

  useEffect(() => {
    if (!conditionalAuthoringEnabled) {
      return;
    }
    if (parsedCaseConfig) {
      setCaseSelector(parsedCaseConfig.selector);
      setCaseDefault(parsedCaseConfig.defaultBranch);
      const normalized = parsedCaseConfig.branches.filter((alias) =>
        slotAliasOrder.has(alias),
      );
      setCaseBranches(
        normalized.length > 0 ? normalized : slotAliasOptions.slice(0),
      );
      return;
    }
    setCaseSelector(
      (current) =>
        current || slotAliasOptions[0] || reservedVariableNames[0] || "self",
    );
    setCaseDefault((current) => current || "self");
    setCaseBranches((current) =>
      current.length > 0 ? current : slotAliasOptions.slice(0),
    );
  }, [
    conditionalAuthoringEnabled,
    parsedCaseConfig,
    reservedVariableNames,
    slotAliasOptions,
    slotAliasOrder,
  ]);

  const handleCaseBranchToggle = useCallback(
    (alias: string, enabled: boolean) => {
      setCaseBranches((previous) => {
        if (enabled) {
          if (previous.includes(alias)) {
            return previous;
          }
          const next = [...previous, alias];
          next.sort(
            (a, b) =>
              (slotAliasOrder.get(a) ?? 0) - (slotAliasOrder.get(b) ?? 0),
          );
          return next;
        }
        if (!previous.includes(alias)) {
          return previous;
        }
        return previous.filter((entry) => entry !== alias);
      });
    },
    [slotAliasOrder],
  );

  const handleApplyCaseExpression = useCallback(() => {
    if (!conditionalAuthoringEnabled) {
      return;
    }
    const filteredBranches = caseBranches.filter((alias) =>
      slotAliasOrder.has(alias),
    );
    if (filteredBranches.length === 0) {
      return;
    }
    const selectorToken =
      caseSelector && caseSelector.length > 0
        ? caseSelector
        : (slotAliasOptions[0] ?? filteredBranches[0]);
    const defaultToken =
      caseDefault && caseDefault.length > 0 ? caseDefault : "self";
    const tokens = [selectorToken, defaultToken, ...filteredBranches];
    const expressionText = `case(${tokens.join(", ")})`;
    setExpressionDraft(expressionText);
    setExpressionDirty(false);
    onBindingExpressionChange(targetId, expressionText);
  }, [
    caseBranches,
    caseDefault,
    caseSelector,
    conditionalAuthoringEnabled,
    onBindingExpressionChange,
    setExpressionDraft,
    setExpressionDirty,
    slotAliasOptions,
    slotAliasOrder,
    targetId,
  ]);

  // const insertExpressionToken = useCallback(
  //   (token: string) => {
  //     const trimmedToken = token.trim();
  //     if (trimmedToken.length === 0) {
  //       return;
  //     }
  //     const input = expressionInputRef.current;
  //     const currentValue = expressionDraft;
  //     const needsSpace = (value: string) =>
  //       value.length > 0 && !/\s$/.test(value);
  //     if (!input) {
  //       const nextValue =
  //         currentValue.trim().length > 0
  //           ? `${currentValue}${needsSpace(currentValue) ? " " : ""}${trimmedToken}`
  //           : trimmedToken;
  //       handleExpressionDraftChange(nextValue);
  //       return;
  //     }
  //     const start = input.selectionStart ?? currentValue.length;
  //     const end = input.selectionEnd ?? start;
  //     const prefix = currentValue.slice(0, start);
  //     const suffix = currentValue.slice(end);
  //     const insertion = `${needsSpace(prefix) ? " " : ""}${trimmedToken}`;
  //     const nextValue = `${prefix}${insertion}${suffix}`;
  //     handleExpressionDraftChange(nextValue);
  //     requestAnimationFrame(() => {
  //       if (expressionInputRef.current) {
  //         const cursor = start + insertion.length;
  //         expressionInputRef.current.focus();
  //         expressionInputRef.current.setSelectionRange(cursor, cursor);
  //       }
  //     });
  //   },
  //   [expressionDraft, handleExpressionDraftChange],
  // );

  const issueList = useMemo(
    () => (issues ? [...new Set(issues)] : []),
    [issues],
  );

  const caseMetadata = useMemo(() => {
    if (!resolveSlotDiagnostics || slots.length === 0) {
      return null;
    }
    const slotId = getSlotIdentifier(slots[0], 0);
    return (
      resolveSlotDiagnostics(targetId, slotId)?.metadata?.expression?.case ??
      null
    );
  }, [resolveSlotDiagnostics, slots, targetId]);

  const header = (
    <div className="flex items-center gap-3 py-2 px-1 border-b border-white/5 mb-4 group">
      {expandable && (
        <button
          type="button"
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded hover:bg-white/5 transition-transform duration-200",
            isExpanded ? "rotate-90" : "rotate-0",
          )}
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${label}`}
        >
          <svg
            className="w-3 h-3 text-text-muted group-hover:text-text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
      <span className="text-[11px] font-black uppercase tracking-widest text-text-secondary">
        {label} Drivers Config
      </span>
      <div className="flex-1" />
      {headerActions}
      {onResetBinding && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 text-[10px] px-2.5 font-bold"
          onClick={() => onResetBinding(targetId)}
        >
          Reset
        </Button>
      )}
    </div>
  );

  const handleAddSlot = useCallback(() => {
    onAddBindingSlot(targetId);
  }, [onAddBindingSlot, targetId]);

  const handleSlotDiagnosticsToggle = useCallback((slotKey: string) => {
    setExpandedSlotDiagnostics((previous) => {
      const next = new Set(previous);
      if (next.has(slotKey)) {
        next.delete(slotKey);
      } else {
        next.add(slotKey);
      }
      return next;
    });
  }, []);

  if (expandable && !isExpanded) {
    return (
      <div className="w-full">
        {header}
        {issueList.length > 0 && (
          <ul className="mt-2 space-y-1">
            {issueList.map((issue) => (
              <li
                key={issue}
                className="text-[11px] text-red-400 flex gap-2 italic"
              >
                <span className="shrink-0">•</span> {issue}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="w-full bg-bg-panel/40 border border-border-default/50 rounded-xl p-4">
      {header}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          {slots.map((slot, index) => {
            const rawSlotInputId = slot.inputId ?? "";
            const normalizedSlotInputId =
              rawSlotInputId === "" ? null : rawSlotInputId;
            const slotInputId =
              normalizedSlotInputId && normalizedSlotInputId !== SELF_BINDING_ID
                ? normalizedSlotInputId
                : null;
            const slotIdentifier = getSlotIdentifier(slot, index);
            const slotKey = createSlotKey(targetId, slotIdentifier);
            const slotDiagnostics = resolveSlotDiagnostics?.(
              targetId,
              slotIdentifier,
            );
            const upstreamNodes = slotDiagnostics?.upstreamNodes ?? [];
            const diagnosticsExpanded = expandedSlotDiagnostics.has(slotKey);

            let selectedInput =
              normalizedSlotInputId && normalizedSlotInputId !== SELF_BINDING_ID
                ? standardInputLookup.get(normalizedSlotInputId)
                : null;

            if (
              !selectedInput &&
              normalizedSlotInputId &&
              normalizedSlotInputId !== SELF_BINDING_ID
            ) {
              selectedInput = standardInputs.find((input) => {
                const sanitized = input.id
                  .replace(/^\//, "")
                  .replace(/\//g, "_");
                return sanitized === normalizedSlotInputId;
              });
            }

            const formattedSelectedInputLabel =
              selectedInput?.path &&
              formatRigPathLabel(selectedInput.path, faceId);

            const resolvedInputId = selectedInput?.id ?? slotInputId;

            const currentLabel =
              normalizedSlotInputId === null
                ? "Unbound"
                : normalizedSlotInputId === SELF_BINDING_ID
                  ? "Slider (self)"
                  : (formattedSelectedInputLabel ??
                    selectedInput?.label ??
                    normalizedSlotInputId);

            const baseOptions: ComboboxOption[] = [
              {
                value: SELF_BINDING_ID,
                label: "Slider (self)",
                description: "Manual control",
              },
              ...standardInputs.map((input) => ({
                value: input.id,
                label: formatRigPathLabel(input.path, faceId),
                description: input.path,
              })),
            ];

            const selectOptions =
              normalizedSlotInputId &&
              !baseOptions.some(
                (option) => option.value === normalizedSlotInputId,
              )
                ? [
                    ...baseOptions,
                    {
                      value: normalizedSlotInputId,
                      label: currentLabel,
                      description: "Current value",
                    },
                  ]
                : baseOptions;

            const slotValueType = slot.valueType ?? "scalar";

            if (resolvedInputId && hiddenDriverIds?.has(resolvedInputId)) {
              return null;
            }

            return (
              <div
                key={slot.id}
                className="bg-bg-input/40 border border-border-default/50 rounded-lg p-5 flex flex-col gap-6 group/slot hover:border-border-default transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                      Expression variable
                    </span>
                    <code className="text-[12px] bg-bg-input px-2 py-0.5 rounded border border-border-default text-accent font-mono font-bold">
                      {slotIdentifier}
                    </code>
                  </div>
                  <label className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                      Alias
                    </span>
                    <input
                      className="bg-bg-input border border-border-default/50 rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent/50 transition-colors placeholder:text-text-muted"
                      value={slot.alias}
                      placeholder={slot.id}
                      onChange={(event) =>
                        onBindingSlotAliasChange(
                          targetId,
                          slot.id,
                          event.target.value,
                        )
                      }
                      aria-label={`Alias for ${label} slot ${index + 1}`}
                      spellCheck={false}
                    />
                  </label>

                  {index > 0 && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      className="h-8 text-[10px] font-bold px-3 mt-4"
                      onClick={() => onRemoveBindingSlot(targetId, slot.id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                {vectorAuthoringEnabled && (
                  <div
                    className="flex flex-col gap-2"
                    role="group"
                    aria-label={`Value type for ${label} slot ${index + 1}`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                      Value type
                    </span>
                    <div className="flex bg-bg-input border border-border-default/50 rounded-lg p-1 self-start">
                      <button
                        type="button"
                        className={cn(
                          "px-4 py-1.5 text-[10px] font-bold rounded-md transition-all duration-200",
                          slotValueType === "scalar"
                            ? "bg-bg-secondary text-text-primary shadow-sm"
                            : "text-text-muted hover:text-text-primary",
                        )}
                        onClick={() => {
                          if (slotValueType !== "scalar") {
                            onBindingSlotValueTypeChange(
                              targetId,
                              slot.id,
                              "scalar",
                            );
                          }
                        }}
                      >
                        Scalar
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "px-4 py-1.5 text-[10px] font-bold rounded-md transition-all duration-200",
                          slotValueType === "vector"
                            ? "bg-bg-secondary text-text-primary shadow-sm"
                            : "text-text-muted hover:text-text-primary",
                        )}
                        onClick={() => {
                          if (slotValueType !== "vector") {
                            onBindingSlotValueTypeChange(
                              targetId,
                              slot.id,
                              "vector",
                            );
                          }
                        }}
                      >
                        Vector
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Driver Binding:
                  </span>
                  <div className="flex items-center gap-2">
                    <Combobox
                      value={normalizedSlotInputId ?? ""}
                      onChange={(nextValue) =>
                        onBindingInputChange(
                          targetId,
                          nextValue || null,
                          slot.id,
                        )
                      }
                      options={selectOptions}
                      placeholder="Select binding input"
                      className="flex-1 min-w-0"
                      size="sm"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 px-3 text-[10px] font-bold"
                      onClick={() =>
                        onBindingInputChange(targetId, null, slot.id)
                      }
                      disabled={!normalizedSlotInputId}
                    >
                      Unbind
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 px-3 text-[10px] font-bold"
                      onClick={() =>
                        onNormalizeBindingSlot?.(targetId, slot.id)
                      }
                      disabled={
                        !onNormalizeBindingSlot ||
                        !normalizedSlotInputId ||
                        normalizedSlotInputId === SELF_BINDING_ID
                      }
                    >
                      Normalize
                    </Button>
                  </div>
                  {selectedInput &&
                    (() => {
                      const input = selectedInput as NonNullable<
                        typeof selectedInput
                      >;
                      const driverMin = input.range?.min ?? -1;
                      const driverMax = input.range?.max ?? 1;
                      const driverDefault = input.defaultValue ?? 0;
                      const sliderValue =
                        currentValues?.[input.id] ?? driverDefault;
                      const sliderEnabled =
                        Boolean(onInputValueChange) &&
                        currentValues !== undefined;

                      const actions =
                        resolvedInputId && onHideDriver ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onHideDriver!(resolvedInputId!)}
                          >
                            Hide driver
                          </Button>
                        ) : undefined;

                      return (
                        <div className="w-full mt-4 p-4 bg-bg-input rounded-xl border border-border-default/50">
                          <CollapsibleRow
                            id={`${targetId}-${slot.id}-driver`}
                            title={input.label ?? resolvedInputId ?? "Driver"}
                            subtitle={input.path}
                            value={sliderEnabled ? sliderValue : undefined}
                            min={driverMin}
                            max={driverMax}
                            step={0.01}
                            onValueChange={
                              sliderEnabled && onInputValueChange
                                ? (val) => onInputValueChange(input.id, val)
                                : undefined
                            }
                            showSlider={sliderEnabled}
                            actions={actions}
                            className="bg-transparent border-none p-0"
                            expandedContent={
                              <div className="flex gap-4 p-3 bg-bg-secondary/60 rounded border border-border-default/50 text-[11px] text-text-muted font-medium">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-bg-secondary"></span>{" "}
                                  Min:{" "}
                                  <span className="text-text-primary font-bold">
                                    {driverMin}
                                  </span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-bg-secondary"></span>{" "}
                                  Default:{" "}
                                  <span className="text-text-primary font-bold">
                                    {driverDefault}
                                  </span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-bg-secondary"></span>{" "}
                                  Max:{" "}
                                  <span className="text-text-primary font-bold">
                                    {driverMax}
                                  </span>
                                </span>
                              </div>
                            }
                            defaultExpanded={false}
                          />
                        </div>
                      );
                    })()}
                </div>
                {upstreamNodes.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border-default/50">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSlotDiagnosticsToggle(slotKey)}
                      className="h-8 text-[11px] font-bold text-text-muted hover:text-text-primary"
                    >
                      {diagnosticsExpanded
                        ? "Hide upstream nodes"
                        : "Show upstream nodes"}
                    </Button>
                    {diagnosticsExpanded && (
                      <ul className="mt-4 space-y-2">
                        {upstreamNodes.map((node) => (
                          <li
                            key={`${slotKey}-${node.id}`}
                            className="flex flex-col gap-1 p-3 bg-bg-input rounded-lg border border-border-default/50"
                          >
                            <span className="text-[11px] font-bold text-text-primary">
                              {node.label}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-accent">
                                {node.type}
                              </span>
                              {node.category && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-muted font-bold uppercase tracking-wider">
                                  {node.category}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="feature-tree__slot-add"
            onClick={handleAddSlot}
          >
            Add control
          </Button>
        </div>
        <div className="flex flex-col gap-4">
          <label
            htmlFor={`binding-expression-${targetId}`}
            className="text-[10px] font-black uppercase tracking-widest text-text-muted"
          >
            Expression: {label} =
          </label>
          <TextArea
            id={`binding-expression-${targetId}`}
            ref={expressionInputRef}
            value={expressionDraft}
            className={cn(
              "w-full h-24", // TextArea has default styles, just overriding size/specifics if needed.
              issueList.length > 0 && "border-red-500/50 bg-red-500/5",
            )}
            onChange={(event) =>
              handleExpressionDraftChange(event.target.value)
            }
            onFocus={() => setExpressionFocused(true)}
            onBlur={() => {
              setExpressionFocused(false);
              commitExpressionDraft();
            }}
            aria-invalid={issueList.length > 0}
            spellCheck={false}
          />
          {(aliasHints || reservedHints) && (
            <div className="flex flex-col gap-1.5 px-1">
              {aliasHints && (
                <p className="text-[10px] text-text-muted font-medium">
                  <span className="text-text-secondary font-bold">
                    Aliases:
                  </span>{" "}
                  {aliasHints}
                </p>
              )}
              {reservedHints && (
                <p className="text-[10px] text-text-muted font-medium">
                  <span className="text-text-secondary font-bold">
                    Reserved:
                  </span>{" "}
                  {reservedHints}
                </p>
              )}
            </div>
          )}
          {issueList.length > 0 && (
            <ul className="mt-2 space-y-1.5 p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
              {issueList.map((issue) => (
                <li
                  key={issue}
                  className="text-[10px] text-red-400 flex gap-2 font-medium"
                >
                  <span className="shrink-0">•</span> {issue}
                </li>
              ))}
            </ul>
          )}
          {caseMetadata && <CaseMetadataSummary metadata={caseMetadata} />}
          {expressionFunctionGroups.length > 0 && (
            <div className="mt-4 border-t border-white/5 pt-6">
              <button
                type="button"
                className="w-full flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors group"
                onClick={() =>
                  setFunctionReferenceExpanded((previous) => !previous)
                }
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded flex items-center justify-center bg-accent/10 text-accent">
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2v20M2 12h20" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-bold text-text-primary">
                    Function Reference
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-text-muted font-bold group-hover:text-text-secondary">
                    {EXPRESSION_FUNCTION_VOCABULARY.length} available
                  </span>
                  <svg
                    className={cn(
                      "w-3 h-3 text-text-muted group-hover:text-text-primary transition-transform",
                      functionReferenceExpanded && "rotate-180",
                    )}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>
              {functionReferenceExpanded && (
                <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <Combobox
                    value={selectedFunctionId ?? ""}
                    options={functionSelectOptions}
                    onChange={(val) => val && setSelectedFunctionId(val)}
                    placeholder="Search functions..."
                    className="w-full"
                  />
                  {selectedFunctionDetail ? (
                    <div className="bg-bg-input rounded-xl border border-border-default/50 p-6 space-y-6">
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                              Function
                            </span>
                            <div className="flex items-center gap-2.5">
                              <h4 className="text-lg font-black text-text-primary italic tracking-tight">
                                {selectedFunctionDetail.name}()
                              </h4>
                              {selectedFunctionCategoryLabel && (
                                <span className="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[9px] font-black uppercase tracking-widest text-accent">
                                  {selectedFunctionCategoryLabel}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-4">
                            {selectedFunctionArgumentSummary && (
                              <div className="space-y-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-text-muted block">
                                  Arguments
                                </span>
                                <span className="text-[11px] font-bold text-text-secondary">
                                  {selectedFunctionArgumentSummary}
                                </span>
                              </div>
                            )}
                            <div className="space-y-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-text-muted block">
                                Returns
                              </span>
                              <span className="text-[11px] font-bold text-text-secondary italic">
                                {selectedFunctionReturnType}
                              </span>
                            </div>
                          </div>
                        </div>
                        {functionSignaturePreview && (
                          <div className="p-3 bg-bg-secondary/60 rounded-lg border border-border-default/50">
                            <code className="text-[11px] text-accent font-mono font-bold">
                              {functionSignaturePreview}
                            </code>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        {selectedFunctionDescriptions.length > 0 ? (
                          selectedFunctionDescriptions.map((paragraph) => (
                            <p
                              key={paragraph}
                              className="text-xs text-text-muted leading-relaxed font-medium"
                            >
                              {paragraph}
                            </p>
                          ))
                        ) : (
                          <p className="text-xs text-text-muted italic">
                            This function does not include documentation yet.
                          </p>
                        )}
                      </div>

                      {selectedFunctionAliases.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                            Aliases
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {selectedFunctionAliases.map((alias) => (
                              <span
                                key={alias}
                                className="px-2 py-0.5 rounded bg-bg-secondary text-text-muted text-[10px] font-bold border border-border-default/50"
                              >
                                {alias}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                            Parameters
                          </span>
                          <span className="text-[10px] font-bold text-text-muted">
                            {selectedFunctionParameterSummary}
                          </span>
                        </div>
                        {selectedFunctionHasParameters ? (
                          <ul className="space-y-4">
                            {selectedFunctionParameters.map((param) => {
                              const variadicNote =
                                param.kind === "variadic"
                                  ? describeVariadicRange(param.repeatRange)
                                  : "";
                              return (
                                <li
                                  key={param.id}
                                  className="space-y-2 group/param"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex flex-col">
                                      <span className="text-xs font-bold text-text-primary">
                                        {param.label}
                                      </span>
                                      <span className="text-[10px] font-mono text-text-muted group-hover/param:text-accent/50 transition-colors">
                                        {param.id}
                                        {param.kind === "variadic" ? "…" : ""}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 justify-end">
                                      <span className="px-1.5 py-0.5 rounded bg-bg-panel border border-border-default/50 text-[9px] font-black text-text-muted uppercase">
                                        {param.typeLabel}
                                      </span>
                                      {param.kind === "variadic" && (
                                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] font-black text-amber-500 uppercase">
                                          Variadic
                                        </span>
                                      )}
                                      {param.kind === "param" && (
                                        <span className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[9px] font-black text-purple-500 uppercase">
                                          Config
                                        </span>
                                      )}
                                      {param.optional && (
                                        <span className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border-default/50 text-[9px] font-black text-text-muted uppercase">
                                          Optional
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-[11px] text-text-muted leading-relaxed font-medium bg-bg-panel/50 p-2.5 rounded-lg border border-transparent group-hover/param:border-border-default/50 transition-all">
                                    {param.doc ??
                                      `Provide a ${param.typeLabel.toLowerCase()} value.`}
                                    {variadicNote && (
                                      <span className="block mt-1.5 text-accent font-bold text-[10px]">
                                        {variadicNote}
                                      </span>
                                    )}
                                  </p>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-text-muted italic">
                            This function does not take any inputs.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-bg-input rounded-xl border border-border-default/50 p-8 text-center">
                      <p className="text-xs text-text-muted italic">
                        Select a function to see its description and inputs.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {conditionalAuthoringEnabled && slotAliasOptions.length > 0 && (
            <div className="mt-4 border-t border-white/5 pt-6">
              <button
                type="button"
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border-default/50 bg-bg-panel/50 hover:bg-bg-panel transition-colors group"
                onClick={() => setCaseBuilderExpanded((previous) => !previous)}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded flex items-center justify-center bg-purple-500/10 text-purple-400">
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-bold text-text-primary">
                    Case Expression Builder
                  </span>
                </div>
                <svg
                  className={cn(
                    "w-3 h-3 text-text-muted group-hover:text-text-secondary transition-transform",
                    caseBuilderExpanded && "rotate-180",
                  )}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {caseBuilderExpanded && (
                <div className="mt-4 bg-bg-input rounded-xl border border-border-default/50 p-6 animate-in fade-in slide-in-from-top-2 duration-200 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">
                        Selector
                      </span>
                      <Select
                        size="sm"
                        value={caseSelector}
                        options={[...slotAliasOptions, ...reservedVariableNames]
                          .filter(
                            (token, index, array) =>
                              token && array.indexOf(token) === index,
                          )
                          .map((token) => ({
                            value: token,
                            label: token,
                          }))}
                        onChange={setCaseSelector}
                      />
                    </div>
                    <div className="space-y-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">
                        Default Value
                      </span>
                      <Select
                        size="sm"
                        value={caseDefault}
                        options={[
                          "self",
                          ...slotAliasOptions,
                          ...reservedVariableNames,
                        ]
                          .filter(
                            (token, index, array) =>
                              token && array.indexOf(token) === index,
                          )
                          .map((token) => ({
                            value: token,
                            label: token,
                          }))}
                        onChange={setCaseDefault}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                      Branches
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {slotAliasOptions.map((alias) => {
                        const checked = caseBranches.includes(alias);
                        return (
                          <div
                            key={alias}
                            className={cn(
                              "flex items-center gap-2.5 p-2 rounded border transition-all cursor-pointer",
                              checked
                                ? "bg-accent/10 border-accent/20 text-accent"
                                : "bg-bg-secondary border-border-default/50 text-text-muted hover:border-border-default",
                            )}
                            onClick={() =>
                              handleCaseBranchToggle(alias, !checked)
                            }
                          >
                            <Checkbox
                              checked={checked}
                              onChange={(val) =>
                                handleCaseBranchToggle(alias, val)
                              }
                            />
                            <span className="text-[11px] font-bold">
                              {alias}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="w-full h-9 font-bold text-[11px]"
                    onClick={handleApplyCaseExpression}
                    disabled={caseBranches.length === 0}
                  >
                    Apply case expression
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function formatOperandMetadata(operand?: RigBindingOperandMetadata): string {
  if (!operand) {
    return "—";
  }
  switch (operand.kind) {
    case "slot":
      return operand.alias ?? operand.slotId ?? operand.ref ?? "slot";
    case "reserved":
      return operand.ref ?? operand.alias ?? operand.kind;
    case "literal":
      return operand.literalValue !== undefined
        ? String(operand.literalValue)
        : "literal";
    case "expression":
      return operand.expression ?? "expression";
    default:
      return operand.kind ?? "operand";
  }
}

interface CaseMetadataSummaryProps {
  metadata: CaseMetadata;
}

function CaseMetadataSummary({ metadata }: CaseMetadataSummaryProps) {
  return (
    <div className="bg-bg-secondary/60 rounded-xl border border-border-default/50 p-4 space-y-4">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted">
        CASE metadata
      </h4>
      <dl className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <dt className="text-[9px] font-black uppercase tracking-widest text-text-muted">
            Selector
          </dt>
          <dd className="text-[11px] font-bold text-accent font-mono">
            {formatOperandMetadata(metadata.selector)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-[9px] font-black uppercase tracking-widest text-text-muted">
            Default
          </dt>
          <dd className="text-[11px] font-bold text-text-primary font-mono">
            {formatOperandMetadata(metadata.defaultBranch)}
          </dd>
        </div>
      </dl>
      {metadata.branches.length > 0 && (
        <div className="space-y-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">
            Branches
          </span>
          <ul className="space-y-1.5">
            {metadata.branches.map((branch, index) => (
              <li
                key={index}
                className="flex items-center gap-3 p-2 bg-bg-input rounded border border-border-default/50 text-[10px]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                <span className="font-mono text-text-primary">
                  {formatOperandMetadata(branch)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
