import React, { useState, useRef, useEffect } from "react";
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
import { usePoseRig } from "../../state/PoseRigProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { useUnifiedSelection } from "../../hooks/useUnifiedSelection";
import { cn } from "../../utils/cn";
import { rgbToHex, hexToRgb } from "../../utils/color";
import { cleanLabel } from "../../utils/labels";
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
import { collectRigDependents } from "./rigConnections";

type PoseVariableItem =
  | { type: "scalar"; varId: string; poseVal: number }
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

export function InspectorContent() {
  const [showSelector, setShowSelector] = useState(false);
  const [blendAmount, setBlendAmount] = useState(0);
  const [sceneInspectorView, setSceneInspectorView] = useState<
    "quick" | "features" | "bindings"
  >("quick");
  const scrubValuesRef = useRef<Record<string, number>>({});

  // Hooks
  const {
    selectedId,
    selectedPoseId,
    selectedRigId,
    selectedMaterialId,
    handleSelectObject,
    inspectorMode,
  } = useUnifiedSelection();

  const {
    getNode,
    objects,
    materials,
    updateMaterialLabel,
    setAnimatableValue,
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
    inputBindings,
    handleCreateCustomStandardInput,
    handleAddBindingSlot,
    handleUpdateStandardInput,
    handleRenameShape,
    handleBindingInputChange,
    handleResetBinding,
    standardInputsById,
  } = useBindingAuthoring((state) => state);

  // Reset blend amount when selected pose changes
  useEffect(() => {
    setBlendAmount(0);
  }, [selectedPoseId]);

  useEffect(() => {
    setSceneInspectorView("quick");
  }, [selectedId, selectedMaterialId, selectedPoseId, selectedRigId]);

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
              Binding Editor
            </Button>
          </div>
          {sceneInspectorView === "quick" ? (
            <>
              <RiggingTransformSection node={node} />
              <RiggingMorphTargetsSection node={node} />
              <RiggingMaterialSection node={node} />
              <BindingConnections node={node} />
            </>
          ) : sceneInspectorView === "features" ? (
            <FeatureList node={node} mode="features" />
          ) : (
            <FeatureList node={node} mode="bindings" />
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
            groups[groupKey].items.push({
              type: "scalar",
              varId,
              poseVal: val,
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
          const newVar = handleCreateCustomStandardInput(`/ ${nameSafe} `);
          if (!newVar) return;
          variableId = newVar.id;
          if (selection.targetId) {
            handleAddBindingSlot(selection.targetId);
          } else {
            const obj = objects.find((o) => o.id === selection.objectId);
            const feat = obj?.features.find(
              (f) => f.id === selection.featureId,
            );
            if (feat && feat.components.length > 0) {
              const targetId = feat.components[0].targetId;
              if (targetId) handleAddBindingSlot(targetId);
            }
          }
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
              Driving {Object.keys(pose.values).length} Variables
            </span>
            <div className="h-px bg-border-default flex-1" />
          </div>

          <div className="flex flex-col gap-6 overflow-y-auto custom-scrollbar flex-1 min-h-[100px] pr-1">
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
            <span className="font-normal text-xs">Add Variable to Pose</span>
          </Button>
          <Modal
            open={showSelector}
            onClose={() => setShowSelector(false)}
            title="Select Variable"
            maxWidth="md"
          >
            <VariableSelector
              onSelect={handleAddVariable}
              onCancel={() => setShowSelector(false)}
            />
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
      const dependents = (() => {
        return collectRigDependents({
          selectedRigId,
          bindings,
          inputBindings,
          objects,
        });
      })();

      const handleAddRigDrivenVariable = (selection: VariableSelection) => {
        setShowSelector(false);
        if (selection.type === "property") {
          if (selection.targetId) {
            handleBindingInputChange(selection.targetId, selectedRigId);
            return;
          }
          const targetIds =
            selection.targetIds && selection.targetIds.length > 0
              ? selection.targetIds
              : (() => {
                  const obj = objects.find((o) => o.id === selection.objectId);
                  const feat = obj?.features.find(
                    (f) => f.id === selection.featureId,
                  );
                  if (!feat) {
                    return [];
                  }
                  return feat.components
                    .map((component) => component.targetId)
                    .filter((targetId): targetId is string =>
                      Boolean(targetId),
                    );
                })();
          if (targetIds.length === 0) {
            return;
          }
          const shouldApplyBulk =
            targetIds.length === 1 ||
            (typeof window !== "undefined" &&
              window.confirm(
                `Bind all ${targetIds.length} components for "${selection.label}" to this rig input?`,
              ));
          if (!shouldApplyBulk) {
            return;
          }
          targetIds.forEach((targetId) => {
            handleBindingInputChange(targetId, selectedRigId);
          });
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
          <RiggingPropertyRow
            label="Current Value"
            onScrubStart={() => {
              scrubValuesRef.current[input.id] = value;
            }}
            onScrub={(_, totalDelta) => {
              const step = (input.range.max - input.range.min) / 100;
              const startVal = scrubValuesRef.current[input.id] ?? 0;
              handleInputValueChange(input.id, startVal + totalDelta * step);
            }}
            renderMainInput={() => (
              <div className="flex items-center gap-2 flex-1">
                <Slider
                  min={input.range.min ?? -1}
                  max={input.range.max ?? 1}
                  step={0.01}
                  value={value}
                  className="flex-1"
                  onChange={(val) =>
                    handleInputValueChange(input.id, val as number)
                  }
                />
                <div className="w-12 flex-shrink-0">
                  <NumberField
                    size="sm"
                    value={value}
                    className="bg-slate-950/50 border-slate-800/50 text-right font-mono text-xs text-slate-300"
                    onChange={(val) => handleInputValueChange(input.id, val)}
                  />
                </div>
              </div>
            )}
          />
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <div className="flex items-center gap-2 px-1 py-1">
              <Sliders size={12} className="text-slate-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Driving {dependents.length} properties
              </span>
            </div>
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
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                    <span className="flex-1 truncate">{d.name}</span>
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
              onClick={() => setShowSelector(true)}
            >
              <Plus
                size={14}
                className="group-hover:text-blue-400 transition-colors"
              />
              <span className="font-normal text-xs">Add Driven Variable</span>
            </Button>
            <Modal
              open={showSelector}
              onClose={() => setShowSelector(false)}
              title="Select Property to Drive"
              maxWidth="md"
            >
              <VariableSelector
                onSelect={handleAddRigDrivenVariable}
                onCancel={() => setShowSelector(false)}
                defaultTab="scene"
              />
            </Modal>
          </div>
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
                  standardInputsById={standardInputsById}
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
                  standardInputsById={standardInputsById}
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
