import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Trash2,
  Plus,
  Info,
  ChevronRight,
  Sliders,
  Palette,
  Box,
  Play,
} from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { Popover as BasePopover } from "@base-ui/react";
import { Button } from "../ui/Button";
import { Slider } from "../ui/Slider";
import { NumberField } from "../ui/NumberField";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Switch } from "../ui/Switch";
import { usePoseRig } from "../../state/PoseRigProvider";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import type {
  SceneFeatureComponent,
  SceneObjectFeature,
} from "../../scene/sceneGraph";
import { useUnifiedSelection } from "../../hooks/useUnifiedSelection";
import { cn } from "../../utils/cn";
import { rgbToHex, hexToRgb } from "../../utils/color";
import { promptDialog, alertDialog } from "../../utils/dialogs";
import { cleanLabel } from "../../utils/labels";
import { BindingEditor } from "../binding";
import { EmptyState } from "../ui/EmptyState";
import { RiggingPropertyRow, ScrubbableLabel } from "./RiggingPropertyRow";
import { VariableSelector, type VariableSelection } from "./VariableSelector";
import { InspectorHeader } from "./InspectorHeader";
import { RiggingTransformSection } from "./RiggingTransformSection";
import { BindingConnections } from "./BindingConnections";
import { RiggingMorphTargetsSection } from "./RiggingMorphTargetsSection";
import { FeatureList } from "./FeatureList";
import {
  RiggingMaterialSection,
  RiggingScalarRow,
  RiggingColorRow,
} from "./RiggingMaterialSection";
import {
  collectDirectDownstreamRigInputs,
  collectRigDependents,
} from "./rigConnections";
import { resolveSelectionTargetIds } from "./bindingSelection";
import {
  classifyPoseParentBindingEmptyState,
  hasParentBindingInput,
  resolveRigDrivenSelection,
} from "./inspectorActions";
import { resolveControllableInputId } from "./bindingSlotResolution";

type PoseVariableItem =
  | {
      type: "scalar";
      varId: string;
      poseVal: number;
      drivenPropertyCount: number;
      drivenVariableCount: number;
    }
  | {
      type: "color";
      label: string;
      featureId: string;
      components: {
        varId: string;
        poseVal: number;
        channel: "r" | "g" | "b";
      }[];
    };

type InspectorChainMode = "scene" | "rig" | "pose";

type InspectorChainNode = {
  mode: InspectorChainMode;
  id: string;
  label: string;
  view?: "quick" | "features" | "bindings";
  targetId?: string;
};

export function InspectorContent() {
  const [showSelector, setShowSelector] = useState(false);
  const [rigAddMode, setRigAddMode] = useState<"property" | "variable">(
    "property",
  );
  const [blendAmount, setBlendAmount] = useState(0);
  const [sceneInspectorView, setSceneInspectorView] = useState<
    "quick" | "features" | "bindings"
  >("quick");
  const [rigInspectorView, setRigInspectorView] = useState<
    "quick" | "bindings"
  >("quick");
  const scrubValuesRef = useRef<Record<string, number>>({});
  const pendingSceneInspectorViewRef = useRef<
    "quick" | "features" | "bindings" | null
  >(null);
  const pendingRigInspectorViewRef = useRef<"quick" | "bindings" | null>(null);
  const pendingChainNavigationRef = useRef<InspectorChainNode | null>(null);
  const [inspectorChainPath, setInspectorChainPath] = useState<
    InspectorChainNode[]
  >([]);
  const [focusedSceneBindingTargetId, setFocusedSceneBindingTargetId] =
    useState<string | null>(null);
  const [poseBindingEditorInputId, setPoseBindingEditorInputId] = useState<
    string | null
  >(null);
  const [rigDrivenBindingTargetId, setRigDrivenBindingTargetId] = useState<
    string | null
  >(null);

  // Hooks
  const {
    selectedId,
    selectedPoseId,
    selectedRigId,
    selectedMaterialId,
    handleSelectObject,
    handleSelectPose,
    handleSelectRig,
    inspectorMode,
  } = useUnifiedSelection();

  const {
    getNode,
    objects,
    materials,
    updateMaterialLabel,
    setAnimatableValue,
    setFeatureAnimated,
  } = useSceneComposer();

  const {
    poses,
    updatePoseValue,
    applyPose,
    removePoseInput,
    updatePoseName,
    updatePoseGroup,
  } = usePoseRig();

  const {
    managedStandardInputs,
    handleInputValueChange,
    applyStandardInputBatch,
    inputValues,
    bindings,
    bindingIssues,
    inputBindings,
    handleCreateCustomStandardInput,
    handleUpdateStandardInput,
    handleRenameShape,
    handleBindingInputChange,
    handleAddBindingSlot,
    handleRemoveBindingSlot,
    handleUpdateBindingExpression,
    handleUpdateBindingSlotAlias,
    handleBindingSlotValueTypeChange,
    handleResetBinding,
    handleEnsureParentBinding,
    handleParentBindingInputChange,
    handleParentAddBindingSlot,
    handleParentRemoveBindingSlot,
    handleParentBindingExpressionChange,
    handleParentBindingSlotAliasChange,
    handleParentBindingSlotValueTypeChange,
    handleParentResetBinding,
    handleEnableParentLocalControl,
    handleCreateParentDriverBinding,
    standardInputs,
    standardInputsById,
  } = useBindingAuthoring((state) => state);

  const graphStatus = useGraphRuntime((state) => state.graphStatus);
  const graphError = useGraphRuntime((state) => state.graphError);
  const graphWarning = useGraphRuntime((state) => state.graphWarning);
  const bindingIssueCount = useBindingAuthoring((state) =>
    Array.from(state.bindingIssues.values()).reduce(
      (count, issues) => count + issues.length,
      0,
    ),
  );

  // Reset blend amount when selected pose changes
  useEffect(() => {
    setBlendAmount(0);
  }, [selectedPoseId]);

  useEffect(() => {
    if (inspectorMode !== "scene") {
      return;
    }
    const nextView = pendingSceneInspectorViewRef.current;
    if (nextView) {
      setSceneInspectorView(nextView);
      pendingSceneInspectorViewRef.current = null;
      return;
    }
    setSceneInspectorView("quick");
  }, [inspectorMode, selectedId, selectedMaterialId]);

  useEffect(() => {
    if (inspectorMode !== "rig" || !selectedRigId) {
      setRigDrivenBindingTargetId(null);
      return;
    }
    const nextView = pendingRigInspectorViewRef.current;
    if (nextView) {
      setRigInspectorView(nextView);
      pendingRigInspectorViewRef.current = null;
      return;
    }
    setRigInspectorView("quick");
  }, [inspectorMode, selectedRigId]);

  useEffect(() => {
    if (inspectorMode !== "pose" || !selectedPoseId) {
      setPoseBindingEditorInputId(null);
    }
  }, [inspectorMode, selectedPoseId]);

  const targetOwnerById = (() => {
    const targetOwners = new Map<string, string>();
    objects.forEach((objectNode) => {
      objectNode.features.forEach((feature) => {
        feature.components.forEach((component) => {
          if (!component.targetId) {
            return;
          }
          targetOwners.set(component.targetId, objectNode.id);
        });
      });
    });
    return targetOwners;
  })();

  const targetLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    objects.forEach((objectNode) => {
      objectNode.features.forEach((feature) => {
        feature.components.forEach((component) => {
          if (!component.targetId) {
            return;
          }
          const componentLabel =
            component.label?.trim() || component.componentKey || "Value";
          labels.set(
            component.targetId,
            `${objectNode.name} · ${feature.label} ${componentLabel}`,
          );
        });
      });
    });
    return labels;
  }, [objects]);

  const sceneNodeById = useMemo(
    () => new Map(objects.map((objectNode) => [objectNode.id, objectNode])),
    [objects],
  );

  const rigInputById = useMemo(
    () =>
      new Map(
        managedStandardInputs.map((entry) => [entry.input.id, entry.input]),
      ),
    [managedStandardInputs],
  );

  const poseById = useMemo(
    () => new Map(poses.map((pose) => [pose.id, pose])),
    [poses],
  );

  const currentInspectorChainNode = useMemo(() => {
    if (inspectorMode === "scene" && selectedId) {
      const sceneNode = sceneNodeById.get(selectedId);
      return {
        mode: "scene" as const,
        id: selectedId,
        label: sceneNode?.name || selectedId,
        view: sceneInspectorView,
      };
    }
    if (inspectorMode === "rig" && selectedRigId) {
      const rig = rigInputById.get(selectedRigId);
      return {
        mode: "rig" as const,
        id: selectedRigId,
        label: rig?.label || selectedRigId,
        view: rigInspectorView,
      };
    }
    if (inspectorMode === "pose" && selectedPoseId) {
      const pose = poseById.get(selectedPoseId);
      return {
        mode: "pose" as const,
        id: selectedPoseId,
        label: pose?.name || selectedPoseId,
      };
    }
    return null;
  }, [
    inspectorMode,
    poseById,
    rigInputById,
    rigInspectorView,
    sceneInspectorView,
    sceneNodeById,
    selectedId,
    selectedPoseId,
    selectedRigId,
  ]);

  useEffect(() => {
    if (!currentInspectorChainNode) {
      pendingChainNavigationRef.current = null;
      setInspectorChainPath([]);
      return;
    }
    const pending = pendingChainNavigationRef.current;
    if (
      pending &&
      pending.mode === currentInspectorChainNode.mode &&
      pending.id === currentInspectorChainNode.id
    ) {
      setInspectorChainPath((current) => {
        if (current.length === 0) {
          return [currentInspectorChainNode];
        }
        const existingIndex = current.findIndex(
          (entry) =>
            entry.mode === currentInspectorChainNode.mode &&
            entry.id === currentInspectorChainNode.id,
        );
        if (existingIndex >= 0) {
          return current.slice(0, existingIndex + 1);
        }
        return [...current, currentInspectorChainNode];
      });
      pendingChainNavigationRef.current = null;
      return;
    }
    pendingChainNavigationRef.current = null;
    setInspectorChainPath((current) => {
      if (current.length === 0) {
        return [currentInspectorChainNode];
      }
      const lastEntry = current[current.length - 1];
      if (
        lastEntry.mode === currentInspectorChainNode.mode &&
        lastEntry.id === currentInspectorChainNode.id
      ) {
        const next = [...current];
        next[next.length - 1] = currentInspectorChainNode;
        return next;
      }
      return [currentInspectorChainNode];
    });
  }, [currentInspectorChainNode]);

  useEffect(() => {
    if (inspectorMode !== "scene" || sceneInspectorView !== "bindings") {
      setFocusedSceneBindingTargetId(null);
      return;
    }
    if (!selectedId || !focusedSceneBindingTargetId) {
      return;
    }
    const selectedNode = sceneNodeById.get(selectedId);
    const hasTarget =
      selectedNode?.features.some((feature: SceneObjectFeature) =>
        feature.components.some(
          (component: SceneFeatureComponent) =>
            component.targetId === focusedSceneBindingTargetId,
        ),
      ) ?? false;
    if (!hasTarget) {
      setFocusedSceneBindingTargetId(null);
    }
  }, [
    focusedSceneBindingTargetId,
    inspectorMode,
    sceneInspectorView,
    sceneNodeById,
    selectedId,
  ]);

  const navigateWithChain = (
    node: InspectorChainNode,
    navigate: () => void,
  ) => {
    pendingChainNavigationRef.current = node;
    navigate();
  };

  const renderChainPath = () => {
    if (inspectorChainPath.length <= 1) {
      return null;
    }
    return (
      <div className="flex items-center gap-1 flex-wrap px-1 py-0.5 mb-1">
        <span className="text-[9px] uppercase tracking-wider font-bold text-text-muted">
          Chain
        </span>
        {inspectorChainPath.map((entry, index) => {
          const isLast = index === inspectorChainPath.length - 1;
          return (
            <React.Fragment key={`${entry.mode}:${entry.id}:${index}`}>
              <button
                type="button"
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                  isLast
                    ? "border-accent/40 text-accent bg-accent/10 cursor-default"
                    : "border-border-default/40 text-text-secondary hover:text-text-primary hover:border-border-default",
                )}
                disabled={isLast}
                onClick={() => {
                  setInspectorChainPath((current) =>
                    current.slice(0, index + 1),
                  );
                  pendingChainNavigationRef.current = entry;
                  if (entry.mode === "scene") {
                    pendingSceneInspectorViewRef.current =
                      entry.view ?? "bindings";
                    setFocusedSceneBindingTargetId(entry.targetId ?? null);
                    handleSelectObject(entry.id);
                    return;
                  }
                  if (entry.mode === "rig") {
                    pendingRigInspectorViewRef.current =
                      entry.view === "bindings" ? "bindings" : "quick";
                    handleSelectRig(entry.id);
                    return;
                  }
                  handleSelectPose(entry.id);
                }}
              >
                {entry.label}
              </button>
              {!isLast && (
                <ChevronRight size={10} className="text-text-muted/70" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderAuthoringStatus = () => {
    const statusTone =
      graphStatus === "ready"
        ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
        : graphStatus === "loading"
          ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
          : graphStatus === "error"
            ? "text-red-300 border-red-500/40 bg-red-500/10"
            : "text-text-muted border-border-default/50 bg-bg-panel/30";
    return (
      <div className="flex items-center gap-1.5 flex-wrap px-1 py-0.5 mb-1">
        <span
          className={cn(
            "text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide",
            statusTone,
          )}
        >
          Compile {graphStatus}
        </span>
        {graphWarning ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 truncate max-w-[260px]">
            {graphWarning}
          </span>
        ) : null}
        {graphError ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-200 truncate max-w-[260px]">
            {graphError}
          </span>
        ) : null}
        <span className="text-[9px] px-1.5 py-0.5 rounded border border-border-default/50 bg-bg-panel/30 text-text-muted">
          Binding issues {bindingIssueCount}
        </span>
      </div>
    );
  };

  const openSceneBindingInspector = (targetId: string) => {
    const objectId = targetOwnerById.get(targetId);
    if (!objectId) {
      return;
    }
    const objectNode = sceneNodeById.get(objectId);
    setFocusedSceneBindingTargetId(targetId);
    pendingSceneInspectorViewRef.current = "bindings";
    navigateWithChain(
      {
        mode: "scene",
        id: objectId,
        label: objectNode?.name || objectId,
        view: "bindings",
        targetId,
      },
      () => handleSelectObject(objectId),
    );
  };

  const openPoseInspector = (poseId: string) => {
    const pose = poseById.get(poseId);
    navigateWithChain(
      {
        mode: "pose",
        id: poseId,
        label: pose?.name || poseId,
      },
      () => handleSelectPose(poseId),
    );
  };

  const openRigInspector = (
    rigId: string,
    view: "quick" | "bindings" = "quick",
  ) => {
    const rig = rigInputById.get(rigId);
    pendingRigInspectorViewRef.current = view;
    navigateWithChain(
      {
        mode: "rig",
        id: rigId,
        label: rig?.label || rigId,
        view,
      },
      () => handleSelectRig(rigId),
    );
  };

  const handleRequestCreateStandardInput = (suggestedPath?: string) => {
    const response = promptDialog(
      "Enter the rig path for the new standard input (e.g., /eyes/blink)",
      suggestedPath ?? "/",
    );
    if (response === null) {
      return null;
    }
    const trimmed = response.trim();
    if (!trimmed) {
      alertDialog("Path cannot be empty.");
      return null;
    }
    return handleCreateCustomStandardInput(trimmed);
  };

  // 1. Scene Object Mode
  if (inspectorMode === "scene" && selectedId) {
    const node = getNode(selectedId);
    if (node) {
      return (
        <div className="flex flex-col gap-1 p-1">
          <InspectorHeader
            name={node.name || node.id}
            typeLabel={node.type}
            id={node.id}
            onNameChange={(name) => handleRenameShape(node.id, name)}
          />
          {renderChainPath()}
          {renderAuthoringStatus()}
          <div className="flex items-center gap-1 px-1 py-1">
            <Button
              variant={sceneInspectorView === "quick" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setSceneInspectorView("quick")}
            >
              Quick
            </Button>
            <Button
              variant={
                sceneInspectorView === "features" ? "secondary" : "ghost"
              }
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setSceneInspectorView("features")}
            >
              Feature Matrix
            </Button>
            <Button
              variant={
                sceneInspectorView === "bindings" ? "secondary" : "ghost"
              }
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setSceneInspectorView("bindings")}
            >
              My Drivers
            </Button>
          </div>
          {sceneInspectorView === "quick" ? (
            <>
              <div className="flex flex-col gap-1 p-1.5 bg-bg-panel/40 rounded-lg border border-border-default/50">
                <div className="text-[9px] font-bold text-text-secondary uppercase tracking-wider px-0.5">
                  Animation State
                </div>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                  {node.features.map((feature) => (
                    <div
                      key={feature.id}
                      className="flex items-center justify-between gap-2 px-1.5 py-1 rounded bg-bg-panel/30 border border-border-default/40"
                    >
                      <span className="text-[11px] text-text-primary truncate">
                        {feature.label}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[9px] uppercase tracking-wide text-text-muted">
                          {feature.animated ? "Animated" : "Static"}
                        </span>
                        <Switch
                          checked={feature.animated}
                          onChange={(checked) =>
                            setFeatureAnimated(node.id, feature.id, checked)
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <RiggingTransformSection node={node} />
              <RiggingMorphTargetsSection node={node} />
              <RiggingMaterialSection node={node} />
              <BindingConnections
                node={node}
                onSelectPose={openPoseInspector}
                onSelectRig={(rigId) => openRigInspector(rigId, "quick")}
                onSelectTarget={openSceneBindingInspector}
              />
            </>
          ) : sceneInspectorView === "features" ? (
            <FeatureList node={node} mode="features" />
          ) : (
            <FeatureList
              node={node}
              mode="bindings"
              focusedTargetId={focusedSceneBindingTargetId}
            />
          )}
        </div>
      );
    }
  }

  // 2. Pose Mode
  if (inspectorMode === "pose" && selectedPoseId) {
    const pose = poses.find((p) => p.id === selectedPoseId);
    if (pose) {
      // Grouping Logic for Pose
      const groupedVariables = (() => {
        const targetToFeature: Record<
          string,
          {
            featureId: string;
            featureKey: string;
            objectId: string;
            objectName: string;
            componentKey: string;
          }
        > = {};
        for (const obj of objects) {
          for (const feat of obj.features) {
            for (const comp of feat.components) {
              if (comp.targetId) {
                targetToFeature[comp.targetId] = {
                  featureId: feat.id,
                  featureKey: feat.key,
                  objectId: obj.id,
                  objectName: obj.name,
                  componentKey: comp.componentKey || comp.label,
                };
              }
            }
          }
        }

        const groups: Record<
          string,
          { label: string; items: PoseVariableItem[] }
        > = {};
        const colorFeatures: Record<
          string,
          {
            label: string;
            featureId: string;
            groupKey: string;
            components: {
              varId: string;
              poseVal: number;
              channel: "r" | "g" | "b";
            }[];
          }
        > = {};

        Object.entries(pose.values).forEach(([varId, val]) => {
          const mInput = managedStandardInputs.find(
            (m) => m.input.id === varId,
          );
          const inputDef = mInput?.input;
          let groupKey = "Unassigned";
          let groupLabel = "Unassigned";

          let featureInfo = null;
          for (const [targetId, binding] of Object.entries(bindings)) {
            if (
              binding.inputId === varId ||
              (binding.slots && binding.slots.some((s) => s.inputId === varId))
            ) {
              if (targetToFeature[targetId]) {
                featureInfo = targetToFeature[targetId];
                groupKey = `obj:${featureInfo.objectId} `;
                groupLabel = featureInfo.objectName;
                break;
              }
            }
          }

          if (!featureInfo && inputDef?.group) {
            groupKey = `group:${inputDef.group} `;
            groupLabel = inputDef.group;
          }

          if (featureInfo && featureInfo.featureKey.toLowerCase() === "color") {
            const colorKey = `${featureInfo.objectId}:${featureInfo.featureId} `;
            if (!colorFeatures[colorKey]) {
              colorFeatures[colorKey] = {
                label: "Color",
                featureId: featureInfo.featureId,
                groupKey,
                components: [],
              };
            }
            const channel = featureInfo.componentKey.toLowerCase() as
              | "r"
              | "g"
              | "b";
            colorFeatures[colorKey].components.push({
              varId,
              poseVal: val,
              channel,
            });
          } else {
            if (!groups[groupKey])
              groups[groupKey] = { label: groupLabel, items: [] };
            const drivenPropertyCount = collectRigDependents({
              selectedRigId: varId,
              bindings,
              inputBindings,
              objects,
            }).length;
            const drivenVariableCount = collectDirectDownstreamRigInputs({
              selectedRigId: varId,
              inputBindings,
              standardInputsById,
            }).length;
            groups[groupKey].items.push({
              type: "scalar",
              varId,
              poseVal: val,
              drivenPropertyCount,
              drivenVariableCount,
            });
          }
        });

        Object.values(colorFeatures).forEach((cf) => {
          if (!groups[cf.groupKey])
            groups[cf.groupKey] = { label: cf.label, items: [] };
          groups[cf.groupKey].items.push({
            type: "color",
            label: cf.label,
            featureId: cf.featureId,
            components: cf.components,
          });
        });

        return Object.values(groups).sort((a, b) => {
          if (a.label === "Unassigned") return 1;
          if (b.label === "Unassigned") return -1;
          return a.label.localeCompare(b.label);
        });
      })();

      const handleAddVariable = (selection: VariableSelection) => {
        setShowSelector(false);
        let variableId = "";
        if (selection.type === "variable") {
          variableId = selection.id;
        } else if (selection.type === "property") {
          const nameSafe = selection.label.replace(/[^a-zA-Z0-9]/g, "_");
          const newVar = handleCreateCustomStandardInput(`/${nameSafe}`);
          if (!newVar) return;
          variableId = newVar.id;
          const targetIds = resolveSelectionTargetIds(selection, objects);
          if (targetIds.length === 0) {
            return;
          }
          const shouldApplyBulk =
            targetIds.length === 1 ||
            (typeof window !== "undefined" &&
              window.confirm(
                `Bind all ${targetIds.length} components for "${selection.label}" to this new variable?`,
              ));
          if (!shouldApplyBulk) {
            return;
          }
          targetIds.forEach((targetId) =>
            handleBindingInputChange(targetId, variableId),
          );
        }
        if (variableId) updatePoseValue(pose.id, variableId, 0);
      };

      const captureStartValues = () => {
        if (blendAmount === 0) {
          Object.keys(pose.values).forEach((varId) => {
            scrubValuesRef.current[varId] = inputValues[varId] ?? 0;
          });
        }
      };

      // Allow manual capture for Play button even if blendAmount > 0
      const forceCaptureValues = () => {
        Object.keys(pose.values).forEach((varId) => {
          scrubValuesRef.current[varId] = inputValues[varId] ?? 0;
        });
      };

      const handleBlend = (amount: number) => {
        setBlendAmount(amount);
        const updates: Record<string, number> = {};
        Object.entries(pose.values).forEach(([varId, targetVal]) => {
          const startVal = scrubValuesRef.current[varId] ?? 0;
          const newVal = startVal + (targetVal - startVal) * amount;
          updates[varId] = newVal;
        });
        applyStandardInputBatch(updates);
      };

      return (
        <div className="flex flex-col gap-2 p-2 min-h-0 flex-1">
          <InspectorHeader
            name={pose.name}
            path={pose.group || ""}
            typeLabel="Pose"
            id={pose.id}
            onNameChange={(name) => updatePoseName(pose.id, name)}
            onPathChange={(group) => updatePoseGroup(pose.id, group)}
          />
          {renderChainPath()}
          {renderAuthoringStatus()}
          <RiggingPropertyRow
            label="Current Value"
            defaultLabel="Pose"
            onScrubStart={captureStartValues}
            onScrub={(_, totalDelta) => {
              // Blend based on delta (assuming 100px = 100% blend)
              const newAmount = Math.max(
                0,
                Math.min(1, blendAmount + totalDelta / 100),
              );
              handleBlend(newAmount);
            }}
            renderMainInput={() => (
              <div className="flex items-center gap-2 flex-1 group/row">
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={blendAmount}
                  className="flex-1"
                  onChange={(val) => handleBlend(val as number)}
                />
                <div className="w-12 flex-shrink-0">
                  <Input
                    size="sm"
                    type="text"
                    value={(blendAmount * 100).toFixed(0) + "%"}
                    className="bg-bg-input/80 border-border-default/80 text-right font-mono text-text-muted"
                    readOnly
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-text-muted hover:text-text-primary"
                  title="Play Pose (100%)"
                  onClick={() => {
                    if (blendAmount === 0) forceCaptureValues();
                    applyPose(pose.id);
                    setBlendAmount(1);
                  }}
                >
                  <Play size={12} fill="currentColor" />
                </Button>
              </div>
            )}
          />
          <div className="flex items-center gap-2 px-1 mb-2">
            <div className="h-px bg-border-default flex-1" />
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider whitespace-nowrap">
              What I Drive · {Object.keys(pose.values).length} Variables
            </span>
            <div className="h-px bg-border-default flex-1" />
          </div>

          <div className="flex flex-col gap-6 overflow-y-auto custom-scrollbar flex-1 min-h-[100px] pr-1">
            {groupedVariables.length === 0 && (
              <EmptyState
                icon={Sliders}
                iconSize={18}
                title="No Connected Variables"
                description="This pose has no variable targets yet. Connect one or more rig variables to define the pose output."
                className="border border-dashed border-border-default/50 rounded-lg bg-bg-secondary/20 py-6"
              />
            )}
            {groupedVariables.map((group) => (
              <div key={group.label} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1 py-1 border-b border-border-default/50">
                  <Box size={10} className="text-text-secondary" />
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {group.label}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 px-0.5">
                  {group.items.map((item, idx) => {
                    if (item.type === "scalar") {
                      const varId = item.varId;
                      const poseVal = item.poseVal;
                      const mInput = managedStandardInputs.find(
                        (m) => m.input.id === varId,
                      );
                      const inputDef = mInput?.input;
                      const rawLabel = inputDef?.label || varId;
                      const label = cleanLabel(rawLabel, group.label);
                      const min = inputDef?.range?.min ?? -1;
                      const max = inputDef?.range?.max ?? 1;
                      const liveVal = inputValues[varId] ?? 0;
                      const isDifferent = Math.abs(liveVal - poseVal) > 0.001;
                      const canInspectVariable = standardInputsById.has(varId);
                      const chainSummary =
                        item.drivenVariableCount > 0 ||
                        item.drivenPropertyCount > 0
                          ? `${item.drivenVariableCount} vars · ${item.drivenPropertyCount} props`
                          : null;

                      return (
                        <RiggingPropertyRow
                          key={varId}
                          label={label}
                          defaultLabel="Pose"
                          hasDifferentDefault={isDifferent}
                          onResetToDefault={() =>
                            handleInputValueChange(varId, poseVal)
                          }
                          onSaveToDefault={() =>
                            updatePoseValue(
                              pose.id,
                              varId,
                              inputValues[varId] ?? 0,
                            )
                          }
                          onScrubStart={() => {
                            scrubValuesRef.current[varId] =
                              inputValues[varId] ?? 0;
                          }}
                          onScrub={(delta, totalDelta) => {
                            const step = 0.01;
                            const startVal = scrubValuesRef.current[varId] ?? 0;
                            handleInputValueChange(
                              varId,
                              startVal + totalDelta * step,
                            );
                          }}
                          renderMainInput={() => (
                            <div className="flex items-center gap-2 flex-1 group/row">
                              <Slider
                                min={min}
                                max={max}
                                step={0.01}
                                value={liveVal}
                                className="flex-1"
                                onChange={(val) =>
                                  handleInputValueChange(varId, val as number)
                                }
                              />
                              <div className="w-12 flex-shrink-0">
                                <NumberField
                                  size="sm"
                                  value={liveVal} // Assuming liveVal is number, need check
                                  className={cn(
                                    "w-full bg-bg-input/80 border-border-default/80 text-right font-mono",
                                    isDifferent
                                      ? "text-accent font-bold"
                                      : "text-text-muted",
                                  )}
                                  onChange={(val) =>
                                    handleInputValueChange(varId, val)
                                  }
                                />
                              </div>
                              {chainSummary && (
                                <span className="text-[9px] text-text-muted font-mono whitespace-nowrap">
                                  {chainSummary}
                                </span>
                              )}
                              {canInspectVariable && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-text-secondary hover:text-text-primary"
                                    title={`Edit drivers for ${rawLabel} without leaving Pose`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setPoseBindingEditorInputId(varId);
                                    }}
                                  >
                                    <Sliders size={12} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-text-secondary hover:text-text-primary"
                                    title={`Inspect driver chain for ${rawLabel}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openRigInspector(varId, "bindings");
                                    }}
                                  >
                                    <ChevronRight size={12} />
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                          renderDefaultInput={() => (
                            <div className="flex items-center gap-2 flex-1 group/row">
                              <ScrubbableLabel
                                onScrub={(delta, totalDelta) => {
                                  const step = 0.01;
                                  const startVal =
                                    scrubValuesRef.current[varId] ?? 0;
                                  const newVal = startVal + totalDelta * step;
                                  updatePoseValue(pose.id, varId, newVal);
                                  handleInputValueChange(varId, newVal);
                                }}
                                onScrubStart={() => {
                                  scrubValuesRef.current[varId] = poseVal;
                                }}
                                className="h-full flex items-center bg-bg-input/40 rounded border border-border-default/50 px-1 py-0.5 min-w-[60px]"
                              >
                                <Input
                                  size="sm"
                                  type="text"
                                  value={poseVal.toFixed(2)}
                                  className="border-none text-right font-mono text-[10px] text-text-muted cursor-ew-resize bg-transparent h-auto p-0 shadow-none focus-within:ring-0"
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    if (!isNaN(v)) {
                                      updatePoseValue(pose.id, varId, v);
                                      handleInputValueChange(varId, v);
                                    }
                                  }}
                                />
                              </ScrubbableLabel>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-text-secondary hover:text-red-400 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                title="Remove from Pose"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePoseInput(pose.id, varId);
                                }}
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                          )}
                        />
                      );
                    } else if (item.type === "color") {
                      const r = item.components.find((c) => c.channel === "r");
                      const g = item.components.find((c) => c.channel === "g");
                      const b = item.components.find((c) => c.channel === "b");
                      const isDifferent = item.components.some(
                        (c) =>
                          Math.abs((inputValues[c.varId] ?? 0) - c.poseVal) >
                          0.001,
                      );

                      const handleBulkChange = (
                        isPose: boolean,
                        newR: number,
                        newG: number,
                        newB: number,
                      ) => {
                        if (isPose) {
                          if (r) {
                            updatePoseValue(pose.id, r.varId, newR);
                            handleInputValueChange(r.varId, newR);
                          }
                          if (g) {
                            updatePoseValue(pose.id, g.varId, newG);
                            handleInputValueChange(g.varId, newG);
                          }
                          if (b) {
                            updatePoseValue(pose.id, b.varId, newB);
                            handleInputValueChange(b.varId, newB);
                          }
                        } else {
                          if (r) handleInputValueChange(r.varId, newR);
                          if (g) handleInputValueChange(g.varId, newG);
                          if (b) handleInputValueChange(b.varId, newB);
                        }
                      };

                      const renderColorInputs = (isPoseValue: boolean) => {
                        const curR = isPoseValue
                          ? (r?.poseVal ?? 0)
                          : (inputValues[r?.varId ?? ""] ?? 0);
                        const curG = isPoseValue
                          ? (g?.poseVal ?? 0)
                          : (inputValues[g?.varId ?? ""] ?? 0);
                        const curB = isPoseValue
                          ? (b?.poseVal ?? 0)
                          : (inputValues[b?.varId ?? ""] ?? 0);
                        const hex = rgbToHex(curR, curG, curB);

                        return (
                          <div className="flex items-center gap-2 flex-1 group/row">
                            <BasePopover.Root>
                              <BasePopover.Trigger
                                className="w-8 h-4 rounded border border-border-default shadow-sm transition-transform hover:scale-105"
                                style={{ backgroundColor: hex }}
                              />
                              <BasePopover.Portal>
                                <BasePopover.Positioner
                                  side="bottom"
                                  align="end"
                                  sideOffset={5}
                                  className="z-[100]"
                                >
                                  <BasePopover.Popup className="flex flex-col gap-2 p-2 bg-bg-panel border border-border-default rounded-lg shadow-xl mt-1">
                                    <HexColorPicker
                                      color={hex}
                                      onChange={(h) => {
                                        const rgb = hexToRgb(h);
                                        if (rgb)
                                          handleBulkChange(
                                            isPoseValue,
                                            rgb.r,
                                            rgb.g,
                                            rgb.b,
                                          );
                                      }}
                                    />
                                  </BasePopover.Popup>
                                </BasePopover.Positioner>
                              </BasePopover.Portal>
                            </BasePopover.Root>
                            <div className="flex gap-1 flex-1 min-w-0">
                              {[
                                { c: r, ch: "R" as const },
                                { c: g, ch: "G" as const },
                                { c: b, ch: "B" as const },
                              ].map(({ c, ch }) => (
                                <div
                                  key={ch}
                                  className="flex-1 flex items-center bg-bg-input/40 rounded border border-border-default/50 px-1 py-0.5"
                                >
                                  <ScrubbableLabel
                                    label={ch}
                                    onScrub={(delta, totalDelta) => {
                                      if (c?.varId) {
                                        const step = 0.01;
                                        const startVal =
                                          scrubValuesRef.current[c.varId] ?? 0;
                                        const nextVal =
                                          startVal + totalDelta * step;
                                        if (isPoseValue) {
                                          updatePoseValue(
                                            pose.id,
                                            c.varId,
                                            nextVal,
                                          );
                                          handleInputValueChange(
                                            c.varId,
                                            nextVal,
                                          );
                                        } else
                                          handleInputValueChange(
                                            c.varId,
                                            nextVal,
                                          );
                                      }
                                    }}
                                    onScrubStart={() => {
                                      if (c?.varId) {
                                        const baseline = isPoseValue
                                          ? c.poseVal
                                          : (inputValues[c.varId] ?? 0);
                                        scrubValuesRef.current[c.varId] =
                                          baseline;
                                      }
                                    }}
                                    className={cn(
                                      "text-[9px] font-bold mr-1",
                                      ch === "R"
                                        ? "text-red-500"
                                        : ch === "G"
                                          ? "text-green-500"
                                          : "text-blue-500",
                                    )}
                                  />
                                  <Input
                                    size="sm"
                                    type="text"
                                    value={(isPoseValue
                                      ? (c?.poseVal ?? 0)
                                      : (inputValues[c?.varId ?? ""] ?? 0)
                                    ).toFixed(2)}
                                    className="border-none text-right font-mono text-[9px] text-text-primary bg-transparent h-auto p-0 shadow-none focus-within:ring-0"
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value);
                                      if (!isNaN(v) && c) {
                                        if (isPoseValue) {
                                          updatePoseValue(pose.id, c.varId, v);
                                          handleInputValueChange(c.varId, v);
                                        } else
                                          handleInputValueChange(c.varId, v);
                                      }
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                            {isPoseValue && (
                              <div className="flex gap-0.5 ml-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-text-secondary hover:text-red-400 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                  onClick={() =>
                                    item.components.forEach((c) =>
                                      removePoseInput(pose.id, c.varId),
                                    )
                                  }
                                  title="Remove all channels from Pose"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      };

                      return (
                        <RiggingPropertyRow
                          key={`color - ${item.featureId} -${idx} `}
                          label={item.label}
                          defaultLabel="Pose"
                          hasDifferentDefault={isDifferent}
                          onResetToDefault={() =>
                            item.components.forEach((c) =>
                              handleInputValueChange(c.varId, c.poseVal),
                            )
                          }
                          onSaveToDefault={() =>
                            item.components.forEach((c) =>
                              updatePoseValue(
                                pose.id,
                                c.varId,
                                inputValues[c.varId] ?? 0,
                              ),
                            )
                          }
                          renderMainInput={() => renderColorInputs(false)}
                          renderDefaultInput={() => renderColorInputs(true)}
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 gap-2 border border-dashed border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover hover:bg-bg-hover transition-all group"
            onClick={() => setShowSelector(true)}
          >
            <Plus
              size={14}
              className="group-hover:text-accent transition-colors"
            />
            <span className="font-normal text-xs">
              Connect Variable to Pose
            </span>
          </Button>
          <Modal
            open={showSelector}
            onClose={() => setShowSelector(false)}
            title="Connect Variable to Pose"
            maxWidth="md"
          >
            <VariableSelector
              onSelect={handleAddVariable}
              onCancel={() => setShowSelector(false)}
              defaultTab="variables"
            />
          </Modal>
          <Modal
            open={poseBindingEditorInputId !== null}
            onClose={() => setPoseBindingEditorInputId(null)}
            title={
              poseBindingEditorInputId
                ? `Edit My Drivers · ${
                    managedStandardInputs.find(
                      (entry) => entry.input.id === poseBindingEditorInputId,
                    )?.input.label ?? poseBindingEditorInputId
                  }`
                : "Edit My Drivers"
            }
            maxWidth="lg"
          >
            {poseBindingEditorInputId &&
            managedStandardInputs.find(
              (entry) => entry.input.id === poseBindingEditorInputId,
            )?.input ? (
              (() => {
                const inputToEdit = managedStandardInputs.find(
                  (entry) => entry.input.id === poseBindingEditorInputId,
                )!.input;
                const bindingToEdit = inputBindings[inputToEdit.id] ?? null;
                const standardInputList = managedStandardInputs.map(
                  (entry) => entry.input,
                );
                if (!bindingToEdit) {
                  const drivenVariableCount = collectDirectDownstreamRigInputs({
                    selectedRigId: inputToEdit.id,
                    inputBindings,
                    standardInputsById,
                  }).length;
                  const drivenPropertyCount = collectRigDependents({
                    selectedRigId: inputToEdit.id,
                    bindings,
                    inputBindings,
                    objects,
                  }).length;
                  const emptyStateKind = classifyPoseParentBindingEmptyState(
                    drivenVariableCount,
                    drivenPropertyCount,
                  );
                  return (
                    <EmptyState
                      icon={Sliders}
                      iconSize={20}
                      title={
                        emptyStateKind === "root"
                          ? "Root Variable (No Parent Drivers)"
                          : "No Parent Drivers (Currently Unlinked)"
                      }
                      description={
                        emptyStateKind === "root"
                          ? "This pose-driven variable is currently a root input. Create a parent binding only if you want it remapped from upstream rig variables."
                          : "This pose-driven variable has no parent drivers and no downstream outputs yet. Add downstream targets or create a parent binding to connect it."
                      }
                      className="border border-dashed border-border-default/50 rounded-lg bg-bg-secondary/20 py-6"
                      action={
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-[10px] text-text-muted font-mono">
                            Downstream: {drivenVariableCount} vars ·{" "}
                            {drivenPropertyCount} props
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              handleEnsureParentBinding(inputToEdit.id)
                            }
                          >
                            Create Parent Binding
                          </Button>
                        </div>
                      }
                    />
                  );
                }
                return (
                  <BindingEditor
                    binding={bindingToEdit}
                    targetId={inputToEdit.id}
                    issues={bindingIssues.get(inputToEdit.id)}
                    label={inputToEdit.label || inputToEdit.id}
                    standardInputs={standardInputList}
                    standardInputLookup={standardInputsById}
                    onBindingInputChange={handleParentBindingInputChange}
                    onAddBindingSlot={handleParentAddBindingSlot}
                    onRemoveBindingSlot={handleParentRemoveBindingSlot}
                    onBindingExpressionChange={
                      handleParentBindingExpressionChange
                    }
                    onBindingSlotAliasChange={
                      handleParentBindingSlotAliasChange
                    }
                    onBindingSlotValueTypeChange={
                      handleParentBindingSlotValueTypeChange
                    }
                    onRequestCreateStandardInput={
                      handleRequestCreateStandardInput
                    }
                    onResetBinding={handleParentResetBinding}
                    expandable={false}
                    defaultExpanded={true}
                    currentValues={inputValues}
                    onInputValueChange={handleInputValueChange}
                    featureFlags={{
                      vectorAuthoringBeta: true,
                      conditionalAuthoringBeta: true,
                    }}
                  />
                );
              })()
            ) : (
              <p className="text-xs text-text-muted">No variable selected.</p>
            )}
          </Modal>
        </div>
      );
    }
  }

  // 3. Rig Mode
  if (inspectorMode === "rig" && selectedRigId) {
    const rigInput = managedStandardInputs.find(
      (m) => m.input.id === selectedRigId,
    );
    if (rigInput) {
      const input = rigInput.input;
      const value = inputValues[input.id] ?? input.defaultValue ?? 0;
      const parentBinding = inputBindings[input.id];
      const controllableResolution = resolveControllableInputId(
        input.id,
        inputBindings,
      );
      const isDirectRigControlAvailable =
        !controllableResolution.blockedReason &&
        (controllableResolution.inputId === null ||
          controllableResolution.inputId === input.id);
      const directRigControlReason = controllableResolution.blockedReason
        ? controllableResolution.blockedReason
        : controllableResolution.inputId &&
            controllableResolution.inputId !== input.id
          ? `This variable is derived from "${controllableResolution.inputId}" without a local self slot. Edit My Drivers to add local control or adjust "${controllableResolution.inputId}".`
          : null;
      const standardInputList = managedStandardInputs.map(
        (entry) => entry.input,
      );
      const downstreamInputs = collectDirectDownstreamRigInputs({
        selectedRigId,
        inputBindings,
        standardInputsById,
      });
      const dependents = collectRigDependents({
        selectedRigId,
        bindings,
        inputBindings,
        objects,
      });

      const handleAddRigDrivenVariable = (selection: VariableSelection) => {
        setShowSelector(false);
        const resolvedSelection = resolveRigDrivenSelection(
          selection,
          selectedRigId,
          objects,
        );

        if (resolvedSelection.kind === "self-variable") {
          alertDialog("A variable cannot directly drive itself.");
          return;
        }

        if (resolvedSelection.kind === "variable") {
          const existingBinding = inputBindings[resolvedSelection.childInputId];
          const alreadyLinked = hasParentBindingInput(
            existingBinding,
            selectedRigId,
          );
          if (alreadyLinked) {
            alertDialog(
              "This variable is already driven by the selected rig variable.",
            );
            openRigInspector(resolvedSelection.childInputId, "bindings");
            return;
          }
          handleCreateParentDriverBinding(
            resolvedSelection.childInputId,
            selectedRigId,
          );
          openRigInspector(resolvedSelection.childInputId, "bindings");
          return;
        }

        if (resolvedSelection.kind === "empty-property") {
          return;
        }

        if (resolvedSelection.kind === "property") {
          if (resolvedSelection.targetIds.length === 0) {
            return;
          }
          const selectionLabel =
            selection.type === "property" ? selection.label : "selection";
          const shouldApplyBulk =
            resolvedSelection.targetIds.length === 1 ||
            (typeof window !== "undefined" &&
              window.confirm(
                `Bind all ${resolvedSelection.targetIds.length} components for "${selectionLabel}" to this rig input?`,
              ));
          if (!shouldApplyBulk) {
            return;
          }
          resolvedSelection.targetIds.forEach((targetId) => {
            handleBindingInputChange(targetId, selectedRigId);
          });
          return;
        }
      };

      return (
        <div className="p-2 flex flex-col gap-4 min-h-0 flex-1">
          <InspectorHeader
            name={input.label || input.id}
            path={input.path || ""}
            typeLabel="Rig"
            id={input.id}
            onNameChange={(name) =>
              handleUpdateStandardInput(input.id, { label: name })
            }
            onPathChange={(path) =>
              handleUpdateStandardInput(input.id, { path })
            }
          />
          {renderChainPath()}
          {renderAuthoringStatus()}
          <div className="flex items-center gap-1 px-1 py-1">
            <Button
              variant={rigInspectorView === "quick" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setRigInspectorView("quick")}
            >
              Quick
            </Button>
            <Button
              variant={rigInspectorView === "bindings" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setRigInspectorView("bindings")}
            >
              My Drivers
            </Button>
          </div>

          {rigInspectorView === "quick" ? (
            <>
              <RiggingPropertyRow
                label="Current Value"
                onScrubStart={() => {
                  scrubValuesRef.current[input.id] = value;
                }}
                onScrub={(_, totalDelta) => {
                  if (!isDirectRigControlAvailable) {
                    return;
                  }
                  const step = (input.range.max - input.range.min) / 100;
                  const startVal = scrubValuesRef.current[input.id] ?? 0;
                  handleInputValueChange(
                    input.id,
                    startVal + totalDelta * step,
                  );
                }}
                renderMainInput={() => (
                  <div
                    className={cn(
                      "flex items-center gap-2 flex-1",
                      !isDirectRigControlAvailable && "opacity-70",
                    )}
                    title={directRigControlReason ?? undefined}
                  >
                    <Slider
                      min={input.range.min ?? -1}
                      max={input.range.max ?? 1}
                      step={0.01}
                      value={value}
                      className="flex-1"
                      onChange={(val) => {
                        if (!isDirectRigControlAvailable) {
                          return;
                        }
                        handleInputValueChange(input.id, val as number);
                      }}
                    />
                    <div className="w-12 flex-shrink-0">
                      <NumberField
                        size="sm"
                        value={value}
                        className="bg-slate-950/50 border-slate-800/50 text-right font-mono text-xs text-slate-300"
                        onChange={(val) => {
                          if (!isDirectRigControlAvailable) {
                            return;
                          }
                          handleInputValueChange(input.id, val);
                        }}
                      />
                    </div>
                  </div>
                )}
              />
              {!isDirectRigControlAvailable && directRigControlReason && (
                <div className="flex items-center justify-between gap-2 px-1 -mt-2">
                  <p className="text-[10px] text-amber-300/90">
                    {directRigControlReason}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-[10px] whitespace-nowrap"
                    onClick={() => handleEnableParentLocalControl(input.id)}
                  >
                    Enable Local Control
                  </Button>
                </div>
              )}
              <div className="flex flex-col gap-2 flex-1 min-h-0">
                <div className="flex items-center gap-2 px-1 py-1">
                  <Sliders size={12} className="text-slate-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    What I Drive · {downstreamInputs.length} variables ·{" "}
                    {dependents.length} properties
                  </span>
                </div>

                {downstreamInputs.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider px-1">
                      Variables
                    </div>
                    <div className="flex flex-col gap-1 bg-bg-panel/30 rounded p-1 border border-border-default/40">
                      {downstreamInputs.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className="text-xs text-slate-300 p-1.5 hover:bg-slate-800/50 rounded flex items-center gap-2 text-left"
                          onClick={() => openRigInspector(entry.id)}
                          title={`Inspect ${entry.label}`}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
                          <span className="flex-1 truncate">{entry.label}</span>
                          <ChevronRight size={10} className="text-text-muted" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {dependents.length === 0 ? (
                  <EmptyState
                    icon={Sliders}
                    iconSize={20}
                    title="No Driven Properties"
                    description="This variable isn't currently driving any scene properties."
                    className="border border-dashed border-border-default/50 rounded-lg bg-bg-secondary/20 py-6"
                  />
                ) : (
                  <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar bg-bg-panel/40 rounded p-1 border border-border-default/50 flex-1">
                    {dependents.map((d) => (
                      <div
                        key={d.targetId}
                        className="text-xs text-slate-300 p-1.5 hover:bg-slate-800/50 rounded flex items-center gap-2 group"
                      >
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-2 min-w-0 text-left"
                          onClick={() => openSceneBindingInspector(d.targetId)}
                          title={`Inspect ${d.name}`}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                          <span className="flex-1 truncate">{d.name}</span>
                          <ChevronRight
                            size={10}
                            className="text-text-muted opacity-70 group-hover:opacity-100"
                          />
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-text-primary"
                          onClick={() =>
                            setRigDrivenBindingTargetId(d.targetId)
                          }
                          title="Edit binding here"
                        >
                          <Sliders size={10} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"
                          onClick={() => handleResetBinding(d.targetId)}
                          title="Remove binding"
                        >
                          <Trash2 size={10} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 gap-2 border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 hover:bg-slate-800/20 transition-all group shrink-0"
                  onClick={() => {
                    setRigAddMode("property");
                    setShowSelector(true);
                  }}
                >
                  <Plus
                    size={14}
                    className="group-hover:text-blue-400 transition-colors"
                  />
                  <span className="font-normal text-xs">
                    Add Driven Property
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-1 gap-2 border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 hover:bg-slate-800/20 transition-all group shrink-0"
                  onClick={() => {
                    setRigAddMode("variable");
                    setShowSelector(true);
                  }}
                >
                  <Plus
                    size={14}
                    className="group-hover:text-emerald-400 transition-colors"
                  />
                  <span className="font-normal text-xs">
                    Add Driven Variable
                  </span>
                </Button>
                <Modal
                  open={showSelector}
                  onClose={() => setShowSelector(false)}
                  title={
                    rigAddMode === "property"
                      ? "Select Property to Drive"
                      : "Select Variable to Drive"
                  }
                  maxWidth="md"
                >
                  <VariableSelector
                    onSelect={handleAddRigDrivenVariable}
                    onCancel={() => setShowSelector(false)}
                    defaultTab={
                      rigAddMode === "property" ? "scene" : "variables"
                    }
                  />
                </Modal>
                <Modal
                  open={rigDrivenBindingTargetId !== null}
                  onClose={() => setRigDrivenBindingTargetId(null)}
                  title={
                    rigDrivenBindingTargetId
                      ? `Edit Target Drivers · ${
                          targetLabelById.get(rigDrivenBindingTargetId) ??
                          rigDrivenBindingTargetId
                        }`
                      : "Edit Target Drivers"
                  }
                  maxWidth="lg"
                >
                  {rigDrivenBindingTargetId &&
                  bindings[rigDrivenBindingTargetId] ? (
                    <BindingEditor
                      binding={bindings[rigDrivenBindingTargetId]}
                      targetId={rigDrivenBindingTargetId}
                      issues={bindingIssues.get(rigDrivenBindingTargetId)}
                      label={
                        targetLabelById.get(rigDrivenBindingTargetId) ??
                        rigDrivenBindingTargetId
                      }
                      standardInputs={standardInputList}
                      standardInputLookup={standardInputsById}
                      onBindingInputChange={handleBindingInputChange}
                      onAddBindingSlot={handleAddBindingSlot}
                      onRemoveBindingSlot={handleRemoveBindingSlot}
                      onBindingExpressionChange={handleUpdateBindingExpression}
                      onBindingSlotAliasChange={handleUpdateBindingSlotAlias}
                      onBindingSlotValueTypeChange={
                        handleBindingSlotValueTypeChange
                      }
                      onRequestCreateStandardInput={
                        handleRequestCreateStandardInput
                      }
                      onResetBinding={handleResetBinding}
                      expandable={false}
                      defaultExpanded={true}
                      currentValues={inputValues}
                      onInputValueChange={handleInputValueChange}
                      allowSelfBinding={false}
                      featureFlags={{
                        vectorAuthoringBeta: true,
                        conditionalAuthoringBeta: true,
                      }}
                    />
                  ) : (
                    <EmptyState
                      icon={Sliders}
                      iconSize={20}
                      title="No Binding"
                      description="This driven target has no editable binding state."
                      className="border border-dashed border-border-default/50 rounded-lg bg-bg-secondary/20 py-6"
                    />
                  )}
                </Modal>
              </div>
            </>
          ) : parentBinding ? (
            <div className="rounded-lg border border-border-default/60 bg-bg-panel/30 p-2 overflow-y-auto custom-scrollbar">
              <BindingEditor
                binding={parentBinding}
                targetId={input.id}
                issues={bindingIssues.get(input.id)}
                label={input.label || input.id}
                standardInputs={standardInputList}
                standardInputLookup={standardInputsById}
                onBindingInputChange={handleParentBindingInputChange}
                onAddBindingSlot={handleParentAddBindingSlot}
                onRemoveBindingSlot={handleParentRemoveBindingSlot}
                onBindingExpressionChange={handleParentBindingExpressionChange}
                onBindingSlotAliasChange={handleParentBindingSlotAliasChange}
                onBindingSlotValueTypeChange={
                  handleParentBindingSlotValueTypeChange
                }
                onRequestCreateStandardInput={handleRequestCreateStandardInput}
                onResetBinding={handleParentResetBinding}
                expandable={false}
                defaultExpanded={true}
                currentValues={inputValues}
                onInputValueChange={handleInputValueChange}
                featureFlags={{
                  vectorAuthoringBeta: true,
                  conditionalAuthoringBeta: true,
                }}
              />
            </div>
          ) : (
            <EmptyState
              icon={Sliders}
              iconSize={20}
              title="No Parent Binding"
              description="This variable has no input binding yet. Create one to map it from upstream rig inputs."
              className="border border-dashed border-border-default/50 rounded-lg bg-bg-secondary/20 py-6"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleEnsureParentBinding(input.id)}
                >
                  Create Binding
                </Button>
              }
            />
          )}
        </div>
      );
    }
  }

  if (inspectorMode === "material" && selectedMaterialId) {
    const material = materials.find((m) => m.id === selectedMaterialId);
    if (material) {
      const affectedShapes = objects.filter((obj) =>
        material.memberShapeIds.includes(obj.id),
      );

      // We create a "dummy" node object that maps the material features to this UI
      // so we can reuse RiggingColorRow and RiggingScalarRow
      // But wait, RiggingColorRow needs a real node feature.
      // Looking at RiggingMaterialSection, it expects a SceneObjectFeature.
      // We can construct these from the material descriptor.

      const colorFeature =
        material.animated.color || material.staticValues.color !== undefined
          ? ({
              id: `mat-color-${material.id}`,
              key: "color",
              label: "Color",
              animated: !!material.animated.color,
              value: material.animated.color || "",
              staticValue: material.staticValues.color,
              components: [
                {
                  label: "R",
                  targetId: material.animated.color
                    ? `${material.animated.color}:r`
                    : undefined,
                  staticValue: (material.staticValues.color as any)?.r,
                },
                {
                  label: "G",
                  targetId: material.animated.color
                    ? `${material.animated.color}:g`
                    : undefined,
                  staticValue: (material.staticValues.color as any)?.g,
                },
                {
                  label: "B",
                  targetId: material.animated.color
                    ? `${material.animated.color}:b`
                    : undefined,
                  staticValue: (material.staticValues.color as any)?.b,
                },
              ],
            } as any)
          : null;

      const opacityFeature =
        material.animated.opacity || material.staticValues.opacity !== undefined
          ? ({
              id: `mat-opacity-${material.id}`,
              key: "opacity",
              label: "Opacity",
              animated: !!material.animated.opacity,
              value: material.animated.opacity || "",
              staticValue: material.staticValues.opacity,
              components: [
                {
                  label: "Opacity",
                  targetId: material.animated.opacity || undefined,
                  staticValue: material.staticValues.opacity,
                },
              ],
            } as any)
          : null;

      const handleStaticValueChange = (
        targetId: string,
        value: number,
        channel?: string,
      ) => {
        setAnimatableValue(targetId, value, { channel, saveToDefault: true });
      };

      return (
        <div className="flex flex-col h-full bg-bg-app animate-in fade-in duration-300">
          <InspectorHeader
            name={material.label}
            typeLabel="Material"
            id={material.id}
            icon={Palette}
            onNameChange={(newName) =>
              updateMaterialLabel(material.id, newName)
            }
          />
          {renderChainPath()}
          {renderAuthoringStatus()}

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-4">
            <div className="flex flex-col gap-0.5 p-1.5 bg-bg-panel/40 rounded-lg border border-border-default/50">
              <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-0.5 px-0.5">
                Properties
              </div>
              {colorFeature && (
                <RiggingColorRow
                  label="Color"
                  feature={colorFeature}
                  bindings={bindings}
                  standardInputs={standardInputs}
                  standardInputsById={standardInputsById}
                  inputBindings={inputBindings}
                  inputValues={inputValues}
                  onValueChange={handleInputValueChange}
                  onDefaultChange={(id, val) =>
                    handleUpdateStandardInput(id, { defaultValue: val })
                  }
                  onStaticValueChange={handleStaticValueChange}
                />
              )}
              {opacityFeature && (
                <RiggingScalarRow
                  label="Opacity"
                  feature={opacityFeature}
                  bindings={bindings}
                  standardInputs={standardInputs}
                  standardInputsById={standardInputsById}
                  inputBindings={inputBindings}
                  inputValues={inputValues}
                  onValueChange={handleInputValueChange}
                  onDefaultChange={(id, val) =>
                    handleUpdateStandardInput(id, { defaultValue: val })
                  }
                  onStaticValueChange={handleStaticValueChange}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Affected Face Elements
                </h3>
                <span className="text-[10px] font-mono text-text-muted bg-bg-panel/60 px-1.5 py-0.5 rounded border border-border-default/30">
                  {affectedShapes.length}
                </span>
              </div>

              {affectedShapes.length === 0 ? (
                <EmptyState
                  icon={Box}
                  iconSize={20}
                  title="No Elements"
                  description="This material is not assigned to any face elements."
                  className="border border-dashed border-border-default/50 rounded-lg bg-bg-secondary/20 py-6"
                />
              ) : (
                <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar bg-bg-panel/40 rounded p-1 border border-border-default/50 max-h-[300px]">
                  {affectedShapes.map((shape) => (
                    <div
                      key={shape.id}
                      className="text-xs text-slate-300 p-1.5 hover:bg-slate-800/50 rounded flex items-center gap-2 group cursor-pointer"
                      onClick={() => handleSelectObject(shape.id)}
                    >
                      <Box size={10} className="text-accent/60" />
                      <span className="flex-1 truncate">
                        {shape.name || shape.id}
                      </span>
                      <ChevronRight
                        size={10}
                        className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
  }

  // Default: Empty State
  return (
    <EmptyState
      icon={Info}
      iconSize={20}
      title="No selection"
      description="Select an object, pose, or rig to see its properties here."
      className="h-full min-h-[300px]"
    />
  );
}
