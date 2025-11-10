import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  SELF_BINDING_ID,
  normalizeStandardRigInputPath,
  type StandardRigInput,
  type RemapSettings,
} from "@vizij/utils";
import type {
  ManagedStandardInput,
  AuthoringFeatureFlag,
} from "../../hooks/useRigController";
import type { PersistedGraphInsight } from "../../rig/persistence";
import type { BuildGraphResult } from "@vizij/node-graph-authoring";
import {
  diffMachineReports,
  type MachineDiffEntry,
  type MachineDiffResult,
  type MachineReport,
} from "@vizij/node-graph-authoring";
import {
  type StandardInputValues,
  type InputBindingMap,
  type AnimatableBinding,
  type BindingMap,
  type BindingOperatorType,
  type BindingValueType,
  bindingTargetFromInput,
  createDefaultParentBinding,
} from "@vizij/node-graph-authoring";
import type { BindingField } from "./types";
import { BindingEditor } from "./BindingEditor";
import { FilterableSelect } from "../common/FilterableSelect";
import { confirmDialog, alertDialog } from "../../utils/dialogs";
import { downloadBlob } from "../../utils/download";
import { extractStandardInputSubgroups } from "../../utils/standardInputs";

interface InputUsage {
  targetId: string;
  label: string;
  kind: "animatable" | "child";
}

interface IssueEntry {
  targetId: string;
  label: string;
  issues: string[];
  isStandardInput: boolean;
  rootKey: string | null;
}

interface StandardInputsSectionProps {
  faceId: string;
  onFaceIdChange: (value: string) => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  inputs: ManagedStandardInput[];
  inputBindings: InputBindingMap;
  roots: string[];
  selectedRoots: string[];
  onSelectedRootsChange: (next: string[]) => void;
  selectedSubgroups: string[];
  onSelectedSubgroupsChange: (next: string[]) => void;
  inputValues: StandardInputValues;
  graphInputDefaults: Record<string, number>;
  effectiveInputRanges: Map<string, { min: number; max: number }>;
  inputUsage: Map<string, InputUsage[]>;
  bindingIssues: Map<string, readonly string[]>;
  bindings: BindingMap;
  featureFlags: Record<AuthoringFeatureFlag, boolean>;
  onFeatureFlagChange(flag: AuthoringFeatureFlag, enabled: boolean): void;
  graphInsights: PersistedGraphInsight | null;
  graphReport: MachineReport | null;
  getGraphIr: () => BuildGraphResult["ir"] | null;
  graphTimeSeconds: number;
  graphPlaybackState: "playing" | "paused";
  onGraphPlay(): void;
  onGraphPause(): void;
  onGraphStop(): void;
  onGraphStep(): void;
  onInputValueChange: (inputId: string, value: number) => void;
  onCreateInput: () => void;
  onResetAllInputs: () => void;
  onClearCachedState: () => void;
  onEnsureParentBinding: (inputId: string) => void;
  onLinkChildInput: (parentId: string, childId: string) => void;
  onUnlinkChildInput: (parentId: string, childId: string) => void;
  onUpdateInput: (
    inputId: string,
    updates: {
      path?: string;
      label?: string;
      sourceId?: string | null;
      defaultValue?: number;
    },
  ) => void;
  onDisableInput: (inputId: string) => void;
  onEnableInput: (inputId: string) => void;
  onDeleteInput: (input: StandardRigInput) => void;
  onUnbindTarget: (targetId: string) => void;
  onCapturePose?: (name: string) => void;
  capturePoseDisabled?: boolean;
  onParentBindingInputChange: (
    targetId: string,
    inputId: string | null,
    slotId?: string,
  ) => void;
  onParentBindingRemapChange: (
    targetId: string,
    field: BindingField,
    value: number,
    slotId?: string,
  ) => void;
  onParentAddBindingSlot: (targetId: string) => void;
  onParentRemoveBindingSlot: (targetId: string, slotId: string) => void;
  onParentBindingExpressionChange: (
    targetId: string,
    expression: string,
  ) => void;
  onParentBindingSlotAliasChange: (
    targetId: string,
    slotId: string,
    alias: string,
  ) => void;
  onParentBindingSlotValueTypeChange: (
    targetId: string,
    slotId: string,
    valueType: BindingValueType,
  ) => void;
  onParentBindingOperatorToggle: (
    targetId: string,
    operator: BindingOperatorType,
    enabled: boolean,
  ) => void;
  onParentBindingOperatorParamChange: (
    targetId: string,
    operator: BindingOperatorType,
    paramId: string,
    value: number,
  ) => void;
  onParentResetBinding: (targetId: string) => void;
  graphStatus: "idle" | "loading" | "ready" | "error";
  graphError: string | null;
}

const GROUP_FALLBACK = "custom";

function getRootKey(entry: ManagedStandardInput): string {
  return entry.metadata?.root ?? entry.input.group ?? GROUP_FALLBACK;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function humanizeToken(value: string | undefined | null): string {
  if (!value) {
    return "";
  }
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatGraphClock(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "00:00.00";
  }
  const abs = Math.max(seconds, 0);
  const minutes = Math.floor(abs / 60);
  const secs = abs - minutes * 60;
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toFixed(2)
    .padStart(5, "0")}`;
}

const CHILD_KEY_DELIMITER = "\u0000";

function createChildMappingKey(
  parentId: string,
  kind: "input" | "feature",
  targetId: string,
): string {
  return `${kind}${CHILD_KEY_DELIMITER}${parentId}${CHILD_KEY_DELIMITER}${targetId}`;
}

function findSlotForInput(
  binding: AnimatableBinding | null | undefined,
  inputId: string,
): AnimatableBinding["slots"][number] | null {
  if (!binding) {
    return null;
  }
  const direct = binding.slots.find((slot) => slot.inputId === inputId);
  if (direct) {
    return direct;
  }
  if (binding.inputId === inputId) {
    return binding.slots[0] ?? null;
  }
  return null;
}

export function StandardInputsSection({
  faceId,
  onFaceIdChange,
  isCollapsed,
  onToggleCollapsed,
  inputs,
  inputBindings,
  roots,
  selectedRoots,
  onSelectedRootsChange,
  selectedSubgroups,
  onSelectedSubgroupsChange,
  inputValues,
  graphInputDefaults,
  effectiveInputRanges,
  inputUsage,
  bindingIssues,
  bindings,
  featureFlags,
  onFeatureFlagChange,
  graphInsights,
  graphReport,
  getGraphIr,
  graphTimeSeconds,
  graphPlaybackState,
  onGraphPlay,
  onGraphPause,
  onGraphStop,
  onGraphStep,
  onInputValueChange,
  onCreateInput,
  onResetAllInputs,
  onClearCachedState,
  onEnsureParentBinding,
  onLinkChildInput,
  onUnlinkChildInput,
  onUpdateInput,
  onDisableInput,
  onEnableInput,
  onDeleteInput,
  onUnbindTarget,
  onCapturePose,
  capturePoseDisabled,
  onParentBindingInputChange,
  onParentBindingRemapChange,
  onParentAddBindingSlot,
  onParentRemoveBindingSlot,
  onParentBindingExpressionChange,
  onParentBindingSlotAliasChange,
  onParentBindingSlotValueTypeChange,
  onParentBindingOperatorToggle,
  onParentBindingOperatorParamChange,
  onParentResetBinding,
  graphStatus,
  graphError,
}: StandardInputsSectionProps) {
  const betaFlagOptions: Array<{ key: AuthoringFeatureFlag; label: string }> = [
    { key: "vectorAuthoringBeta", label: "Vector slots" },
    { key: "conditionalAuthoringBeta", label: "Conditional bindings" },
    { key: "irInspectorBeta", label: "IR inspector" },
  ];
  const graphStatusMessage = useMemo(() => {
    if (graphStatus === "error") {
      return graphError
        ? `Rig graph failed to load: ${graphError}`
        : "Rig graph failed to load.";
    }
    if (graphStatus === "loading") {
      return "Building rig graph…";
    }
    return null;
  }, [graphError, graphStatus]);

  const formattedGraphTime = formatGraphClock(graphTimeSeconds);
  const transportDisabled = graphStatus !== "ready";
  const handlePlayPauseTransport = () => {
    if (graphPlaybackState === "playing") {
      onGraphPause();
    } else {
      onGraphPlay();
    }
  };
  const handleStopTransport = () => {
    onGraphStop();
  };
  const handleStepTransport = () => {
    onGraphStep();
  };

  const driverStats = useMemo(() => {
    if (!graphReport) {
      return null;
    }
    return {
      bindings: graphReport.summary.bindings.length,
      issues: Object.keys(graphReport.issues.byTarget ?? {}).length,
      nodes: graphReport.irGraph?.nodes.length ?? 0,
      registry: graphReport.irGraph?.metadata?.registryVersion ?? "—",
    };
  }, [graphReport]);

  const availableRoots = useMemo(() => {
    const merged = new Set<string>(roots);
    inputs.forEach((entry) => {
      merged.add(getRootKey(entry));
    });
    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }, [inputs, roots]);

  const selectedSet = useMemo(
    () => new Set<string>(selectedRoots),
    [selectedRoots],
  );
  const selectedSubgroupSet = useMemo(
    () => new Set<string>(selectedSubgroups),
    [selectedSubgroups],
  );

  const inputSubgroups = useMemo(() => {
    const map = new Map<string, string[]>();
    inputs.forEach((entry) => {
      const root = getRootKey(entry);
      const subgroups = extractStandardInputSubgroups(entry.input.path, root);
      map.set(entry.input.id, subgroups);
    });
    return map;
  }, [inputs]);

  const availableSubgroups = useMemo(() => {
    const collector = new Set<string>();
    inputs.forEach((entry) => {
      const rootKey = getRootKey(entry);
      if (selectedSet.size > 0 && !selectedSet.has(rootKey)) {
        return;
      }
      const subgroups = inputSubgroups.get(entry.input.id) ?? [];
      subgroups.forEach((token) => {
        if (token) {
          collector.add(token);
        }
      });
    });
    return Array.from(collector).sort((a, b) => a.localeCompare(b));
  }, [inputSubgroups, inputs, selectedSet]);

  const totalDisabledInputs = useMemo(
    () =>
      inputs.reduce((count, entry) => (entry.disabled ? count + 1 : count), 0),
    [inputs],
  );

  const hasDisabledInScope = useMemo(() => {
    return inputs.some((entry) => {
      if (!entry.disabled) {
        return false;
      }
      if (selectedSet.size > 0 && !selectedSet.has(getRootKey(entry))) {
        return false;
      }
      if (selectedSubgroupSet.size > 0) {
        const subgroups = inputSubgroups.get(entry.input.id) ?? [];
        if (subgroups.length === 0) {
          return false;
        }
        return subgroups.some((token) => selectedSubgroupSet.has(token));
      }
      return true;
    });
  }, [inputs, inputSubgroups, selectedSet, selectedSubgroupSet]);

  const [expandedInputs, setExpandedInputs] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set(),
  );
  const [childSelection, setChildSelection] = useState<{
    parentId: string | null;
    childId: string | null;
  }>({ parentId: null, childId: null });
  const [expandedChildSections, setExpandedChildSections] = useState<
    Set<string>
  >(() => new Set());
  const [capturePoseName, setCapturePoseName] = useState("");
  const [showDisabled, setShowDisabled] = useState(false);
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [issueFilter, setIssueFilter] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const standardInputList = useMemo(
    () => inputs.map((entry) => entry.input),
    [inputs],
  );
  const standardInputLookup = useMemo(
    () => new Map(standardInputList.map((item) => [item.id, item])),
    [standardInputList],
  );
  const entriesById = useMemo(
    () => new Map(inputs.map((entry) => [entry.input.id, entry])),
    [inputs],
  );

  const issueEntries = useMemo<IssueEntry[]>(() => {
    if (!graphInsights) {
      return [];
    }
    const byTarget = graphInsights.issues?.byTarget ?? {};
    return Object.entries(byTarget)
      .map(([targetId, rawMessages]) => {
        const messages = rawMessages.filter(
          (message) => typeof message === "string" && message.trim().length > 0,
        );
        const entry = entriesById.get(targetId);
        const standardInput = entry?.input ?? null;
        return {
          targetId,
          label:
            standardInput?.path ??
            standardInput?.label ??
            entry?.input.label ??
            targetId,
          issues:
            messages.length > 0 ? messages : ["Unknown issue reported in IR"],
          isStandardInput: Boolean(standardInput),
          rootKey: entry ? getRootKey(entry) : null,
        };
      })
      .sort((a, b) => {
        if (b.issues.length !== a.issues.length) {
          return b.issues.length - a.issues.length;
        }
        return a.label.localeCompare(b.label);
      });
  }, [entriesById, graphInsights]);

  const totalIssueCount = useMemo(
    () => issueEntries.reduce((sum, entry) => sum + entry.issues.length, 0),
    [issueEntries],
  );

  const filteredIssueEntries = useMemo(() => {
    const token = issueFilter.trim().toLowerCase();
    if (!token) {
      return issueEntries;
    }
    return issueEntries.filter((entry) => {
      if (entry.label.toLowerCase().includes(token)) {
        return true;
      }
      if (entry.targetId.toLowerCase().includes(token)) {
        return true;
      }
      return entry.issues.some((issue) => issue.toLowerCase().includes(token));
    });
  }, [issueEntries, issueFilter]);
  const issueToggleLabel = issuePanelOpen
    ? "Hide binding issues"
    : `Show binding issues (${issueEntries.length})`;

  useEffect(() => {
    if (!featureFlags.irInspectorBeta) {
      setInspectorOpen(false);
    }
  }, [featureFlags.irInspectorBeta]);

  useEffect(() => {
    if (!graphReport) {
      setInspectorOpen(false);
    }
  }, [graphReport]);

  useEffect(() => {
    if (issueEntries.length === 0) {
      setIssuePanelOpen(false);
      if (issueFilter) {
        setIssueFilter("");
      }
    }
  }, [issueEntries.length, issueFilter]);

  const cancelChildSelection = useCallback(() => {
    setChildSelection({ parentId: null, childId: null });
  }, []);

  const confirmChildSelection = useCallback(() => {
    setChildSelection((current) => {
      if (!current.parentId || !current.childId) {
        return { parentId: null, childId: null };
      }
      onLinkChildInput(current.parentId, current.childId);
      return { parentId: null, childId: null };
    });
  }, [onLinkChildInput]);

  const handleRevealIssueTarget = useCallback(
    (targetId: string) => {
      const entry = entriesById.get(targetId);
      if (!entry) {
        return;
      }
      const rootKey = getRootKey(entry);
      if (
        selectedRoots.length > 0 &&
        rootKey &&
        !selectedRoots.includes(rootKey)
      ) {
        onSelectedRootsChange([...selectedRoots, rootKey]);
      }
      setExpandedInputs((previous) => {
        if (previous.has(targetId)) {
          return previous;
        }
        const next = new Set(previous);
        next.add(targetId);
        return next;
      });
      setExpandedParents((previous) => {
        if (previous.has(targetId)) {
          return previous;
        }
        const next = new Set(previous);
        next.add(targetId);
        return next;
      });
      setIssuePanelOpen(true);
    },
    [entriesById, onSelectedRootsChange, selectedRoots],
  );

  const handleFaceIdInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onFaceIdChange(event.target.value);
    },
    [onFaceIdChange],
  );

  const handleCaptureNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setCapturePoseName(event.target.value);
    },
    [],
  );

  const triggerCapturePose = useCallback(() => {
    if (!onCapturePose) {
      return;
    }
    if (capturePoseDisabled) {
      return;
    }
    const trimmed = capturePoseName.trim();
    if (!trimmed) {
      return;
    }
    onCapturePose(trimmed);
    setCapturePoseName("");
  }, [capturePoseDisabled, capturePoseName, onCapturePose]);

  const handleCaptureButtonClick = useCallback(() => {
    triggerCapturePose();
  }, [triggerCapturePose]);

  const handleCaptureNameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (!capturePoseDisabled) {
          triggerCapturePose();
        }
      }
    },
    [capturePoseDisabled, triggerCapturePose],
  );

  const capturePoseButtonDisabled =
    capturePoseDisabled ||
    !onCapturePose ||
    capturePoseName.trim().length === 0;

  const handleRootToggle = useCallback(
    (root: string) => {
      const rootInputIds = inputs
        .filter((entry) => getRootKey(entry) === root)
        .map((entry) => entry.input.id);

      setExpandedInputs((previous) => {
        const next = new Set(previous);
        rootInputIds.forEach((id) => next.delete(id));
        return next;
      });
      setExpandedParents((previous) => {
        const next = new Set(previous);
        rootInputIds.forEach((id) => next.delete(id));
        return next;
      });
      setExpandedChildSections((previous) => {
        if (previous.size === 0) {
          return previous;
        }
        const next = new Set(previous);
        let changed = false;
        rootInputIds.forEach((id) => {
          if (next.delete(id)) {
            changed = true;
          }
        });
        return changed ? next : previous;
      });

      const nextSelection = selectedRoots.includes(root)
        ? selectedRoots.filter((value) => value !== root)
        : [...selectedRoots, root];
      onSelectedRootsChange(nextSelection);
    },
    [inputs, onSelectedRootsChange, selectedRoots],
  );

  const handleSelectAll = useCallback(() => {
    onSelectedRootsChange([]);
  }, [onSelectedRootsChange]);

  const handleSubgroupSelectAll = useCallback(() => {
    onSelectedSubgroupsChange([]);
  }, [onSelectedSubgroupsChange]);

  const handleSubgroupToggle = useCallback(
    (subgroup: string) => {
      const nextSelection = selectedSubgroupSet.has(subgroup)
        ? selectedSubgroups.filter((value) => value !== subgroup)
        : [...selectedSubgroups, subgroup];
      onSelectedSubgroupsChange(nextSelection);
    },
    [onSelectedSubgroupsChange, selectedSubgroupSet, selectedSubgroups],
  );

  const handleClearCachedState = useCallback(() => {
    if (
      confirmDialog(
        "Clear cached rig data for this asset? This removes saved inputs, bindings, and overrides.",
      )
    ) {
      onClearCachedState();
    }
  }, [onClearCachedState]);

  const handleDownloadIr = useCallback(() => {
    const graph = getGraphIr();
    if (!graph) {
      alertDialog("No IR graph is ready yet. Build the graph first.");
      return;
    }
    const safeFaceId =
      faceId && faceId.trim().length > 0 ? faceId.trim() : "vizij";
    const fileName = `${safeFaceId}_rig.ir.json`;
    const blob = new Blob([JSON.stringify(graph, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, fileName);
  }, [faceId, getGraphIr]);

  const handleDownloadMachineReport = useCallback(() => {
    if (!graphReport) {
      alertDialog("No machine report is ready yet. Build the graph first.");
      return;
    }
    const safeFaceId =
      faceId && faceId.trim().length > 0 ? faceId.trim() : "vizij";
    const blob = new Blob([JSON.stringify(graphReport, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, `${safeFaceId}_machine-report.json`);
  }, [faceId, graphReport]);

  const graphAlert = useMemo(() => {
    if (!graphStatusMessage) {
      return null;
    }
    return (
      <div className="feature-panel__graph-status feature-panel__graph-status--warning">
        {graphStatusMessage}
      </div>
    );
  }, [graphStatusMessage]);

  const filteredInputs = useMemo(() => {
    const byRoot =
      selectedSet.size === 0
        ? inputs
        : inputs.filter((entry) => selectedSet.has(getRootKey(entry)));
    const byVisibility = showDisabled
      ? byRoot
      : byRoot.filter((entry) => !entry.disabled);
    if (selectedSubgroupSet.size === 0) {
      return byVisibility;
    }
    return byVisibility.filter((entry) => {
      const subgroups = inputSubgroups.get(entry.input.id) ?? [];
      if (subgroups.length === 0) {
        return false;
      }
      return subgroups.some((token) => selectedSubgroupSet.has(token));
    });
  }, [inputSubgroups, inputs, selectedSet, selectedSubgroupSet, showDisabled]);

  const emptyMessage = useMemo(() => {
    if (inputs.length === 0) {
      return "No standard inputs are available for this rig.";
    }
    if (!showDisabled && hasDisabledInScope && filteredInputs.length === 0) {
      return "All inputs in this view are currently disabled. Toggle “Show disabled” to review them.";
    }
    if (selectedSubgroups.length > 0 && filteredInputs.length === 0) {
      return "No inputs match the selected subgroups yet.";
    }
    if (selectedRoots.length > 0 && filteredInputs.length === 0) {
      const [firstRoot] = selectedRoots;
      return `No inputs for ${firstRoot} yet. Add one from the feature tree or create a custom input.`;
    }
    return null;
  }, [
    filteredInputs.length,
    hasDisabledInScope,
    inputs.length,
    selectedRoots,
    selectedSubgroups,
    showDisabled,
  ]);

  const renderInputCard = (entry: ManagedStandardInput) => {
    const { input, source } = entry;
    const disabled = entry.disabled;
    const range = effectiveInputRanges.get(input.id) ?? input.range;
    const value = inputValues[input.id] ?? input.defaultValue;
    const runtimeDefaultValue =
      graphInputDefaults[input.id] ?? input.defaultValue ?? 0;
    const defaultFieldStep = Math.max((range.max - range.min) / 200, 0.001);
    const defaultInputKey = `${input.id}::default::${runtimeDefaultValue}`;
    const usage = inputUsage.get(input.id) ?? [];
    const animatableUsage = usage.filter((item) => item.kind === "animatable");
    const isAuto = source === "auto";
    const isExpanded = expandedInputs.has(input.id);
    const isParentExpanded = expandedParents.has(input.id);
    const parentBinding = inputBindings[input.id] ?? null;
    const parentIssues = bindingIssues.get(input.id) ?? [];
    const parentTarget = bindingTargetFromInput(input);
    const bindingForEditor = parentBinding
      ? parentBinding
      : isParentExpanded
        ? createDefaultParentBinding(parentTarget)
        : null;

    const parentHasSelfSlot = parentBinding?.slots.some(
      (slot) => slot.inputId === SELF_BINDING_ID,
    );
    const expressionUsesSelf = parentBinding?.expression
      ? /\bself\b/i.test(parentBinding.expression)
      : false;
    const sliderLocked =
      parentBinding !== null && (!parentHasSelfSlot || !expressionUsesSelf);
    const sliderDisabled = sliderLocked || disabled;
    const numericDisabled = sliderDisabled;
    const cardClassName = disabled
      ? "feature-panel__input-card feature-panel__input-card--disabled"
      : "feature-panel__input-card";
    const toggleLabel = disabled ? "Enable" : "Disable";
    const toggleTitle = disabled ? "Enable input" : "Disable input";
    const handleToggleEnabled = () => {
      if (disabled) {
        onEnableInput(input.id);
      } else {
        onDisableInput(input.id);
      }
    };

    const normalizedPath = normalizeStandardRigInputPath(input.path);
    const pathTokens = normalizedPath.split("/").filter(Boolean);
    if (pathTokens[0] === "standard") {
      pathTokens.shift();
    }
    const rootToken =
      entry.metadata?.root && entry.metadata.root.length > 0
        ? entry.metadata.root
        : (pathTokens[0] ?? input.group ?? "custom");
    const shapeLabel =
      entry.metadata?.elementName && entry.metadata.elementName.trim().length
        ? entry.metadata.elementName
        : humanizeToken(rootToken) || "Custom";
    const featureLabel =
      entry.metadata?.featureLabel && entry.metadata.featureLabel.length > 0
        ? entry.metadata.featureLabel
        : humanizeToken(pathTokens[1] ?? input.label ?? "");
    const fallbackPropertySegments =
      pathTokens.length > 2 ? pathTokens.slice(2) : pathTokens.slice(-1);
    const fallbackPropertyLabel = humanizeToken(
      fallbackPropertySegments.join(" / "),
    );
    const propertyLabel =
      entry.metadata?.propertyLabel && entry.metadata.propertyLabel.length > 0
        ? entry.metadata.propertyLabel
        : fallbackPropertyLabel || featureLabel;
    const showProperty =
      propertyLabel &&
      propertyLabel.length > 0 &&
      propertyLabel.toLowerCase() !== featureLabel.toLowerCase();
    const hierarchyLabel = showProperty
      ? `${featureLabel} • ${propertyLabel}`
      : featureLabel;

    const handleParentBindingInputChangeSafe = (
      targetId: string,
      bindingInputId: string | null,
      slotId?: string,
    ) => {
      if (disabled) {
        return;
      }
      onParentBindingInputChange(targetId, bindingInputId, slotId);
    };

    const handleParentBindingRemapChangeSafe = (
      targetId: string,
      field: BindingField,
      value: number,
      slotId?: string,
    ) => {
      if (disabled) {
        return;
      }
      onParentBindingRemapChange(targetId, field, value, slotId);
    };

    const handleParentAddSlotSafe = (targetId: string) => {
      if (disabled) {
        return;
      }
      onParentAddBindingSlot(targetId);
    };

    const handleParentRemoveSlotSafe = (targetId: string, slotId: string) => {
      if (disabled) {
        return;
      }
      onParentRemoveBindingSlot(targetId, slotId);
    };

    const handleParentExpressionChangeSafe = (
      targetId: string,
      expression: string,
    ) => {
      if (disabled) {
        return;
      }
      onParentBindingExpressionChange(targetId, expression);
    };

    const handleParentAliasChangeSafe = (
      targetId: string,
      slotId: string,
      alias: string,
    ) => {
      if (disabled) {
        return;
      }
      onParentBindingSlotAliasChange(targetId, slotId, alias);
    };

    const handleParentOperatorToggleSafe = (
      targetId: string,
      operator: BindingOperatorType,
      enabled: boolean,
    ) => {
      if (disabled) {
        return;
      }
      onParentBindingOperatorToggle(targetId, operator, enabled);
    };

    const handleParentOperatorParamChangeSafe = (
      targetId: string,
      operator: BindingOperatorType,
      paramId: string,
      value: number,
    ) => {
      if (disabled) {
        return;
      }
      onParentBindingOperatorParamChange(targetId, operator, paramId, value);
    };

    const handleParentResetBindingSafe = (targetId: string) => {
      if (disabled) {
        return;
      }
      onParentResetBinding(targetId);
    };

    const toggleInputExpanded = () => {
      const willCollapse = expandedInputs.has(input.id);
      if (willCollapse) {
        if (childSelection.parentId === input.id) {
          cancelChildSelection();
        }
        setExpandedChildSections((previous) => {
          if (!previous.has(input.id)) {
            return previous;
          }
          const next = new Set(previous);
          next.delete(input.id);
          return next;
        });
      }
      setExpandedInputs((previous) => {
        const next = new Set(previous);
        if (next.has(input.id)) {
          next.delete(input.id);
        } else {
          next.add(input.id);
        }
        return next;
      });
    };

    const ensureParentBindingAndSlot = (
      nextBinding: AnimatableBinding | null,
    ) => {
      if (disabled) {
        return;
      }
      onEnsureParentBinding(input.id);
      const hasAdditionalSlot =
        nextBinding &&
        nextBinding.slots.some(
          (slot, index) =>
            index > 0 || (slot.inputId && slot.inputId !== SELF_BINDING_ID),
        );
      if (!hasAdditionalSlot) {
        onParentAddBindingSlot(input.id);
      }
    };

    const toggleParentExpanded = () => {
      const willExpand = !isParentExpanded;
      if (willExpand && !disabled) {
        ensureParentBindingAndSlot(parentBinding);
      }
      setExpandedParents((previous) => {
        const next = new Set(previous);
        if (next.has(input.id)) {
          next.delete(input.id);
        } else {
          next.add(input.id);
        }
        return next;
      });
    };

    const childCandidates = standardInputList.filter((candidate) => {
      if (candidate.id === input.id) {
        return false;
      }
      const candidateBinding = inputBindings[candidate.id];
      if (!candidateBinding) {
        return true;
      }
      if (candidateBinding.inputId === input.id) {
        return false;
      }
      return !candidateBinding.slots.some((slot) => slot.inputId === input.id);
    });

    const childOptions = childCandidates
      .map((candidate) => ({
        id: candidate.id,
        label: candidate.path,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const childSelectOptions = childOptions.map((option) => ({
      value: option.id,
      label: option.label,
      keywords: [option.label, option.id],
    }));

    const isSelectingChild = childSelection.parentId === input.id;
    const selectedChildId = isSelectingChild
      ? (childSelection.childId ?? null)
      : null;

    const handleStartChildSelection = () => {
      if (disabled) {
        return;
      }
      if (childOptions.length === 0) {
        return;
      }
      const defaultChildId = childOptions[0]?.id ?? null;
      setChildSelection({ parentId: input.id, childId: defaultChildId });
    };

    const handleChildSelectionChange = (nextValue: string | null) => {
      setChildSelection((previous) => {
        if (previous.parentId !== input.id) {
          return previous;
        }
        return {
          parentId: input.id,
          childId: nextValue,
        };
      });
    };

    const derivedChildren = input.derivedChildren ?? [];

    const childEntries = derivedChildren
      .map((childId) => {
        const childEntry = entriesById.get(childId);
        return {
          id: childId,
          label: childEntry ? childEntry.input.path : childId,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    type ChildMapping = {
      key: string;
      kind: "input" | "feature";
      label: string;
      targetId: string;
      slotId: string | null;
      remap: RemapSettings | null;
      issues: readonly string[];
    };

    const childInputMappings: ChildMapping[] = childEntries.map((child) => {
      const childBinding = inputBindings[child.id] ?? null;
      const slot = findSlotForInput(childBinding, input.id);
      const issues = bindingIssues.get(child.id) ?? [];
      return {
        key: createChildMappingKey(input.id, "input", child.id),
        kind: "input",
        label: child.label,
        targetId: child.id,
        slotId: slot?.id ?? null,
        remap: slot ? slot.remap : null,
        issues,
      };
    });

    const featureMappings: ChildMapping[] = animatableUsage.map(
      ({ targetId, label }) => {
        const binding = bindings[targetId] ?? null;
        const slot = findSlotForInput(binding, input.id);
        const issues = bindingIssues.get(targetId) ?? [];
        return {
          key: createChildMappingKey(input.id, "feature", targetId),
          kind: "feature",
          label,
          targetId,
          slotId: slot?.id ?? null,
          remap: slot ? slot.remap : null,
          issues,
        };
      },
    );

    const childMappings = [...childInputMappings, ...featureMappings];

    const selfSlot =
      parentBinding?.slots.find((slot) => slot.inputId === SELF_BINDING_ID) ??
      null;

    const parentConnections = parentBinding
      ? (() => {
          const slotMap = new Map<
            string,
            { label: string; slotIds: string[] }
          >();
          parentBinding.slots.forEach((slot) => {
            const parentId = slot.inputId;
            if (!parentId || parentId === SELF_BINDING_ID) {
              return;
            }
            const label = entriesById.get(parentId)?.input.path ?? parentId;
            const record = slotMap.get(parentId);
            if (record) {
              record.slotIds.push(slot.id);
            } else {
              slotMap.set(parentId, { label, slotIds: [slot.id] });
            }
          });
          return Array.from(slotMap.entries())
            .map(([parentId, value]) => ({
              id: parentId,
              label: value.label,
              slotIds: value.slotIds,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        })()
      : [];

    const showSelfChip = Boolean(selfSlot && parentConnections.length > 0);

    const totalParentLinks = parentConnections.length + (showSelfChip ? 1 : 0);

    const parentStatusLabel =
      totalParentLinks > 0 ? `${totalParentLinks} linked` : "None linked";

    const childStatusLabel =
      childMappings.length > 0
        ? `${childMappings.length} linked`
        : "None linked";

    const parentToggleLabel = isParentExpanded
      ? "Hide mapping"
      : "Show mapping";

    const isChildExpanded = expandedChildSections.has(input.id);
    const hasChildMappings = childMappings.length > 0;
    const showChildDetails = isChildExpanded && hasChildMappings;

    const childToggleLabel = showChildDetails ? "Hide mapping" : "Show mapping";

    const handleToggleChildMappings = () => {
      const currentlyExpanded = expandedChildSections.has(input.id);
      if (currentlyExpanded) {
        setExpandedChildSections((previous) => {
          if (!previous.has(input.id)) {
            return previous;
          }
          const next = new Set(previous);
          next.delete(input.id);
          return next;
        });
        return;
      }
      if (!hasChildMappings) {
        return;
      }
      if (!disabled) {
        childMappings.forEach((mapping) => {
          if (mapping.kind === "input") {
            onEnsureParentBinding(mapping.targetId);
          }
        });
      }
      setExpandedChildSections((previous) => {
        if (previous.has(input.id)) {
          return previous;
        }
        const next = new Set(previous);
        next.add(input.id);
        return next;
      });
    };

    const handleAddParentClick = () => {
      if (disabled) {
        return;
      }
      ensureParentBindingAndSlot(parentBinding);
      setExpandedParents((previous) => {
        const next = new Set(previous);
        next.add(input.id);
        return next;
      });
    };

    const handleRemoveChildLink = (childId: string) => {
      if (disabled) {
        return;
      }
      onUnlinkChildInput(input.id, childId);
      if (expandedChildSections.has(input.id) && childMappings.length <= 1) {
        setExpandedChildSections((previous) => {
          if (!previous.has(input.id)) {
            return previous;
          }
          const next = new Set(previous);
          next.delete(input.id);
          return next;
        });
      }
    };

    const handleRemoveFeatureLink = (targetId: string) => {
      if (disabled) {
        return;
      }
      onUnbindTarget(targetId);
      if (expandedChildSections.has(input.id) && childMappings.length <= 1) {
        setExpandedChildSections((previous) => {
          if (!previous.has(input.id)) {
            return previous;
          }
          const next = new Set(previous);
          next.delete(input.id);
          return next;
        });
      }
    };

    const handleRemoveParentConnection = (
      connection: (typeof parentConnections)[number],
    ) => {
      if (disabled) {
        return;
      }
      connection.slotIds.forEach((slotId) => {
        onParentBindingInputChange(input.id, null, slotId);
      });
    };

    const handleNumericChange = (event: ChangeEvent<HTMLInputElement>) => {
      if (disabled) {
        return;
      }
      const parsed = Number(event.target.value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      onInputValueChange(input.id, clamp(parsed, range.min, range.max));
    };

    const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
      if (disabled) {
        return;
      }
      const parsed = Number(event.target.value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      onInputValueChange(input.id, parsed);
    };

    const commitGraphDefault = (nextValue: number) => {
      if (disabled) {
        return;
      }
      if (!Number.isFinite(nextValue)) {
        return;
      }
      const clamped = clamp(nextValue, range.min, range.max);
      if (clamped === runtimeDefaultValue) {
        return;
      }
      onUpdateInput(input.id, { defaultValue: clamped });
    };

    const handleDefaultInputBlur = (event: FocusEvent<HTMLInputElement>) => {
      if (disabled) {
        event.target.value = runtimeDefaultValue.toString();
        return;
      }
      const parsed = Number(event.target.value);
      if (!Number.isFinite(parsed)) {
        event.target.value = runtimeDefaultValue.toString();
        return;
      }
      const clamped = clamp(parsed, range.min, range.max);
      event.target.value = clamped.toString();
      if (clamped === runtimeDefaultValue) {
        return;
      }
      commitGraphDefault(clamped);
    };

    const handleDefaultInputKeyDown = (
      event: KeyboardEvent<HTMLInputElement>,
    ) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleDefaultInputBlur(
          event as unknown as FocusEvent<HTMLInputElement>,
        );
        return;
      }
      if (event.key === "Escape") {
        (event.target as HTMLInputElement).value =
          runtimeDefaultValue.toString();
        (event.target as HTMLInputElement).blur();
      }
    };

    const handleApplyCurrentAsDefault = () => {
      commitGraphDefault(value);
    };

    const handlePathCommit = (nextPath: string) => {
      if (disabled) {
        return;
      }
      const trimmed = nextPath.trim();
      if (!trimmed || trimmed === input.path) {
        return;
      }
      onUpdateInput(input.id, { path: trimmed });
    };

    const handlePathKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handlePathCommit((event.target as HTMLInputElement).value);
      }
    };

    const handlePathBlur = (event: FocusEvent<HTMLInputElement>) => {
      handlePathCommit(event.target.value);
    };

    return (
      <div key={input.id} className={cardClassName} data-disabled={disabled}>
        <div className="feature-panel__input-header">
          <div className="feature-panel__input-header-main">
            <button
              type="button"
              className="feature-panel__input-disclosure"
              onClick={toggleInputExpanded}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${input.path}`}
            />
            <div className="feature-panel__input-title">
              <span className="feature-panel__input-badge">{shapeLabel}</span>
              <span className="feature-panel__input-hierarchy">
                {hierarchyLabel}
              </span>
              {disabled && (
                <span className="feature-panel__input-status">Disabled</span>
              )}
            </div>
            <button
              type="button"
              className="feature-panel__input-toggle"
              onClick={handleToggleEnabled}
              aria-pressed={!disabled}
              aria-label={toggleTitle}
              title={toggleTitle}
            >
              {toggleLabel}
            </button>
            <label
              className="feature-panel__input-slider"
              data-disabled={sliderDisabled}
            >
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={Math.max((range.max - range.min) / 200, 0.001)}
                value={value}
                disabled={sliderDisabled}
                onChange={handleSliderChange}
              />
            </label>
            <label className="feature-panel__input-value">
              <input
                className="feature-panel__input-number"
                type="number"
                value={value}
                min={range.min}
                max={range.max}
                step={Math.max((range.max - range.min) / 200, 0.001)}
                disabled={numericDisabled}
                onChange={handleNumericChange}
              />
            </label>
            <div className="feature-panel__input-default-note">
              <label className="feature-panel__input-value">
                <span>Graph default</span>
                <input
                  key={defaultInputKey}
                  className="feature-panel__input-number"
                  type="number"
                  min={range.min}
                  max={range.max}
                  step={defaultFieldStep}
                  defaultValue={runtimeDefaultValue}
                  disabled={disabled}
                  onBlur={handleDefaultInputBlur}
                  onKeyDown={handleDefaultInputKeyDown}
                />
              </label>
              <button
                type="button"
                className="feature-panel__input-action feature-panel__input-action--secondary"
                onClick={handleApplyCurrentAsDefault}
                disabled={disabled || value === runtimeDefaultValue}
              >
                Use current
              </button>
            </div>
          </div>
          {!isAuto && (
            <div className="feature-panel__input-header-actions">
              <button
                type="button"
                className="feature-panel__input-action feature-panel__input-action--danger"
                onClick={() => onDeleteInput(input)}
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {isExpanded && (
          <div className="feature-panel__input-body">
            <div className="feature-panel__input-row feature-panel__input-row--path">
              <label className="feature-panel__input-path-label">
                Path
                <input
                  className="feature-panel__input-text"
                  type="text"
                  defaultValue={input.path}
                  onBlur={handlePathBlur}
                  onKeyDown={handlePathKeyDown}
                  spellCheck={false}
                  disabled={disabled}
                />
              </label>
            </div>
            <div className="feature-panel__input-mappings">
              <section className="feature-panel__mapping-group feature-panel__mapping-group--parents">
                <div className="feature-panel__mapping-header">
                  <div className="feature-panel__mapping-title">
                    <span>Parent Controls</span>
                    <span className="feature-panel__mapping-status">
                      {parentStatusLabel}
                    </span>
                  </div>
                  <div className="feature-panel__mapping-actions">
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--primary"
                      onClick={handleAddParentClick}
                      disabled={disabled}
                    >
                      Add parent
                    </button>
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--secondary"
                      onClick={toggleParentExpanded}
                    >
                      {parentToggleLabel}
                    </button>
                  </div>
                </div>
                <div className="feature-panel__mapping-content">
                  {totalParentLinks > 0 ? (
                    <div className="feature-panel__mapping-chips">
                      {showSelfChip && selfSlot && (
                        <span
                          key="parent:self"
                          role="button"
                          tabIndex={0}
                          className="feature-panel__input-chip feature-panel__input-chip--parent"
                          data-expanded={isParentExpanded}
                          onClick={toggleParentExpanded}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleParentExpanded();
                            }
                          }}
                        >
                          <span
                            className="feature-panel__chip-disclosure"
                            aria-hidden="true"
                          >
                            {isParentExpanded ? "v" : ">"}
                          </span>
                          Slider (self)
                          <button
                            type="button"
                            className="feature-panel__input-chip-dismiss"
                            onClick={(event) => {
                              event.stopPropagation();
                              onParentBindingInputChange(
                                input.id,
                                null,
                                selfSlot.id,
                              );
                            }}
                            title="Remove slider mapping"
                            disabled={disabled}
                          >
                            ×
                          </button>
                        </span>
                      )}
                      {parentConnections.map((parent) => (
                        <span
                          key={`parent:${parent.id}`}
                          role="button"
                          tabIndex={0}
                          className="feature-panel__input-chip feature-panel__input-chip--parent"
                          data-expanded={isParentExpanded}
                          onClick={toggleParentExpanded}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleParentExpanded();
                            }
                          }}
                        >
                          <span
                            className="feature-panel__chip-disclosure"
                            aria-hidden="true"
                          >
                            {isParentExpanded ? "v" : ">"}
                          </span>
                          {parent.label}
                          <button
                            type="button"
                            className="feature-panel__input-chip-dismiss"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveParentConnection(parent);
                            }}
                            title={`Remove ${parent.label} mapping`}
                            disabled={disabled}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="feature-panel__mapping-empty">
                      No parent inputs linked.
                    </p>
                  )}
                </div>
                {isParentExpanded && bindingForEditor && (
                  <div className="feature-panel__mapping-editor">
                    <BindingEditor
                      binding={bindingForEditor}
                      targetId={input.id}
                      label={`${input.path} mapping`}
                      standardInputs={standardInputList}
                      standardInputLookup={standardInputLookup}
                      issues={parentIssues}
                      onBindingInputChange={handleParentBindingInputChangeSafe}
                      onBindingRemapChange={handleParentBindingRemapChangeSafe}
                      onAddBindingSlot={handleParentAddSlotSafe}
                      onRemoveBindingSlot={handleParentRemoveSlotSafe}
                      onBindingExpressionChange={
                        handleParentExpressionChangeSafe
                      }
                      onBindingSlotAliasChange={handleParentAliasChangeSafe}
                      onBindingSlotValueTypeChange={
                        onParentBindingSlotValueTypeChange
                      }
                      onBindingOperatorToggle={handleParentOperatorToggleSafe}
                      onBindingOperatorParamChange={
                        handleParentOperatorParamChangeSafe
                      }
                      onResetBinding={
                        parentBinding && !disabled
                          ? () => handleParentResetBindingSafe(input.id)
                          : undefined
                      }
                      expandable={false}
                      featureFlags={featureFlags}
                    />
                  </div>
                )}
              </section>

              <section className="feature-panel__mapping-group feature-panel__mapping-group--children">
                <div className="feature-panel__mapping-header">
                  <div className="feature-panel__mapping-title">
                    <span>Child Controls</span>
                    <span className="feature-panel__mapping-status">
                      {childStatusLabel}
                    </span>
                  </div>
                  <div className="feature-panel__mapping-actions">
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--primary"
                      onClick={handleStartChildSelection}
                      disabled={disabled || childOptions.length === 0}
                    >
                      Add child
                    </button>
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--secondary"
                      onClick={handleToggleChildMappings}
                      disabled={!hasChildMappings}
                    >
                      {childToggleLabel}
                    </button>
                  </div>
                </div>
                <div className="feature-panel__mapping-content">
                  {childMappings.length > 0 ? (
                    <div className="feature-panel__mapping-chips feature-panel__mapping-chips--child">
                      {childMappings.map((mapping) => {
                        const label =
                          mapping.kind === "feature"
                            ? `${mapping.label} (feature)`
                            : mapping.label;
                        const handleRemove = (
                          event: MouseEvent<HTMLButtonElement>,
                        ) => {
                          event.stopPropagation();
                          if (mapping.kind === "input") {
                            handleRemoveChildLink(mapping.targetId);
                          } else {
                            handleRemoveFeatureLink(mapping.targetId);
                          }
                        };
                        const handleChipClick = () => {
                          handleToggleChildMappings();
                        };
                        const handleChipKeyDown = (
                          event: KeyboardEvent<HTMLSpanElement>,
                        ) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleToggleChildMappings();
                          }
                        };
                        const disclosureSymbol = showChildDetails ? "v" : ">";
                        return (
                          <div
                            key={mapping.key}
                            className="feature-panel__child-chip"
                          >
                            <span
                              role="button"
                              tabIndex={0}
                              className="feature-panel__input-chip feature-panel__input-chip--child"
                              data-expanded={showChildDetails}
                              onClick={handleChipClick}
                              onKeyDown={handleChipKeyDown}
                            >
                              <span
                                className="feature-panel__chip-disclosure"
                                aria-hidden="true"
                              >
                                {disclosureSymbol}
                              </span>
                              {label}
                              <button
                                type="button"
                                className="feature-panel__input-chip-dismiss"
                                onClick={handleRemove}
                                title={`Remove ${mapping.label} mapping`}
                                disabled={disabled}
                              >
                                ×
                              </button>
                            </span>
                            {showChildDetails && (
                              <div className="feature-panel__mapping-editor feature-panel__mapping-editor--child">
                                <p className="feature-panel__mapping-empty">
                                  Remap editing now lives in the expression
                                  editor.
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="feature-panel__mapping-empty">
                      No child controls or features linked.
                    </p>
                  )}
                </div>
                {isSelectingChild && (
                  <div className="feature-panel__mapping-child-editor">
                    {childOptions.length > 0 ? (
                      <>
                        <label className="feature-panel__mapping-child-label">
                          <span>Select child</span>
                          <FilterableSelect
                            value={selectedChildId}
                            onChange={handleChildSelectionChange}
                            options={childSelectOptions}
                            placeholder="Select child input…"
                            searchPlaceholder="Search child inputs"
                            noResultsLabel="No matches"
                            className="feature-panel__mapping-child-select feature-tree__binding-slot-combobox"
                            triggerClassName="feature-tree__property-select"
                            menuClassName="feature-tree__binding-slot-menu"
                            listClassName="feature-tree__binding-slot-option-list"
                            filterInputClassName="feature-panel__input-text feature-tree__binding-slot-filter"
                            optionClassName="feature-tree__binding-slot-option"
                            optionHighlightClassName="feature-tree__binding-slot-option--highlighted"
                            emptyClassName="feature-tree__binding-slot-option feature-tree__binding-slot-option--empty"
                            disabled={disabled}
                            dataOptionAttribute="data-option"
                          />
                        </label>
                        <div className="feature-panel__mapping-child-actions">
                          <button
                            type="button"
                            className="feature-panel__input-action feature-panel__input-action--primary"
                            onClick={confirmChildSelection}
                            disabled={disabled || !selectedChildId}
                          >
                            Link child
                          </button>
                          <button
                            type="button"
                            className="feature-panel__input-action feature-panel__input-action--secondary"
                            onClick={cancelChildSelection}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="feature-panel__mapping-empty">
                        No available inputs to assign.
                        <button
                          type="button"
                          className="feature-panel__input-action feature-panel__input-action--secondary"
                          onClick={cancelChildSelection}
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="feature-panel__section">
      <header className="feature-panel__section-header">
        <button
          type="button"
          className="feature-panel__section-toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} standard inputs`}
        />
        <h2 className="feature-panel__section-title">Drivers</h2>
      </header>
      <p className="sidebar__description">
        This section contains the drivers used to control the scene animatables.
        Inputs can be mapped to drive animatable values or be used with other
        inputs through setting parent/child relationships.
      </p>
      {!isCollapsed && (
        <div className="feature-panel__stat-grid">
          <StatBlock label="Bindings" value={driverStats?.bindings ?? "—"} />
          <StatBlock
            label="Targets w/ issues"
            value={driverStats?.issues ?? "—"}
          />
          <StatBlock label="IR nodes" value={driverStats?.nodes ?? "—"} />
          <StatBlock label="Registry" value={driverStats?.registry ?? "—"} />
        </div>
      )}
      {!isCollapsed && (
        <div className="feature-panel__section-body">
          <div className="feature-panel__transport">
            <div className="feature-panel__transport-time">
              <span>Graph time</span>
              <strong>{formattedGraphTime}</strong>
            </div>
            <div className="feature-panel__transport-controls">
              <button
                type="button"
                className="feature-panel__input-action feature-panel__input-action--secondary"
                onClick={handlePlayPauseTransport}
                disabled={transportDisabled}
              >
                {graphPlaybackState === "playing" ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                className="feature-panel__input-action feature-panel__input-action--secondary"
                onClick={handleStopTransport}
                disabled={transportDisabled}
              >
                Stop
              </button>
              <button
                type="button"
                className="feature-panel__input-action feature-panel__input-action--secondary"
                onClick={handleStepTransport}
                disabled={transportDisabled}
              >
                Step
              </button>
            </div>
          </div>
          <div className="feature-panel__input-toolbar">
            <label className="feature-panel__face-id">
              Face
              <input
                type="text"
                value={faceId}
                onChange={handleFaceIdInput}
                spellCheck={false}
              />
            </label>
            {onCapturePose && (
              <div className="feature-panel__input-capture">
                <input
                  type="text"
                  value={capturePoseName}
                  onChange={handleCaptureNameChange}
                  onKeyDown={handleCaptureNameKeyDown}
                  placeholder="Pose name"
                  spellCheck={false}
                  aria-label="Pose name"
                  disabled={capturePoseDisabled}
                />
                <button
                  type="button"
                  className="feature-panel__input-action feature-panel__input-action--primary"
                  onClick={handleCaptureButtonClick}
                  disabled={capturePoseButtonDisabled}
                >
                  Capture pose
                </button>
              </div>
            )}
            <div className="feature-panel__input-filters">
              <span className="feature-panel__input-filters-label">Groups</span>
              <div className="feature-panel__input-filter-chips">
                <button
                  type="button"
                  className="feature-panel__input-filter-chip"
                  data-active={selectedRoots.length === 0}
                  onClick={handleSelectAll}
                >
                  All
                </button>
                {availableRoots.map((root) => (
                  <div
                    key={root}
                    className="feature-panel__input-filter-chip-wrapper"
                  >
                    <button
                      type="button"
                      className="feature-panel__input-filter-chip"
                      data-active={selectedSet.has(root)}
                      onClick={() => handleRootToggle(root)}
                    >
                      {root}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {availableSubgroups.length > 0 && (
              <div className="feature-panel__input-filters">
                <span className="feature-panel__input-filters-label">
                  Subgroups
                </span>
                <div className="feature-panel__input-filter-chips">
                  <button
                    type="button"
                    className="feature-panel__input-filter-chip"
                    data-active={selectedSubgroupSet.size === 0}
                    onClick={handleSubgroupSelectAll}
                  >
                    All
                  </button>
                  {availableSubgroups.map((subgroup) => (
                    <button
                      key={subgroup}
                      type="button"
                      className="feature-panel__input-filter-chip"
                      data-active={selectedSubgroupSet.has(subgroup)}
                      onClick={() => handleSubgroupToggle(subgroup)}
                    >
                      {subgroup}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowDisabled((previous) => !previous)}
              className="feature-panel__input-action feature-panel__input-action--secondary"
              data-active={showDisabled}
              disabled={!showDisabled && totalDisabledInputs === 0}
            >
              {showDisabled
                ? "Hide disabled"
                : `Show disabled${
                    totalDisabledInputs ? ` (${totalDisabledInputs})` : ""
                  }`}
            </button>
            <button
              type="button"
              onClick={onResetAllInputs}
              className="feature-panel__input-action feature-panel__input-action--secondary"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={handleClearCachedState}
              className="feature-panel__input-action feature-panel__input-action--danger"
            >
              Clear cached rig
            </button>
            <button
              type="button"
              onClick={onCreateInput}
              className="feature-panel__input-add"
            >
              Add custom input
            </button>
          </div>

          <div className="feature-panel__beta-zone">
            <div className="feature-panel__beta-flags">
              <h4>Expression-first betas</h4>
              {betaFlagOptions.map(({ key, label }) => (
                <label key={key} className="feature-panel__beta-flag">
                  <input
                    type="checkbox"
                    checked={featureFlags[key] ?? false}
                    onChange={(event) =>
                      onFeatureFlagChange(key, event.target.checked)
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="feature-panel__insights">
              {graphInsights ? (
                <>
                  <p>
                    Last build:{" "}
                    {new Date(graphInsights.generatedAt).toLocaleString()}
                  </p>
                  <p>
                    {graphInsights.summary.bindings} bindings ·{" "}
                    {graphInsights.issues.fatal.length} fatal issues
                  </p>
                </>
              ) : (
                <p>
                  No IR snapshot captured yet. Build the rig to populate it.
                </p>
              )}
              <div className="feature-panel__insights-actions">
                <button
                  type="button"
                  className="feature-panel__input-action feature-panel__input-action--secondary"
                  onClick={handleDownloadIr}
                >
                  Download IR JSON
                </button>
                {featureFlags.irInspectorBeta && (
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    data-active={inspectorOpen ? "true" : "false"}
                    onClick={() => setInspectorOpen((previous) => !previous)}
                    disabled={!graphReport}
                  >
                    {inspectorOpen ? "Hide IR inspector" : "Open IR inspector"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {issueEntries.length > 0 && (
            <div className="feature-panel__issue-controls">
              <div>
                <strong>{totalIssueCount}</strong> issue
                {totalIssueCount === 1 ? "" : "s"} across {issueEntries.length}{" "}
                binding
                {issueEntries.length === 1 ? "" : "s"}
              </div>
              <button
                type="button"
                className="feature-panel__input-action feature-panel__input-action--secondary"
                data-active={issuePanelOpen ? "true" : "false"}
                onClick={() => setIssuePanelOpen((previous) => !previous)}
              >
                {issueToggleLabel}
              </button>
            </div>
          )}

          {issuePanelOpen && (
            <IssueListPanel
              entries={filteredIssueEntries}
              totalTargets={issueEntries.length}
              totalIssues={totalIssueCount}
              filter={issueFilter}
              onFilterChange={setIssueFilter}
              onReveal={handleRevealIssueTarget}
            />
          )}

          {featureFlags.irInspectorBeta && (
            <IrInspectorDrawer
              open={inspectorOpen}
              report={graphReport}
              onClose={() => setInspectorOpen(false)}
              onDownloadIr={handleDownloadIr}
              onDownloadReport={handleDownloadMachineReport}
            />
          )}

          {graphAlert}

          {emptyMessage ? (
            <p className="feature-panel__inputs-empty">{emptyMessage}</p>
          ) : (
            <div className="feature-panel__inputs">
              {filteredInputs.map(renderInputCard)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface IssueListPanelProps {
  entries: IssueEntry[];
  totalTargets: number;
  totalIssues: number;
  filter: string;
  onFilterChange(value: string): void;
  onReveal(targetId: string): void;
}

function IssueListPanel({
  entries,
  totalTargets,
  totalIssues,
  filter,
  onFilterChange,
  onReveal,
}: IssueListPanelProps) {
  const handleFilterChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onFilterChange(event.target.value);
    },
    [onFilterChange],
  );

  return (
    <div className="feature-panel__issue-panel">
      <div className="feature-panel__issue-panel-filter">
        <label>
          <span>Filter binding issues</span>
          <input
            type="text"
            value={filter}
            onChange={handleFilterChange}
            placeholder="Search by id or message"
            className="feature-panel__input-text"
          />
        </label>
        <span>
          Showing {entries.length} of {totalTargets} targets ({totalIssues}{" "}
          issues)
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="feature-panel__issue-panel-empty">
          No bindings match the current filter.
        </p>
      ) : (
        <div className="feature-panel__issue-list">
          {entries.map((entry) => (
            <div key={entry.targetId} className="feature-panel__issue-entry">
              <div className="feature-panel__issue-entry-header">
                <div className="feature-panel__issue-entry-meta">
                  <span className="feature-panel__issue-entry-label">
                    {entry.label}
                  </span>
                  <code className="feature-panel__issue-entry-code">
                    {entry.targetId}
                  </code>
                  {entry.rootKey && (
                    <span className="feature-panel__issue-entry-root">
                      · {entry.rootKey}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="feature-panel__input-action feature-panel__input-action--secondary"
                  onClick={() => onReveal(entry.targetId)}
                  disabled={!entry.isStandardInput}
                  title={
                    entry.isStandardInput
                      ? "Reveal this input card"
                      : "Issue targets a non-standard binding"
                  }
                >
                  Reveal
                </button>
              </div>
              <ul className="feature-panel__issue-entry-list">
                {entry.issues.map((issue, index) => (
                  <li key={`${entry.targetId}-${index}`}>{issue}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface IrInspectorDrawerProps {
  open: boolean;
  report: MachineReport | null;
  onClose(): void;
  onDownloadIr(): void;
  onDownloadReport(): void;
}

const IR_DIFF_LIMIT = 200;
const BUG_REPORT_DIFF_PREVIEW_LIMIT = 8;

function IrInspectorDrawer({
  open,
  report,
  onClose,
  onDownloadIr,
  onDownloadReport,
}: IrInspectorDrawerProps) {
  const [diffText, setDiffText] = useState("");
  const [diffResult, setDiffResult] = useState<MachineDiffResult | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [cliFeedback, setCliFeedback] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [bugTemplateFeedback, setBugTemplateFeedback] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const [graphJson, setGraphJson] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && report?.irGraph) {
      setGraphJson(JSON.stringify(report.irGraph, null, 2));
    } else {
      setGraphJson(null);
    }
  }, [open, report]);

  useEffect(() => {
    if (!open) {
      setDiffText("");
      setDiffResult(null);
      setDiffError(null);
      setCopyFeedback("idle");
      setCliFeedback("idle");
      setBugTemplateFeedback("idle");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open]);

  const bindingCount = report?.summary.bindings.length ?? 0;
  const fatalCount = report?.issues.fatal.length ?? 0;
  const issueTargetCount = report
    ? Object.keys(report.issues.byTarget ?? {}).length
    : 0;
  const nodeCount = report?.irGraph?.nodes.length ?? 0;
  const edgeCount = report?.irGraph?.edges.length ?? 0;
  const constantCount = report?.irGraph?.constants.length ?? 0;
  const registryVersion = report?.irGraph?.metadata?.registryVersion ?? "—";

  const bugReportTemplate = useMemo(() => {
    if (!report || !diffResult) {
      return null;
    }
    return buildBugReportTemplate(report, diffResult);
  }, [diffResult, report]);

  const handleCopyReport = useCallback(async () => {
    if (!report) {
      return;
    }
    const payload = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard?.writeText(payload);
      setCopyFeedback("copied");
      setTimeout(() => setCopyFeedback("idle"), 1500);
    } catch (error) {
      console.warn("[vizij-authoring] Failed to copy IR report", error);
      setCopyFeedback("error");
    }
  }, [report]);

  const handleCliCommand = useCallback(async () => {
    if (!report) {
      return;
    }
    try {
      const command = buildVizijIrDiffCommand(report.faceId);
      await navigator.clipboard?.writeText(command);
      setCliFeedback("copied");
      setTimeout(() => setCliFeedback("idle"), 1500);
    } catch (error) {
      console.warn("[vizij-authoring] Failed to copy CLI command", error);
      setCliFeedback("error");
      setTimeout(() => setCliFeedback("idle"), 1500);
    }
  }, [report]);

  const handleDiffCompare = useCallback(() => {
    if (!report) {
      setDiffError("Generate a current IR snapshot before diffing.");
      return;
    }
    const trimmed = diffText.trim();
    if (!trimmed) {
      setDiffError("Paste a machine report (vizij-ir-report --dump) first.");
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!isMachineReportCandidate(parsed)) {
        throw new Error(
          "Input is not a machine report. Use `vizij-ir-report --dump` or paste an exported report.",
        );
      }
      const diff = diffMachineReports(report, parsed, {
        limit: IR_DIFF_LIMIT,
      });
      setDiffResult(diff);
      setDiffError(null);
    } catch (error) {
      setDiffResult(null);
      setDiffError(error instanceof Error ? error.message : String(error));
    }
  }, [diffText, report]);

  const handleDiffFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setDiffText(reader.result);
        }
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleClearDiff = useCallback(() => {
    setDiffText("");
    setDiffResult(null);
    setDiffError(null);
    setBugTemplateFeedback("idle");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleCopyBugTemplate = useCallback(async () => {
    if (!bugReportTemplate) {
      return;
    }
    try {
      await navigator.clipboard?.writeText(bugReportTemplate);
      setBugTemplateFeedback("copied");
      setTimeout(() => setBugTemplateFeedback("idle"), 1500);
    } catch (error) {
      console.warn("[vizij-authoring] Failed to copy bug template", error);
      setBugTemplateFeedback("error");
      setTimeout(() => setBugTemplateFeedback("idle"), 1500);
    }
  }, [bugReportTemplate]);

  if (!open) {
    return null;
  }

  return (
    <section className="feature-panel__drawer" aria-label="IR inspector">
      <div className="feature-panel__drawer-header">
        <div>
          <h4>IR inspector</h4>
          {report && <span>Face: {report.faceId}</span>}
        </div>
        <button
          type="button"
          className="feature-panel__input-action feature-panel__input-action--secondary"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      {report ? (
        <>
          <div className="feature-panel__drawer-summary">
            <div className="feature-panel__drawer-summary-grid">
              <StatBlock label="Bindings" value={bindingCount} />
              <StatBlock label="Fatal issues" value={fatalCount} />
              <StatBlock label="Targets w/ issues" value={issueTargetCount} />
              <StatBlock label="IR nodes" value={nodeCount} />
              <StatBlock label="Edges" value={edgeCount} />
              <StatBlock label="Constants" value={constantCount} />
              <StatBlock label="Registry" value={registryVersion} />
            </div>
            <div className="feature-panel__drawer-actions">
              <button
                type="button"
                className="feature-panel__input-action feature-panel__input-action--secondary"
                onClick={onDownloadIr}
              >
                Download IR JSON
              </button>
              <button
                type="button"
                className="feature-panel__input-action feature-panel__input-action--secondary"
                data-state={copyFeedback}
                onClick={handleCopyReport}
              >
                {copyFeedback === "copied"
                  ? "Report copied"
                  : "Copy machine report"}
              </button>
              <button
                type="button"
                className="feature-panel__input-action feature-panel__input-action--secondary"
                data-state={cliFeedback}
                onClick={() => {
                  onDownloadReport();
                  handleCliCommand();
                }}
              >
                {cliFeedback === "copied"
                  ? "vizij-ir-report cmd copied"
                  : "Prep vizij-ir-report diff"}
              </button>
            </div>
          </div>
          {graphJson ? (
            <details className="feature-panel__drawer-graph">
              <summary>IR graph payload</summary>
              <pre>{graphJson}</pre>
            </details>
          ) : (
            <p className="feature-panel__drawer-note">
              BuildGraphResult did not include an IR payload for this snapshot.
            </p>
          )}
        </>
      ) : (
        <p className="feature-panel__drawer-note">
          No IR snapshot available. Run a successful build to populate this
          view.
        </p>
      )}
      <div className="feature-panel__drawer-diff">
        <h5>Diff against saved report</h5>
        <p>
          Paste output from <code>vizij-ir-report --dump</code> or upload a
          machine report JSON to compare against the current build.
        </p>
        <textarea
          value={diffText}
          onChange={(event) => setDiffText(event.target.value)}
          placeholder="Paste machine report JSON…"
          className="feature-panel__drawer-diff-input"
          rows={6}
          spellCheck={false}
        />
        <div className="feature-panel__drawer-diff-actions">
          <label className="feature-panel__drawer-file">
            <span>Upload</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleDiffFileChange}
            />
          </label>
          <div className="feature-panel__drawer-diff-buttons">
            <button
              type="button"
              className="feature-panel__input-action feature-panel__input-action--secondary"
              onClick={handleDiffCompare}
              disabled={!report || diffText.trim().length === 0}
            >
              Compare
            </button>
            <button
              type="button"
              className="feature-panel__input-action feature-panel__input-action--secondary"
              onClick={handleClearDiff}
              disabled={!diffText && !diffResult}
            >
              Clear
            </button>
          </div>
        </div>
        {diffError && (
          <p className="feature-panel__drawer-error">{diffError}</p>
        )}
        {diffResult && (
          <>
            <DiffResultList
              limitReached={diffResult.limitReached}
              entries={diffResult.differences}
            />
            {bugReportTemplate && (
              <div className="feature-panel__drawer-diff-actions feature-panel__drawer-diff-actions--template">
                <button
                  type="button"
                  className="feature-panel__input-action feature-panel__input-action--secondary"
                  data-state={bugTemplateFeedback}
                  onClick={handleCopyBugTemplate}
                >
                  {bugTemplateFeedback === "copied"
                    ? "Bug template copied"
                    : "Copy bug report template"}
                </button>
                <small>
                  Captures the diff summary and CLI repro steps for filing
                  regressions.
                </small>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

interface StatBlockProps {
  label: string;
  value: string | number;
  helper?: string;
  tone?: "success" | "warning";
}

function StatBlock({ label, value, helper, tone }: StatBlockProps) {
  return (
    <div
      className={`feature-panel__drawer-stat${
        tone ? ` feature-panel__drawer-stat--${tone}` : ""
      }`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {helper && <small>{helper}</small>}
    </div>
  );
}

interface DiffResultListProps {
  entries: MachineDiffEntry[];
  limitReached: boolean;
}

function DiffResultList({ entries, limitReached }: DiffResultListProps) {
  if (!entries.length) {
    return (
      <p className="feature-panel__drawer-diff-note">
        No differences detected.
      </p>
    );
  }
  return (
    <div className="feature-panel__drawer-diff-results">
      <p>
        {entries.length} difference{entries.length === 1 ? "" : "s"}
        {limitReached ? " (diff limit reached)" : null}
      </p>
      <ul>
        {entries.map((entry, index) => (
          <li key={`${entry.path}-${index}`}>
            <code>{entry.path}</code> – {entry.kind}
            {entry.kind === "mismatch" && (
              <>
                : expected {formatDiffValue(entry.expected)}, actual{" "}
                {formatDiffValue(entry.actual)}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value.length > 60 ? `${value.slice(0, 57)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const asString = JSON.stringify(value);
    return asString.length > 60 ? `${asString.slice(0, 57)}…` : asString;
  } catch {
    return String(value);
  }
}

function isMachineReportCandidate(value: unknown): value is MachineReport {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<MachineReport>;
  return (
    typeof candidate.reportVersion === "number" &&
    typeof candidate.summary === "object" &&
    typeof candidate.issues === "object"
  );
}

function buildVizijIrDiffCommand(faceId?: string | null): string {
  const safeFaceId =
    faceId && faceId.trim().length > 0 ? faceId.trim() : "vizij";
  return `vizij-ir-report --diff ${safeFaceId}_machine-report.json saved-report.json`;
}

function buildBugReportTemplate(
  report: MachineReport,
  diff: MachineDiffResult,
): string {
  const previewEntries = diff.differences.slice(
    0,
    BUG_REPORT_DIFF_PREVIEW_LIMIT,
  );
  const diffSummary =
    previewEntries.length > 0
      ? previewEntries.map(formatDiffEntrySummary).join("\n")
      : "- No structural differences captured.";
  const remaining = diff.differences.length - previewEntries.length;
  const remainderLine =
    remaining > 0
      ? `\n…plus ${remaining} additional difference${remaining === 1 ? "" : "s"}.`
      : "";
  const registry = report.irGraph?.metadata?.registryVersion ?? "—";
  const faceLabel =
    report.faceId && report.faceId.trim().length > 0
      ? report.faceId.trim()
      : "unknown";
  const diffCommand = buildVizijIrDiffCommand(report.faceId);
  const timestamp = new Date().toISOString();

  return `### IR dual-run divergence report

- Face: ${faceLabel}
- Registry: ${registry}
- Bindings captured: ${report.summary.bindings.length}
- Fatal issues: ${report.issues.fatal.length}
- Diff limit reached: ${diff.limitReached ? "yes" : "no"}

#### Diff summary (${previewEntries.length}${remaining > 0 ? "+" : ""})
${diffSummary}${remainderLine}

#### Suggested reproduction steps
1. Export the current machine report (Drivers ▸ IR inspector ▸ Download machine report).
2. Run \`${diffCommand}\`.
3. Attach the exported IR JSON, baseline report, and diff output.

#### Notes
- Observed at ${timestamp}
- Add expectations / extra context here.
`;
}

function formatDiffEntrySummary(entry: MachineDiffEntry): string {
  const path = entry.path || "/";
  switch (entry.kind) {
    case "missing":
      return `- missing ${path} (expected ${formatDiffValue(entry.expected)})`;
    case "unexpected":
      return `- unexpected ${path} (actual ${formatDiffValue(entry.actual)})`;
    default:
      return `- mismatch ${path} (expected ${formatDiffValue(
        entry.expected,
      )}, actual ${formatDiffValue(entry.actual)})`;
  }
}
