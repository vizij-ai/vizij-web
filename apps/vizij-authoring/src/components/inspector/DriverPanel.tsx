import React, { useCallback, useMemo } from "react";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import type {
  SceneObjectNode,
  SceneObjectFeature,
} from "../../scene/sceneGraph";
import { SELF_BINDING_ID, type StandardRigInput } from "@vizij/utils";
import type { BindingMap } from "@vizij/node-graph-authoring";
import { promptDialog, alertDialog } from "../../utils/dialogs";
import { Button, CollapsibleGroup, CollapsibleRow } from "../ui";

interface DriverPanelProps {
  node: SceneObjectNode;
  hiddenMode?: "none" | "grey" | "omit";
  showHideControls?: boolean;
  allowCreate?: boolean;
}

interface DriverFeatureGroup {
  featureId: string;
  label: string;
  drivers: StandardRigInput[];
}

export function DriverPanel({
  node,
  hiddenMode = "grey",
  showHideControls = true,
  allowCreate = true,
}: DriverPanelProps) {
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const bindings = useBindingAuthoring((state) => state.bindings);
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const handleCreateCustomStandardInput = useBindingAuthoring(
    (state) => state.handleCreateCustomStandardInput,
  );
  const hiddenDriverIds = useBindingAuthoring((state) => state.hiddenDriverIds);
  const handleHideDriverState = useBindingAuthoring(
    (state) => state.handleHideDriver,
  );
  const handleShowDriverState = useBindingAuthoring(
    (state) => state.handleShowDriver,
  );
  const handleShowAllDrivers = useBindingAuthoring(
    (state) => state.handleShowAllDrivers,
  );
  const standardInputLookup = useMemo(
    () => new Map(standardInputs.map((input) => [input.id, input])),
    [standardInputs],
  );

  const morphTargets = useGraphRuntime((state) => {
    const renderable = state.world[node.id] as
      | { morphTargets?: string[] }
      | undefined;
    return Array.isArray(renderable?.morphTargets)
      ? (renderable?.morphTargets ?? null)
      : null;
  }, areStringArraysEqual);

  const featureGroups = useMemo<DriverFeatureGroup[]>(() => {
    interface FeatureDriverEntry {
      feature: SceneObjectFeature;
      drivers: StandardRigInput[];
      sortIndex: number;
    }

    const entries: FeatureDriverEntry[] = [];

    node.features.forEach((feature, index) => {
      const driverIds = new Set<string>();
      feature.components.forEach((component) => {
        if (!component.targetId) {
          return;
        }
        const binding = bindings[component.targetId];
        if (!binding?.slots) {
          return;
        }
        binding.slots.forEach((slot) => {
          if (slot.inputId) {
            driverIds.add(slot.inputId);
          }
        });
      });

      if (driverIds.size === 0) {
        return;
      }

      const drivers: StandardRigInput[] = [];
      driverIds.forEach((driverId) => {
        const input = standardInputLookup.get(driverId);
        if (input) {
          drivers.push(input);
        }
      });

      if (drivers.length === 0) {
        driverIds.forEach((driverId) => {
          drivers.push({
            id: driverId,
            path: driverId,
            label: driverId,
            group: "custom",
            defaultValue: 0,
            range: { min: -1, max: 1 },
          } as StandardRigInput);
        });
      }

      entries.push({
        feature,
        drivers,
        sortIndex: index,
      });
    });

    if (entries.length === 0) {
      return [];
    }

    const normalizeKey = (key: string) => key.trim().toLowerCase();
    const getLabel = (feature: SceneObjectFeature) =>
      feature.label || feature.defaultLabel || feature.key || feature.id;

    const groups: Array<DriverFeatureGroup & { sortIndex: number }> = [];
    const processed = new Set<string>();

    const findEntryByKey = (key: string) =>
      entries.find(
        (entry) => normalizeKey(entry.feature.key) === normalizeKey(key),
      );

    const colorEntry = findEntryByKey("color");
    const opacityEntry = findEntryByKey("opacity");

    if (colorEntry && opacityEntry) {
      groups.push({
        featureId: colorEntry.feature.id,
        label: getLabel(colorEntry.feature),
        drivers: mergeDriverLists([colorEntry.drivers, opacityEntry.drivers]),
        sortIndex: Math.min(colorEntry.sortIndex, opacityEntry.sortIndex),
      });
      processed.add(colorEntry.feature.id);
      processed.add(opacityEntry.feature.id);
    }

    const morphKeySet = new Set(
      (morphTargets ?? []).map((key) => normalizeKey(key)),
    );
    if (morphKeySet.size > 0) {
      const morphEntries = entries.filter((entry) =>
        morphKeySet.has(normalizeKey(entry.feature.key)),
      );
      if (morphEntries.length > 0) {
        const sortedMorphEntries = [...morphEntries].sort(
          (a, b) => a.sortIndex - b.sortIndex,
        );
        groups.push({
          featureId: `${node.id}:morph-targets`,
          label: "Morph targets",
          drivers: mergeDriverLists(
            sortedMorphEntries.map((entry) => entry.drivers),
          ),
          sortIndex:
            sortedMorphEntries[0]?.sortIndex ?? Number.MAX_SAFE_INTEGER,
        });
        morphEntries.forEach((entry) => processed.add(entry.feature.id));
      }
    }

    entries.forEach((entry) => {
      if (processed.has(entry.feature.id)) {
        return;
      }
      groups.push({
        featureId: entry.feature.id,
        label: getLabel(entry.feature),
        drivers: entry.drivers,
        sortIndex: entry.sortIndex,
      });
    });

    return groups
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map(({ sortIndex: _sortIndex, ...rest }) => rest);
  }, [bindings, morphTargets, node.features, node.id, standardInputLookup]);

  const directDriverIds = useMemo(() => {
    const ids = new Set<string>();
    featureGroups.forEach((group) => {
      group.drivers.forEach((driver) => ids.add(driver.id));
    });
    return ids;
  }, [featureGroups]);

  const upstreamDrivers = useMemo(() => {
    const parentIds = new Set<string>();
    directDriverIds.forEach((driverId) => {
      const binding = inputBindings[driverId];
      if (!binding) {
        return;
      }
      if (binding.inputId && binding.inputId !== SELF_BINDING_ID) {
        parentIds.add(binding.inputId);
      }
      (binding.slots ?? []).forEach((slot) => {
        if (slot.inputId && slot.inputId !== SELF_BINDING_ID) {
          parentIds.add(slot.inputId);
        }
      });
    });
    directDriverIds.forEach((id) => parentIds.delete(id));
    const parents: StandardRigInput[] = [];
    parentIds.forEach((id) => {
      const input = standardInputLookup.get(id);
      if (input) {
        parents.push(input);
      }
    });
    return parents;
  }, [directDriverIds, inputBindings, standardInputLookup]);

  const hiddenCount = useMemo(() => {
    if (hiddenMode === "none") return 0;
    let count = 0;
    featureGroups.forEach((group) => {
      group.drivers.forEach((driver) => {
        if (hiddenDriverIds.has(driver.id)) {
          count += 1;
        }
      });
    });
    upstreamDrivers.forEach((driver) => {
      if (hiddenDriverIds.has(driver.id)) {
        count += 1;
      }
    });
    return count;
  }, [featureGroups, hiddenDriverIds, upstreamDrivers, hiddenMode]);

  const hasDirectDrivers =
    featureGroups.length > 0 &&
    (hiddenMode !== "omit" ||
      featureGroups.some((group) =>
        group.drivers.some((driver) => !hiddenDriverIds.has(driver.id)),
      ));

  const handleAddDriver = useCallback(() => {
    const response = promptDialog(
      "Enter the rig path for the new driver (e.g., /eyes/blink)",
      "/",
    );
    if (response === null) {
      return;
    }
    const trimmed = response.trim();
    if (!trimmed) {
      alertDialog("Path cannot be empty.");
      return;
    }
    const created = handleCreateCustomStandardInput(trimmed);
    if (created) {
      handleShowDriverState(created.id);
    }
  }, [handleCreateCustomStandardInput, handleShowDriverState]);

  const handleHideDriver = useCallback(
    (driverId: string) => {
      handleHideDriverState(driverId);
    },
    [handleHideDriverState],
  );

  const handleRevealHidden = useCallback(() => {
    handleShowAllDrivers();
  }, [handleShowAllDrivers]);

  const renderDriverRow = (
    driver: StandardRigInput,
    featureId: string,
    isHidden: boolean,
  ) => {
    const value = inputValues[driver.id] ?? driver.defaultValue ?? 0;
    const isGrey = hiddenMode === "grey" && isHidden;
    return (
      <CollapsibleRow
        key={driver.id}
        id={`${featureId}-${driver.id}`}
        title={driver.label ?? driver.id}
        subtitle={driver.path ?? driver.id}
        value={value}
        min={driver.range.min}
        max={driver.range.max}
        step={(driver.range.max - driver.range.min) / 200}
        onValueChange={(next) => {
          handleInputValueChange(driver.id, next);
        }}
        className={`driver-group__row ${
          isGrey ? "driver-group__row--hidden" : ""
        }`}
        actions={
          showHideControls && hiddenMode !== "omit" ? (
            isHidden ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleShowDriverState(driver.id)}
              >
                Show
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleHideDriver(driver.id)}
              >
                Hide
              </Button>
            )
          ) : null
        }
      />
    );
  };

  const showToolbar = allowCreate || (showHideControls && hiddenCount > 0);

  return (
    <div className="driver-div">
      {showToolbar ? (
        <div className="driver-panel__toolbar">
          {allowCreate ? (
            <Button variant="primary" onClick={handleAddDriver}>
              Add new driver
            </Button>
          ) : null}
          {showHideControls && hiddenCount > 0 ? (
            <Button variant="subtle" onClick={handleRevealHidden}>
              Show hidden ({hiddenCount})
            </Button>
          ) : null}
        </div>
      ) : null}

      {!hasDirectDrivers ? (
        <p className="sidebar__empty">
          No drivers are mapped to this object yet.
        </p>
      ) : (
        <div className="driver-group-list">
          {featureGroups
            .filter((group) => {
              if (hiddenMode !== "omit") return true;
              return group.drivers.some(
                (driver) => !hiddenDriverIds.has(driver.id),
              );
            })
            .map((group) => {
              const driversForGroup =
                hiddenMode === "omit"
                  ? group.drivers.filter(
                      (driver) => !hiddenDriverIds.has(driver.id),
                    )
                  : group.drivers;
              if (driversForGroup.length === 0) return null;
              const hideGroupAction =
                showHideControls && hiddenMode !== "omit" ? (
                  <Button
                    variant="subtle"
                    className="collapsible-row__icon-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      driversForGroup.forEach((driver) =>
                        handleHideDriver(driver.id),
                      );
                    }}
                    aria-label={`Hide drivers in ${group.label}`}
                    title="Hide group"
                  >
                    👁
                  </Button>
                ) : null;
              return (
                <CollapsibleGroup
                  key={group.featureId}
                  title={group.label}
                  itemCount={driversForGroup.length}
                  className="driver-group"
                >
                  {driversForGroup.map((driver) =>
                    renderDriverRow(
                      driver,
                      group.featureId,
                      hiddenDriverIds.has(driver.id),
                    ),
                  )}
                  {hideGroupAction}
                </CollapsibleGroup>
              );
            })}
        </div>
      )}

      {upstreamDrivers.length > 0 ? (
        <div className="driver-upstream">
          <h4>Parent drivers</h4>
          <ul>
            {upstreamDrivers
              .filter(
                (driver) =>
                  hiddenMode !== "omit" || !hiddenDriverIds.has(driver.id),
              )
              .map((driver) => {
                const isHidden = hiddenDriverIds.has(driver.id);
                const isGrey = hiddenMode === "grey" && isHidden;
                return (
                  <li
                    key={driver.id}
                    className={isGrey ? "driver-group__row--hidden" : undefined}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleInputValueChange(driver.id, 0)}
                    >
                      Reset
                    </Button>
                    <span>{driver.label ?? driver.id}</span>
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function mergeDriverLists(lists: StandardRigInput[][]): StandardRigInput[] {
  const seen = new Set<string>();
  const result: StandardRigInput[] = [];
  lists.forEach((list) => {
    list.forEach((driver) => {
      if (seen.has(driver.id)) {
        return;
      }
      seen.add(driver.id);
      result.push(driver);
    });
  });
  return result;
}

function areStringArraysEqual(a: string[] | null, b: string[] | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function collectDriversForNode(
  node: SceneObjectNode,
  bindings: BindingMap,
  standardInputs: StandardRigInput[],
): StandardRigInput[] {
  const standardInputLookup = new Map(
    standardInputs.map((input) => [input.id, input]),
  );
  const seen = new Set<string>();
  const drivers: StandardRigInput[] = [];

  node.features.forEach((feature) => {
    feature.components.forEach((component) => {
      if (!component.targetId) {
        return;
      }
      const binding = bindings[component.targetId];
      if (!binding?.slots) {
        return;
      }
      binding.slots.forEach((slot) => {
        const inputId = slot.inputId;
        if (!inputId || seen.has(inputId)) {
          return;
        }
        seen.add(inputId);
        const standard = standardInputLookup.get(inputId);
        if (standard) {
          drivers.push(standard);
        } else {
          drivers.push({
            id: inputId,
            path: inputId,
            label: inputId,
            group: "custom",
            defaultValue: 0,
            range: { min: -1, max: 1 },
          } as StandardRigInput);
        }
      });
    });
  });

  return drivers;
}
