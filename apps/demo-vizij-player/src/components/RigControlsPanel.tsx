import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrchestrator } from "@vizij/orchestrator-react";
import { useAppState } from "../state/AppStateContext";
import type { RigDefinition } from "../orchestrator/useOrchestratorMerging";

function createPresetId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `preset-${Math.random().toString(36).slice(2, 10)}`;
}

function getSliderBounds(_input: RigDefinition["inputs"][number]): {
  min: number;
  max: number;
} {
  return { min: -1, max: 1 };
}

function getInputDefaultValue(_input: RigDefinition["inputs"][number]): number {
  return 0;
}

type RigControlsPanelProps = {
  rigDefinitions: RigDefinition[];
  lowLevelDefinition: RigDefinition | null;
  orchestratorReady: boolean;
};

export function RigControlsPanel({
  rigDefinitions,
  lowLevelDefinition,
  orchestratorReady,
}: RigControlsPanelProps) {
  const { setInput } = useOrchestrator();
  const {
    state: { selectedRigIds, sliderValues, rigPresets },
    setSliderValue,
    resetRigSliders,
    addRigPreset,
    removeRigPreset,
  } = useAppState();
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

  const safeSetInput = useCallback(
    (path: string, value: Parameters<typeof setInput>[1]) => {
      if (!orchestratorReady) {
        return;
      }
      console.log("demo-animating-faces: staging ui input", path, value);
      setInput(path, value);
    },
    [setInput, orchestratorReady],
  );

  const activeHighLevelRigs = useMemo(
    () => rigDefinitions.filter((rig) => selectedRigIds.includes(rig.id)),
    [rigDefinitions, selectedRigIds],
  );
  const lowLevelRigId = lowLevelDefinition?.id ?? null;
  const activeRigs = useMemo(() => {
    const list: RigDefinition[] = [];
    if (lowLevelDefinition) {
      list.push(lowLevelDefinition);
    }
    list.push(...activeHighLevelRigs);
    return list;
  }, [lowLevelDefinition, activeHighLevelRigs]);

  useEffect(() => {
    activeRigs.forEach((rig) => {
      rig.inputs.forEach((input) => {
        if (sliderValues[input.uiPath] === undefined) {
          const defaultValue = getInputDefaultValue(input);
          setSliderValue(input.uiPath, defaultValue);
          safeSetInput(input.uiPath, { float: defaultValue });
        }
      });
    });
  }, [activeRigs, sliderValues, setSliderValue, safeSetInput]);

  useEffect(() => {
    if (!orchestratorReady) {
      return;
    }
    activeRigs.forEach((rig) => {
      rig.inputs.forEach((input) => {
        // const bounds = getSliderBounds(input);
        const defaultValue = getInputDefaultValue(input);
        const stored = sliderValues[input.uiPath];
        const value = stored === undefined ? defaultValue : stored;
        if (stored !== undefined && stored !== value) {
          setSliderValue(input.uiPath, value);
        }
        safeSetInput(input.uiPath, { float: value });
      });
    });
  }, [
    activeRigs,
    sliderValues,
    orchestratorReady,
    safeSetInput,
    setSliderValue,
  ]);

  const toggleCollapsed = useCallback((rigId: string) => {
    setCollapsedMap((prev) => ({
      ...prev,
      [rigId]: !(prev[rigId] ?? false),
    }));
  }, []);

  if (!activeRigs.length) {
    return (
      <section className="panel" aria-labelledby="controls-panel-title">
        <header className="panel-header">
          <h2 id="controls-panel-title">Rig Controls</h2>
        </header>
        <div className="panel-body">
          <div className="panel-status">
            Select a high-level rig to enable controls.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="controls-panel-title">
      <header className="panel-header">
        <h2 id="controls-panel-title">Rig Controls</h2>
      </header>
      <div className="panel-body rig-controls">
        {activeRigs.map((rig) => {
          const presets = rigPresets[rig.id] ?? [];
          const groupedMap = new Map<
            string,
            { key: string; label: string; inputs: RigDefinition["inputs"] }
          >();
          const isLowLevel = rig.id === lowLevelRigId;
          const isCollapsed = collapsedMap[rig.id] ?? false;
          const bodyId = `rig-group-body-${rig.id}`;

          rig.inputs.forEach((input) => {
            if (!groupedMap.has(input.groupKey)) {
              groupedMap.set(input.groupKey, {
                key: input.groupKey,
                label: input.groupLabel,
                inputs: [],
              });
            }
            groupedMap.get(input.groupKey)!.inputs.push(input);
          });

          const groupedInputs = Array.from(groupedMap.values()).sort((a, b) =>
            a.label.localeCompare(b.label),
          );

          const applyNeutralPose = () => {
            resetRigSliders(rig.inputs.map((input) => input.uiPath));
            rig.inputs.forEach((input) => {
              const value = getInputDefaultValue(input);
              setSliderValue(input.uiPath, value);
              safeSetInput(input.uiPath, { float: value });
            });
          };

          const capturePreset = () => {
            const defaultName = `Preset ${presets.length + 1}`;
            const name =
              typeof window !== "undefined"
                ? window.prompt("Preset name", defaultName)?.trim() ||
                  defaultName
                : defaultName;
            const values: Record<string, number> = {};
            rig.inputs.forEach((input) => {
              const value =
                sliderValues[input.uiPath] ?? getInputDefaultValue(input);
              values[input.uiPath] = value;
            });
            addRigPreset(rig.id, { id: createPresetId(), name, values });
          };

          const applyPreset = (presetValues: Record<string, number>) => {
            Object.entries(presetValues).forEach(([uiPath, value]) => {
              const inputDef = rig.inputs.find(
                (entry) => entry.uiPath === uiPath,
              );
              const fallback = inputDef ? getInputDefaultValue(inputDef) : 0;
              const nextValue = Number.isFinite(value) ? value : fallback;
              setSliderValue(uiPath, nextValue);
              safeSetInput(uiPath, { float: nextValue });
            });
          };

          return (
            <div key={rig.id} className="rig-group">
              <div className="rig-group-header">
                <h3>{isLowLevel ? `${rig.label} (Low-Level)` : rig.label}</h3>
                <div className="rig-actions">
                  <button type="button" onClick={applyNeutralPose}>
                    Neutral Pose
                  </button>
                  <button type="button" onClick={capturePreset}>
                    Capture Preset
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => toggleCollapsed(rig.id)}
                    aria-expanded={!isCollapsed}
                    aria-controls={bodyId}
                  >
                    {isCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
              </div>

              <div id={bodyId} className="rig-group-body" hidden={isCollapsed}>
                {presets.length > 0 ? (
                  <div className="rig-presets">
                    {presets.map((preset) => (
                      <div key={preset.id} className="rig-preset">
                        <button
                          type="button"
                          onClick={() => applyPreset(preset.values)}
                        >
                          {preset.name}
                        </button>
                        <button
                          type="button"
                          className="delete"
                          onClick={() => removeRigPreset(rig.id, preset.id)}
                          aria-label={`Remove preset ${preset.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                {groupedInputs.map((group) => (
                  <div key={group.key} className="rig-input-group">
                    <h4>{group.label}</h4>
                    <div className="rig-inputs">
                      {group.inputs.map((input) => {
                        const bounds = getSliderBounds(input);
                        const defaultValue = getInputDefaultValue(input);
                        const stored = sliderValues[input.uiPath];
                        const currentValue =
                          stored === undefined ? defaultValue : stored;
                        return (
                          <label key={input.uiPath} className="rig-input">
                            <span className="rig-input-label">
                              {isLowLevel ? (
                                <>
                                  <small>{input.path}</small>
                                </>
                              ) : (
                                input.label
                              )}
                            </span>
                            <input
                              type="range"
                              min={bounds.min}
                              max={bounds.max}
                              step={0.01}
                              value={currentValue}
                              onChange={(event) => {
                                const parsed = Number.parseFloat(
                                  event.target.value,
                                );
                                const nextValue = parsed;
                                setSliderValue(input.uiPath, nextValue);
                                safeSetInput(input.uiPath, {
                                  float: nextValue,
                                });
                              }}
                            />
                            <input
                              type="number"
                              min={bounds.min}
                              max={bounds.max}
                              step={0.01}
                              value={currentValue}
                              onChange={(event) => {
                                const parsed = Number.parseFloat(
                                  event.target.value,
                                );
                                const fallback = getInputDefaultValue(input);
                                const nextValue = Number.isFinite(parsed)
                                  ? parsed
                                  : fallback;
                                setSliderValue(input.uiPath, nextValue);
                                safeSetInput(input.uiPath, {
                                  float: nextValue,
                                });
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
