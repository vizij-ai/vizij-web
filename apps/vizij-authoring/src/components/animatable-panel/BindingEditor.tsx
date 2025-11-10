import { useMemo, useState, useCallback, useEffect, useRef } from "react";
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
  parseControlExpression,
} from "@vizij/node-graph-authoring";
import type { ControlExpressionNode } from "@vizij/node-graph-authoring";
import {
  FilterableSelect,
  type FilterableSelectOption,
} from "../common/FilterableSelect";
import type { BindingField } from "./types";
import { createSlotKey } from "./slotKeys";
import { useSlotDiagnosticsResolver } from "./SlotDiagnosticsContext";
import { formatRigPathLabel } from "../../utils/rigPaths";

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
  kind: "ordered" | "variadic";
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

function buildParameterDetails(
  signature: NodeSignature | null,
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
  return [...ordered, ...variadic];
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
  return {
    ...entry,
    signature,
    signatureDoc: signature?.doc,
    parameters: buildParameterDetails(signature),
    argumentRange: deriveArgumentRange(signature),
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
  onBindingRemapChange: (
    targetId: string,
    field: BindingField,
    value: number,
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
  onRequestCreateStandardInput?: (
    suggestedPath?: string,
  ) => StandardRigInput | null;
  onResetBinding?: (targetId: string) => void;
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
  expandable?: boolean;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  featureFlags: BindingFeatureFlags;
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
  onBindingRemapChange: _onBindingRemapChange,
  onAddBindingSlot,
  onRemoveBindingSlot,
  onBindingExpressionChange,
  onBindingSlotAliasChange,
  onBindingSlotValueTypeChange,
  onRequestCreateStandardInput: _onRequestCreateStandardInput,
  onResetBinding,
  headerActions,
  children,
  expandable = true,
  defaultExpanded = false,
  expanded,
  onExpandedChange,
  featureFlags,
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

  const functionSelectOptions = useMemo<FilterableSelectOption[]>(() => {
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
          label: `${entry.name}() · ${categoryLabel}`,
          keywords: [
            entry.name,
            categoryLabel,
            ...entry.aliases,
            ...parameterKeywords,
            ...descriptionSources,
          ],
        };
      });
    });
  }, [expressionFunctionGroups, functionDetailLookup]);

  const selectedFunctionCategoryLabel = selectedFunctionDetail
    ? (FUNCTION_CATEGORY_LABELS[selectedFunctionDetail.category] ??
      selectedFunctionDetail.category)
    : null;

  const functionSelectCurrentLabel = selectedFunctionDetail ? (
    <div className="feature-tree__function-select-label">
      <span className="feature-tree__function-select-name">
        {selectedFunctionDetail.name}()
      </span>
      {selectedFunctionCategoryLabel && (
        <span className="feature-tree__pill feature-tree__function-category-pill">
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
    onBindingExpressionChange(targetId, expressionText);
  }, [
    caseBranches,
    caseDefault,
    caseSelector,
    conditionalAuthoringEnabled,
    onBindingExpressionChange,
    slotAliasOptions,
    slotAliasOrder,
    targetId,
  ]);

  const insertExpressionToken = useCallback(
    (token: string) => {
      const trimmedToken = token.trim();
      if (trimmedToken.length === 0) {
        return;
      }
      const input = expressionInputRef.current;
      if (!input) {
        const nextValue =
          expressionValue.trim().length > 0
            ? `${expressionValue} ${trimmedToken}`
            : trimmedToken;
        onBindingExpressionChange(targetId, nextValue);
        return;
      }
      const start = input.selectionStart ?? expressionValue.length;
      const end = input.selectionEnd ?? start;
      const prefix = expressionValue.slice(0, start);
      const suffix = expressionValue.slice(end);
      const needsLeadingSpace = prefix.length > 0 && !/\s$/.test(prefix);
      const insertion = `${needsLeadingSpace ? " " : ""}${trimmedToken}`;
      const nextValue = `${prefix}${insertion}${suffix}`;
      onBindingExpressionChange(targetId, nextValue);
      requestAnimationFrame(() => {
        if (expressionInputRef.current) {
          const cursor = start + insertion.length;
          expressionInputRef.current.focus();
          expressionInputRef.current.setSelectionRange(cursor, cursor);
        }
      });
    },
    [expressionValue, onBindingExpressionChange, targetId],
  );

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

  const slotSummaries = useMemo(
    () =>
      slots.map((slot) => {
        const inputMeta =
          slot.inputId && slot.inputId !== SELF_BINDING_ID
            ? standardInputLookup.get(slot.inputId)
            : null;
        return {
          id: slot.id,
          alias: slot.alias,
          valueType: slot.valueType ?? "scalar",
          inputLabel: slot.inputId
            ? (inputMeta?.path ?? slot.inputId)
            : "Unbound",
        };
      }),
    [slots, standardInputLookup],
  );

  const header = (
    <div className="feature-tree__property-main feature-panel__binding-header">
      {expandable && (
        <button
          type="button"
          className="feature-tree__disclosure-btn"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${label}`}
        />
      )}
      <span className="feature-tree__property-label">
        Property {label} Drivers Config
      </span>
      {headerActions}
      {onResetBinding && (
        <button
          type="button"
          className="feature-panel__input-action feature-panel__input-action--secondary feature-tree__unbind-btn"
          onClick={() => onResetBinding(targetId)}
        >
          Reset
        </button>
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
      <div className="feature-tree__property-row">
        {header}
        {issueList.length > 0 && (
          <ul className="feature-tree__expression-errors">
            {issueList.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="feature-tree__property-row feature-tree__property-row--binding">
      {header}
      <div className="feature-tree__binding-editor">
        <div className="feature-tree__binding-slots">
          {slots.map((slot, index) => {
            const rawSlotInputId = slot.inputId ?? "";
            const normalizedSlotInputId =
              rawSlotInputId === "" ? null : rawSlotInputId;
            const slotIdentifier = getSlotIdentifier(slot, index);
            const slotKey = createSlotKey(targetId, slotIdentifier);
            const slotDiagnostics = resolveSlotDiagnostics?.(
              targetId,
              slotIdentifier,
            );
            const upstreamNodes = slotDiagnostics?.upstreamNodes ?? [];
            const diagnosticsExpanded = expandedSlotDiagnostics.has(slotKey);

            const selectedInput =
              normalizedSlotInputId && normalizedSlotInputId !== SELF_BINDING_ID
                ? standardInputLookup.get(normalizedSlotInputId)
                : null;

            const formattedSelectedInputLabel =
              selectedInput?.path &&
              formatRigPathLabel(selectedInput.path, faceId);

            const currentLabel =
              normalizedSlotInputId === null
                ? "Unbound"
                : normalizedSlotInputId === SELF_BINDING_ID
                  ? "Slider (self)"
                  : (formattedSelectedInputLabel ??
                    selectedInput?.label ??
                    normalizedSlotInputId);

            const baseOptions: FilterableSelectOption[] = [
              {
                value: null,
                label: "Unbound",
                keywords: ["unbound", "none", "null"],
              },
              {
                value: SELF_BINDING_ID,
                label: "Slider (self)",
                keywords: ["self", "slider", "manual"],
              },
              ...standardInputs.map((input) => ({
                value: input.id,
                label: formatRigPathLabel(input.path, faceId),
                keywords: [input.path, input.id, input.label ?? ""].filter(
                  (entry) => entry.length > 0,
                ),
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
                      keywords: [currentLabel],
                    },
                  ]
                : baseOptions;

            const slotValueType = slot.valueType ?? "scalar";

            return (
              <div key={slot.id} className="feature-tree__binding-slot">
                <div className="feature-tree__binding-slot-header">
                  <div className="feature-tree__binding-slot-variable">
                    <span className="feature-tree__binding-slot-variable-label">
                      Expression variable
                    </span>
                    <code className="feature-tree__binding-slot-variable-code">
                      {slotIdentifier}
                    </code>
                  </div>
                  <label className="feature-tree__binding-slot-alias">
                    <span>Alias</span>
                    <input
                      className="feature-tree__binding-slot-alias-input"
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
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--danger feature-tree__binding-slot-remove"
                      onClick={() => onRemoveBindingSlot(targetId, slot.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                {vectorAuthoringEnabled && (
                  <div
                    className="feature-tree__binding-slot-type-toggle"
                    role="group"
                    aria-label={`Value type for ${label} slot ${index + 1}`}
                  >
                    <span>Value type</span>
                    <div className="feature-tree__binding-slot-type-options">
                      <button
                        type="button"
                        className="feature-tree__binding-slot-type-button"
                        data-active={slotValueType === "scalar"}
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
                        className="feature-tree__binding-slot-type-button"
                        data-active={slotValueType === "vector"}
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
                <div className="feature-tree__binding-slot-controls">
                  <span className="feature-tree__property-label">
                    Driver Binding:
                  </span>
                  <FilterableSelect
                    value={normalizedSlotInputId}
                    onChange={(nextValue) =>
                      onBindingInputChange(targetId, nextValue, slot.id)
                    }
                    options={selectOptions}
                    placeholder="Select binding input"
                    currentLabelOverride={currentLabel}
                    className="feature-tree__binding-slot-combobox"
                    triggerClassName="feature-tree__property-select"
                    menuClassName="feature-tree__binding-slot-menu"
                    listClassName="feature-tree__binding-slot-option-list"
                    filterInputClassName="feature-panel__input-text feature-tree__binding-slot-filter"
                    optionClassName="feature-tree__binding-slot-option"
                    optionHighlightClassName="feature-tree__binding-slot-option--highlighted"
                    emptyClassName="feature-tree__binding-slot-option feature-tree__binding-slot-option--empty"
                    dataOptionAttribute="data-option"
                  />
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={() =>
                      onBindingInputChange(targetId, null, slot.id)
                    }
                    disabled={!normalizedSlotInputId}
                  >
                    Unbind
                  </button>
                  {/* {onRequestCreateStandardInput && (
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--primary"
                      onClick={() => {
                        const created = onRequestCreateStandardInput();
                        if (created) {
                          onBindingInputChange(targetId, created.id, slot.id);
                        }
                      }}
                    >
                      New
                    </button>
                  )} */}
                </div>
                {upstreamNodes.length > 0 && (
                  <div className="feature-tree__binding-slot-diagnostics">
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--secondary"
                      onClick={() => handleSlotDiagnosticsToggle(slotKey)}
                    >
                      {diagnosticsExpanded
                        ? "Hide upstream nodes"
                        : "Show upstream nodes"}
                    </button>
                    {diagnosticsExpanded && (
                      <ul className="feature-tree__binding-slot-upstream">
                        {upstreamNodes.map((node) => (
                          <li key={`${slotKey}-${node.id}`}>
                            <span className="feature-tree__binding-slot-upstream-name">
                              {node.label}
                            </span>
                            <span className="feature-tree__binding-slot-upstream-type">
                              {node.type}
                            </span>
                            {node.category && (
                              <span className="feature-tree__binding-slot-upstream-category">
                                {node.category}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="feature-panel__input-action feature-panel__input-action--primary feature-tree__slot-add"
            onClick={handleAddSlot}
          >
            Add control
          </button>
        </div>
        <div className="feature-tree__expression-editor">
          <label htmlFor={`binding-expression-${targetId}`}>Expression</label>
          <textarea
            id={`binding-expression-${targetId}`}
            ref={expressionInputRef}
            value={expressionValue}
            onChange={(event) =>
              onBindingExpressionChange(targetId, event.target.value)
            }
            aria-invalid={issueList.length > 0}
            spellCheck={false}
          />
          {aliasHints && (
            <p className="feature-tree__expression-hints">
              Aliases: {aliasHints}
            </p>
          )}
          {reservedHints && (
            <p className="feature-tree__expression-hints">{reservedHints}</p>
          )}
          {conditionalAuthoringEnabled && reservedVariableNames.length > 0 && (
            <div className="feature-tree__expression-completions">
              <span>Insert reserved:</span>
              {reservedVariableNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="feature-tree__chip"
                  onClick={() => insertExpressionToken(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          {issueList.length > 0 && (
            <ul className="feature-tree__expression-errors">
              {issueList.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          {caseMetadata && <CaseMetadataSummary metadata={caseMetadata} />}
          {expressionFunctionGroups.length > 0 && (
            <div className="feature-tree__collapsible">
              <button
                type="button"
                className="feature-tree__collapsible-toggle"
                data-state={functionReferenceExpanded ? "open" : "closed"}
                onClick={() =>
                  setFunctionReferenceExpanded((previous) => !previous)
                }
              >
                {functionReferenceExpanded
                  ? "Hide function reference"
                  : `Show function reference (${EXPRESSION_FUNCTION_VOCABULARY.length})`}
              </button>
              {functionReferenceExpanded && (
                <div className="feature-tree__function-reference">
                  <div className="feature-tree__function-list-header">
                    <h4 className="feature-tree__section-title">
                      Function Reference
                    </h4>
                    <span>
                      {EXPRESSION_FUNCTION_VOCABULARY.length} available
                    </span>
                  </div>
                  <FilterableSelect
                    className="feature-tree__binding-slot-combobox feature-tree__function-select"
                    triggerClassName="feature-tree__property-select feature-tree__function-select-trigger"
                    menuClassName="feature-tree__binding-slot-menu feature-tree__function-select-menu"
                    listClassName="feature-tree__binding-slot-option-list feature-tree__function-select-options"
                    filterInputClassName="feature-tree__binding-slot-filter"
                    optionClassName="feature-tree__binding-slot-option"
                    optionHighlightClassName="feature-tree__binding-slot-option--highlighted"
                    emptyClassName="feature-tree__binding-slot-option--empty"
                    value={selectedFunctionId}
                    options={functionSelectOptions}
                    onChange={setSelectedFunctionId}
                    placeholder="Browse functions…"
                    searchPlaceholder="Search functions or aliases"
                    noResultsLabel="No matching functions"
                    currentLabelOverride={functionSelectCurrentLabel}
                  />
                  {selectedFunctionDetail ? (
                    <div className="feature-tree__function-details">
                      <div className="feature-tree__function-details-header">
                        <div className="feature-tree__function-name-block">
                          <div className="feature-tree__function-name-row">
                            <span className="feature-tree__function-name">
                              {selectedFunctionDetail.name}()
                            </span>
                            {selectedFunctionCategoryLabel && (
                              <span className="feature-tree__pill feature-tree__function-category-pill">
                                {selectedFunctionCategoryLabel}
                              </span>
                            )}
                          </div>
                          {functionSignaturePreview && (
                            <p className="feature-tree__function-signature">
                              {functionSignaturePreview}
                            </p>
                          )}
                        </div>
                        <dl className="feature-tree__function-meta">
                          {selectedFunctionArgumentSummary && (
                            <div className="feature-tree__function-meta-pair">
                              <dt>Arguments</dt>
                              <dd>{selectedFunctionArgumentSummary}</dd>
                            </div>
                          )}
                          <div className="feature-tree__function-meta-pair">
                            <dt>Returns</dt>
                            <dd>{selectedFunctionReturnType}</dd>
                          </div>
                        </dl>
                      </div>
                      {selectedFunctionDescriptions.length > 0 ? (
                        selectedFunctionDescriptions.map((paragraph) => (
                          <p
                            key={paragraph}
                            className="feature-tree__function-description"
                          >
                            {paragraph}
                          </p>
                        ))
                      ) : (
                        <p className="feature-tree__function-description">
                          This function does not include documentation yet.
                        </p>
                      )}
                      {selectedFunctionAliases.length > 0 && (
                        <div className="feature-tree__function-aliases">
                          <span>Aliases</span>
                          <div className="feature-tree__function-alias-list">
                            {selectedFunctionAliases.map((alias) => (
                              <span
                                key={alias}
                                className="feature-tree__pill feature-tree__function-alias-pill"
                              >
                                {alias}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="feature-tree__function-parameters">
                        <div className="feature-tree__function-parameters-header">
                          <span>Parameters</span>
                          <span>{selectedFunctionParameterSummary}</span>
                        </div>
                        {selectedFunctionHasParameters ? (
                          <ul className="feature-tree__function-parameter-list">
                            {selectedFunctionParameters.map((param) => {
                              const variadicNote =
                                param.kind === "variadic"
                                  ? describeVariadicRange(param.repeatRange)
                                  : "";
                              return (
                                <li
                                  key={param.id}
                                  className="feature-tree__function-parameter"
                                >
                                  <div className="feature-tree__function-parameter-header">
                                    <div className="feature-tree__function-parameter-title">
                                      <span className="feature-tree__function-parameter-name">
                                        {param.label}
                                      </span>
                                      <span className="feature-tree__function-parameter-id">
                                        {param.id}
                                        {param.kind === "variadic" ? "…" : ""}
                                      </span>
                                    </div>
                                    <div className="feature-tree__function-parameter-flags">
                                      <span className="feature-tree__pill feature-tree__function-type-pill">
                                        {param.typeLabel}
                                      </span>
                                      {param.kind === "variadic" && (
                                        <span className="feature-tree__pill feature-tree__function-pill--subtle">
                                          Variadic
                                        </span>
                                      )}
                                      {param.optional && (
                                        <span className="feature-tree__pill feature-tree__function-pill--subtle">
                                          Optional
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className="feature-tree__function-parameter-doc">
                                    {param.doc ??
                                      `Provide a ${param.typeLabel.toLowerCase()} value.`}
                                    {variadicNote && (
                                      <span className="feature-tree__function-parameter-extra">
                                        {variadicNote}
                                      </span>
                                    )}
                                  </p>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="feature-tree__function-parameter-empty">
                            This function does not take any inputs.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="feature-tree__function-details feature-tree__function-details--empty">
                      <p>
                        Select a function to see its description and inputs.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {conditionalAuthoringEnabled && slotAliasOptions.length > 0 && (
            <div className="feature-tree__collapsible">
              <button
                type="button"
                className="feature-tree__collapsible-toggle"
                data-state={caseBuilderExpanded ? "open" : "closed"}
                onClick={() => setCaseBuilderExpanded((previous) => !previous)}
              >
                {caseBuilderExpanded
                  ? "Hide case builder"
                  : "Show case builder"}
              </button>
              {caseBuilderExpanded && (
                <div className="feature-tree__case-builder">
                  <h4 className="feature-tree__section-title">
                    Case Expression Builder
                  </h4>
                  <div className="feature-tree__case-row">
                    <label>
                      Selector
                      <select
                        value={caseSelector}
                        onChange={(event) =>
                          setCaseSelector(event.target.value)
                        }
                      >
                        {[...slotAliasOptions, ...reservedVariableNames]
                          .filter(
                            (token, index, array) =>
                              token && array.indexOf(token) === index,
                          )
                          .map((token) => (
                            <option key={token} value={token}>
                              {token}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Default
                      <select
                        value={caseDefault}
                        onChange={(event) => setCaseDefault(event.target.value)}
                      >
                        {["self", ...slotAliasOptions, ...reservedVariableNames]
                          .filter(
                            (token, index, array) =>
                              token && array.indexOf(token) === index,
                          )
                          .map((token) => (
                            <option key={token} value={token}>
                              {token}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <div className="feature-tree__case-branches">
                    <span>Branches</span>
                    {slotAliasOptions.map((alias) => {
                      const checked = caseBranches.includes(alias);
                      return (
                        <label
                          key={alias}
                          className="feature-tree__case-branch"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              handleCaseBranchToggle(
                                alias,
                                event.target.checked,
                              )
                            }
                          />
                          <span>{alias}</span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={handleApplyCaseExpression}
                    disabled={caseBranches.length === 0}
                  >
                    Apply case expression
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {vectorAuthoringEnabled && slotSummaries.length > 0 && (
          <div className="feature-tree__binding-summary">
            <h4 className="feature-tree__section-title">Slot summary</h4>
            <ul>
              {slotSummaries.map((summary) => (
                <li key={summary.id}>
                  <span>{summary.alias}</span>
                  <span className="feature-tree__binding-summary-spacer">
                    •
                  </span>
                  <span>{summary.valueType}</span>
                  <span className="feature-tree__binding-summary-spacer">
                    •
                  </span>
                  <span>{summary.inputLabel}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function getSlotIdentifier(
  slot: AnimatableBinding["slots"][number],
  index: number,
): string {
  if (slot.id && slot.id.trim().length > 0) {
    return slot.id.trim();
  }
  if (slot.alias && slot.alias.trim().length > 0) {
    return slot.alias.trim();
  }
  return `s${index + 1}`;
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
    <div className="feature-tree__case-metadata">
      <h4 className="feature-tree__section-title">CASE metadata</h4>
      <dl className="feature-tree__case-fields">
        <div>
          <dt>Selector</dt>
          <dd>{formatOperandMetadata(metadata.selector)}</dd>
        </div>
        <div>
          <dt>Default</dt>
          <dd>{formatOperandMetadata(metadata.defaultBranch)}</dd>
        </div>
      </dl>
      {metadata.branches.length > 0 && (
        <div className="feature-tree__case-branches-summary">
          <span>Branches</span>
          <ul>
            {metadata.branches.map((branch, index) => (
              <li key={branch.alias ?? branch.ref ?? index}>
                {formatOperandMetadata(branch)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
