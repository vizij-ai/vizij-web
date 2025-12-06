import React, { useCallback, useMemo, type ReactNode } from "react";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import {
  BindingEditor,
  normalizeSlotExpression,
  buildPiecewiseNormalizeSnippet,
} from "../binding";
import { promptDialog, alertDialog } from "../../utils/dialogs";
import type {
  SceneObjectNode,
  SceneObjectFeature,
  SceneFeatureComponent,
} from "../../scene/sceneGraph";
import type { BindingMap, BindingValueType } from "@vizij/node-graph-authoring";
import {
  SELF_BINDING_ID,
  type AnimatableValue,
  type RawValue,
  type StandardRigInput,
} from "@vizij/utils";
import { Button, CollapsibleGroup, CollapsibleRow, Input } from "../ui";
import "./feature-list.css";

interface FeatureListProps {
  node: SceneObjectNode;
  mode: "features" | "bindings";
  hiddenMode?: "none" | "grey" | "omit";
  showHideControls?: boolean;
}

export function FeatureList({
  node,
  mode,
  hiddenMode = "grey",
  showHideControls = true,
}: FeatureListProps) {
  const {
    setFeatureAnimated,
    setFeatureDefault,
    setStaticFeatureValue,
    setDriverInput,
    addDriverSlot,
    removeDriverSlot,
    setDriverExpression,
    setDriverSlotAlias,
    setDriverSlotValueType,
    updateAnimatableDescriptor,
  } = useSceneComposer();

  const bindings = useBindingAuthoring((state) => state.bindings);
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const handleCreateCustomStandardInput = useBindingAuthoring(
    (state) => state.handleCreateCustomStandardInput,
  );
  const onUpdateStandardInput = useBindingAuthoring(
    (state) => state.handleUpdateStandardInput,
  );
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const hiddenDriverIds = useBindingAuthoring((state) => state.hiddenDriverIds);
  const handleHideDriver = useBindingAuthoring(
    (state) => state.handleHideDriver,
  );
  const handleShowDriver = useBindingAuthoring(
    (state) => state.handleShowDriver,
  );
  const handleShowAllDrivers = useBindingAuthoring(
    (state) => state.handleShowAllDrivers,
  );

  const handleToggleAnimated = useCallback(
    (featureId: string, animated: boolean) => {
      setFeatureAnimated(node.id, featureId, animated);
    },
    [node.id, setFeatureAnimated],
  );

  const handleStaticChange = useCallback(
    (featureId: string, value: number | Record<string, number> | number[]) => {
      setStaticFeatureValue(node.id, featureId, value as RawValue);
    },
    [node.id, setStaticFeatureValue],
  );

  const handleDefaultChange = useCallback(
    (featureId: string, value: number | Record<string, number> | number[]) => {
      setFeatureDefault(node.id, featureId, value as RawValue);
    },
    [node.id, setFeatureDefault],
  );

  const handleConstraintChange = useCallback(
    (
      featureId: string,
      animatableId: string,
      updater: (
        current: NonNullable<AnimatableValue["constraints"]>,
      ) => NonNullable<AnimatableValue["constraints"]>,
    ) => {
      updateAnimatableDescriptor(animatableId, (current: AnimatableValue) => {
        const currentConstraints =
          current.constraints ??
          ({} as NonNullable<AnimatableValue["constraints"]>);
        const updatedConstraints = updater({ ...currentConstraints });
        return {
          ...current,
          constraints: updatedConstraints,
        } as AnimatableValue;
      });
    },
    [updateAnimatableDescriptor],
  );

  const handleBindingInputChange = useCallback(
    (targetId: string, inputId: string | null, slotId?: string) => {
      setDriverInput(targetId, inputId, slotId ? { slotId } : undefined);
    },
    [setDriverInput],
  );

  const handleResetBinding = useCallback(
    (targetId: string) => {
      setDriverInput(targetId, null);
    },
    [setDriverInput],
  );

  const handleRequestCreateStandardInput = useCallback(
    (suggestedPath?: string): StandardRigInput | null => {
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
    },
    [handleCreateCustomStandardInput],
  );

  const handleUpdateStandardInputWrapper = useCallback(
    (
      inputId: string,
      updates: {
        path?: string;
        label?: string;
        sourceId?: string | null;
        defaultValue?: number;
        range?: { min?: number; max?: number };
      },
    ) => {
      onUpdateStandardInput(inputId, updates);
    },
    [onUpdateStandardInput],
  );

  const handleNormalizeSlot = useCallback(
    (
      targetId: string,
      slotId: string,
      outputRange?: { min: number; max: number; default: number },
    ) => {
      const binding = bindings[targetId];
      if (!binding || !binding.slots) return;

      const slotIndex = binding.slots.findIndex((s) => s.id === slotId);
      if (slotIndex === -1) return;
      const slot = binding.slots[slotIndex];

      if (!slot.inputId) return;

      const aliasCandidate = slot.alias?.trim();
      const slotAlias =
        aliasCandidate && aliasCandidate.length > 0
          ? aliasCandidate
          : `s${slotIndex + 1}`;

      // Use provided output range or default to -1..1
      const outMin = outputRange?.min ?? -1;
      const outMax = outputRange?.max ?? 1;
      const clampedDefault = outputRange?.default ?? 0;

      const snippet = buildPiecewiseNormalizeSnippet(
        slotAlias,
        outMin,
        clampedDefault,
        outMax,
      );

      const normalizationResult = normalizeSlotExpression({
        expression: binding.expression,
        alias: slotAlias,
        snippet,
      });

      if (normalizationResult.status === "alias-missing") {
        alertDialog(
          `Normalize input couldn't find "${slotAlias}" in the current expression. Update the expression manually, then try again.`,
        );
        return;
      }
      if (normalizationResult.status === "already-normalized") {
        alertDialog(
          `Slot "${slotAlias}" already includes a piecewise_remap. Edit it directly in the expression editor if you need to change it.`,
        );
        return;
      }

      setDriverExpression(targetId, normalizationResult.expression);
      onUpdateStandardInput(slot.inputId, {
        defaultValue: 0,
        range: { min: -1, max: 1 },
      });
      handleInputValueChange(slot.inputId, 0);
    },
    [
      bindings,
      setDriverExpression,
      onUpdateStandardInput,
      handleInputValueChange,
    ],
  );

  return (
    <div className="feature-list">
      {mode === "bindings" && hiddenDriverIds.size > 0 && showHideControls && (
        <div
          className="driver-panel__toolbar"
          style={{ marginBottom: "0.75rem" }}
        >
          <Button variant="subtle" onClick={handleShowAllDrivers}>
            Show hidden ({hiddenDriverIds.size})
          </Button>
        </div>
      )}
      {node.features.map((feature) => (
        <FeatureRow
          key={feature.id}
          feature={feature}
          mode={mode}
          bindings={bindings}
          standardInputs={standardInputs}
          standardInputLookup={standardInputsById}
          inputValues={inputValues}
          nodeLabel={node.name}
          onToggleAnimated={handleToggleAnimated}
          onStaticChange={handleStaticChange}
          onDefaultChange={handleDefaultChange}
          onConstraintChange={handleConstraintChange}
          onBindingInputChange={handleBindingInputChange}
          onAddBindingSlot={addDriverSlot}
          onRemoveBindingSlot={removeDriverSlot}
          onBindingExpressionChange={setDriverExpression}
          onBindingSlotAliasChange={setDriverSlotAlias}
          onBindingSlotValueTypeChange={setDriverSlotValueType}
          onNormalizeBindingSlot={handleNormalizeSlot}
          onRequestCreateStandardInput={handleRequestCreateStandardInput}
          onResetBinding={handleResetBinding}
          onUpdateStandardInput={handleUpdateStandardInputWrapper}
          onInputValueChange={handleInputValueChange}
          hiddenDriverIds={hiddenDriverIds}
          onHideDriver={handleHideDriver}
          onShowDriver={handleShowDriver}
          hiddenMode={hiddenMode}
          showHideControls={showHideControls}
        />
      ))}
    </div>
  );
}

interface FeatureRowProps {
  feature: SceneObjectFeature;
  mode: "features" | "bindings";
  bindings: BindingMap;
  standardInputs: StandardRigInput[];
  standardInputLookup: Map<string, StandardRigInput>;
  inputValues: Record<string, number>;
  nodeLabel: string;
  onToggleAnimated: (featureId: string, animated: boolean) => void;
  onStaticChange: (
    featureId: string,
    value: number | Record<string, number> | number[],
  ) => void;
  onDefaultChange: (
    featureId: string,
    value: number | Record<string, number> | number[],
  ) => void;
  onConstraintChange: (
    featureId: string,
    animatableId: string,
    updater: (
      current: NonNullable<AnimatableValue["constraints"]>,
    ) => NonNullable<AnimatableValue["constraints"]>,
  ) => void;
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
  onNormalizeBindingSlot: (
    targetId: string,
    slotId: string,
    outputRange?: { min: number; max: number; default: number },
  ) => void;
  onRequestCreateStandardInput: (
    suggestedPath?: string,
  ) => StandardRigInput | null;
  onResetBinding: (targetId: string) => void;
  onUpdateStandardInput: (
    inputId: string,
    updates: {
      path?: string;
      label?: string;
      sourceId?: string | null;
      defaultValue?: number;
      range?: { min?: number; max?: number };
    },
  ) => void;
  onInputValueChange: (inputId: string, value: number) => void;
  hiddenDriverIds?: Set<string>;
  onHideDriver?: (id: string) => void;
  onShowDriver?: (id: string) => void;
  hiddenMode?: "none" | "grey" | "omit";
  showHideControls?: boolean;
}

function FeatureRow(props: FeatureRowProps) {
  const {
    feature,
    mode,
    onToggleAnimated,
    onDefaultChange,
    onConstraintChange,
    onStaticChange,
  } = props;
  const isAnimated = feature.animated;

  if (mode === "features") {
    const subtitleParts = [] as string[];
    if (feature.elementName) {
      subtitleParts.push(feature.elementName);
    }
    subtitleParts.push(feature.elementType);
    const subtitle = subtitleParts.filter(Boolean).join(" · ");

    const toggleAction = (
      <label className="feature-row__toggle">
        <input
          type="checkbox"
          checked={isAnimated}
          onChange={(e) => onToggleAnimated(feature.id, e.target.checked)}
        />
        Animated
      </label>
    );

    const matrixRows = feature.components.map((component) =>
      buildFeatureMatrixRow({
        feature,
        component,
        onDefaultChange,
        onConstraintChange,
        onStaticChange,
      }),
    );

    return (
      <CollapsibleGroup
        key={feature.id}
        title={feature.label}
        subtitle={subtitle}
        actions={toggleAction}
        className="feature-row feature-row--collapsible"
      >
        {isAnimated ? (
          <table className="feature-matrix">
            <thead>
              <tr>
                <th>Property</th>
                <th>Min</th>
                <th>Default</th>
                <th>Max</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td>{row.min}</td>
                  <td>{row.defaultValue}</td>
                  <td>{row.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="feature-matrix feature-matrix--static">
            <thead>
              <tr>
                <th>Property</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td>{row.staticValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsibleGroup>
    );
  }

  if (mode === "bindings") {
    if (!isAnimated) {
      return null;
    }
    return (
      <div className="feature-row feature-row--bindings">
        {feature.components.map((component) => (
          <FeatureBindingRow
            key={component.id}
            feature={feature}
            component={component}
            bindings={props.bindings}
            standardInputs={props.standardInputs}
            standardInputLookup={props.standardInputLookup}
            inputValues={props.inputValues}
            onBindingInputChange={props.onBindingInputChange}
            onAddBindingSlot={props.onAddBindingSlot}
            onRemoveBindingSlot={props.onRemoveBindingSlot}
            onBindingExpressionChange={props.onBindingExpressionChange}
            onBindingSlotAliasChange={props.onBindingSlotAliasChange}
            onBindingSlotValueTypeChange={props.onBindingSlotValueTypeChange}
            onNormalizeBindingSlot={props.onNormalizeBindingSlot}
            onRequestCreateStandardInput={props.onRequestCreateStandardInput}
            onResetBinding={props.onResetBinding}
            onInputValueChange={props.onInputValueChange}
            hiddenDriverIds={props.hiddenDriverIds}
            onHideDriver={props.onHideDriver}
            onShowDriver={props.onShowDriver}
            hiddenMode={props.hiddenMode}
            showHideControls={props.showHideControls}
          />
        ))}
      </div>
    );
  }

  return null;
}

interface FeatureBindingRowProps {
  feature: SceneObjectFeature;
  component: SceneFeatureComponent;
  bindings: BindingMap;
  standardInputs: StandardRigInput[];
  standardInputLookup: Map<string, StandardRigInput>;
  inputValues: Record<string, number>;
  onBindingInputChange: FeatureRowProps["onBindingInputChange"];
  onAddBindingSlot: FeatureRowProps["onAddBindingSlot"];
  onRemoveBindingSlot: FeatureRowProps["onRemoveBindingSlot"];
  onBindingExpressionChange: FeatureRowProps["onBindingExpressionChange"];
  onBindingSlotAliasChange: FeatureRowProps["onBindingSlotAliasChange"];
  onBindingSlotValueTypeChange: FeatureRowProps["onBindingSlotValueTypeChange"];
  onNormalizeBindingSlot: FeatureRowProps["onNormalizeBindingSlot"];
  onRequestCreateStandardInput: FeatureRowProps["onRequestCreateStandardInput"];
  onResetBinding: FeatureRowProps["onResetBinding"];
  onInputValueChange: FeatureRowProps["onInputValueChange"];
  hiddenDriverIds?: Set<string>;
  onHideDriver?: (id: string) => void;
  onShowDriver?: (id: string) => void;
  hiddenMode?: "none" | "grey" | "omit";
  showHideControls?: boolean;
}

function FeatureBindingRow({
  feature,
  component,
  bindings,
  standardInputs,
  standardInputLookup,
  inputValues,
  onBindingInputChange,
  onAddBindingSlot,
  onRemoveBindingSlot,
  onBindingExpressionChange,
  onBindingSlotAliasChange,
  onBindingSlotValueTypeChange,
  onNormalizeBindingSlot,
  onRequestCreateStandardInput,
  onResetBinding,
  onInputValueChange,
  hiddenDriverIds,
  onHideDriver,
  onShowDriver,
  hiddenMode = "grey",
  showHideControls = true,
}: FeatureBindingRowProps) {
  const targetId = component.targetId;
  const binding = targetId ? bindings[targetId] : undefined;
  const rowId = `${feature.id}-${component.id}`;
  const title = buildComponentTitle(feature, component);
  const subtitle = feature.elementName
    ? `${feature.elementName} (${feature.elementType})`
    : feature.elementType;

  const range = {
    min: getConstraintValue(feature, component, "min"),
    max: getConstraintValue(feature, component, "max"),
    default: getDefaultValue(feature, component),
  };

  const { allHidden, hiddenSlotIds } = useMemo(() => {
    if (!binding?.slots || binding.slots.length === 0) {
      return { allHidden: false, hiddenSlotIds: [] as string[] };
    }
    if (!hiddenDriverIds || hiddenDriverIds.size === 0) {
      return { allHidden: false, hiddenSlotIds: [] as string[] };
    }
    const resolved = binding.slots
      .map((slot) =>
        resolveSlotDriverId(slot, standardInputs, standardInputLookup),
      )
      .filter((id): id is string => Boolean(id));
    const hiddenIds = resolved.filter((id) => hiddenDriverIds.has(id));
    return {
      allHidden: hiddenIds.length > 0 && hiddenIds.length === resolved.length,
      hiddenSlotIds: hiddenIds,
    };
  }, [binding?.slots, hiddenDriverIds, standardInputs, standardInputLookup]);

  if (!targetId) {
    return null;
  }

  const shouldOmit = hiddenMode === "omit" && allHidden;
  const isGrey = hiddenMode === "grey" && allHidden;

  const handleUnhide = () => {
    if (!onShowDriver) return;
    hiddenSlotIds.forEach((id) => onShowDriver(id));
  };

  const content = binding ? (
    <BindingEditor
      binding={binding}
      targetId={targetId}
      label={`${feature.label} ${component.label ?? ""}`.trim()}
      standardInputs={standardInputs}
      standardInputLookup={standardInputLookup}
      onBindingInputChange={onBindingInputChange}
      onAddBindingSlot={onAddBindingSlot}
      onRemoveBindingSlot={onRemoveBindingSlot}
      onBindingExpressionChange={onBindingExpressionChange}
      onBindingSlotAliasChange={onBindingSlotAliasChange}
      onBindingSlotValueTypeChange={onBindingSlotValueTypeChange}
      onNormalizeBindingSlot={(tid, sid) =>
        onNormalizeBindingSlot(tid, sid, range)
      }
      onRequestCreateStandardInput={onRequestCreateStandardInput}
      onResetBinding={onResetBinding}
      expandable={false}
      defaultExpanded={true}
      currentValues={inputValues}
      onInputValueChange={onInputValueChange}
      hiddenDriverIds={hiddenDriverIds}
      onHideDriver={showHideControls ? onHideDriver : undefined}
      onShowDriver={showHideControls ? onShowDriver : undefined}
      featureFlags={{
        vectorAuthoringBeta: true,
        conditionalAuthoringBeta: true,
      }}
    />
  ) : (
    <p className="sidebar__hint">No binding active</p>
  );

  if (shouldOmit) {
    return null;
  }

  return (
    <div
      className={`feature-binding-row ${
        isGrey ? "feature-binding-row--hidden" : ""
      }`}
    >
      {isGrey ? (
        <div className="feature-binding-row__hidden-note">
          Hidden in Rigging
          {hiddenSlotIds.length > 0 && onShowDriver ? (
            <button
              type="button"
              className="feature-binding-row__hidden-button"
              onClick={handleUnhide}
            >
              Unhide
            </button>
          ) : null}
        </div>
      ) : null}
      <CollapsibleRow
        id={rowId}
        title={title}
        subtitle={subtitle}
        showSlider={false}
        expandedContent={content}
        className="feature-binding-row__row"
      />
    </div>
  );
}

type BindingSlot = BindingMap[keyof BindingMap]["slots"][number];

function resolveSlotDriverId(
  slot: BindingSlot,
  standardInputs: StandardRigInput[],
  standardInputLookup: Map<string, StandardRigInput>,
): string | null {
  const rawId = slot.inputId ?? null;
  if (!rawId || rawId === SELF_BINDING_ID) {
    return null;
  }
  const direct = standardInputLookup.get(rawId);
  if (direct) {
    return direct.id;
  }
  const normalizedSlotId = normalizeInputIdentifier(rawId);
  const fallback = standardInputs.find(
    (input) => normalizeInputIdentifier(input.id) === normalizedSlotId,
  );
  return fallback?.id ?? rawId;
}

function normalizeInputIdentifier(value: string): string {
  return value.replace(/^\/+/, "").replace(/\//g, "_");
}

function buildComponentTitle(
  feature: SceneObjectFeature,
  component: SceneFeatureComponent,
): string {
  const parts: string[] = [];
  if (feature.label) {
    parts.push(feature.label);
  }
  if (component.label) {
    parts.push(component.label);
  }
  return parts.join(" · ") || component.id;
}

type ConstraintCarrier = Partial<{
  constraints?: { min?: number; max?: number };
}>;
type DefaultCarrier = Partial<{
  defaultValue?: unknown;
  staticValue?: unknown;
}>;

function getConstraintValue(
  feature: SceneObjectFeature,
  component: SceneFeatureComponent,
  key: "min" | "max",
): number {
  const compConstraints = (component as ConstraintCarrier).constraints;
  const featureConstraints = (feature as ConstraintCarrier).constraints;
  const value = compConstraints?.[key] ?? featureConstraints?.[key];
  return typeof value === "number" ? value : 0;
}

function getDefaultValue(
  feature: SceneObjectFeature,
  component: SceneFeatureComponent,
): number {
  const rawDefault =
    (component as DefaultCarrier).defaultValue ??
    (feature as DefaultCarrier).defaultValue;
  return typeof rawDefault === "number" ? rawDefault : 0;
}

interface FeatureMatrixRow {
  id: string;
  label: string;
  min: number | ReactNode;
  max: number | ReactNode;
  defaultValue: number | ReactNode;
  staticValue?: number | ReactNode;
}

function buildFeatureMatrixRow({
  feature,
  component,
  onDefaultChange,
  onConstraintChange,
  onStaticChange,
}: {
  feature: SceneObjectFeature;
  component: SceneFeatureComponent;
  onDefaultChange: FeatureRowProps["onDefaultChange"];
  onConstraintChange: FeatureRowProps["onConstraintChange"];
  onStaticChange: FeatureRowProps["onStaticChange"];
}): FeatureMatrixRow {
  const id = `${feature.id}-${component.id}`;
  const label = component.label ?? component.id;
  const compConstraints = (component as ConstraintCarrier).constraints ?? {};
  const featureConstraints = (feature as ConstraintCarrier).constraints ?? {};
  const rawMin = compConstraints.min ?? featureConstraints.min;
  const rawMax = compConstraints.max ?? featureConstraints.max;
  const min = typeof rawMin === "number" ? rawMin : "—";
  const max = typeof rawMax === "number" ? rawMax : "—";

  const rawDefault =
    (component as DefaultCarrier).defaultValue ??
    (feature as DefaultCarrier).defaultValue;
  const defaultValue = typeof rawDefault === "number" ? rawDefault : "—";

  const rawStatic =
    (component as DefaultCarrier).staticValue ??
    (feature as DefaultCarrier).staticValue;
  const staticValue = typeof rawStatic === "number" ? rawStatic : "—";

  const constraintEditor = (kind: "min" | "max") => (
    <Input
      type="number"
      value={compConstraints[kind] ?? featureConstraints[kind] ?? ""}
      onChange={(e) => {
        const next = Number(e.target.value);
        onConstraintChange(feature.id, component.id, (current) => ({
          ...current,
          [kind]: next,
        }));
      }}
    />
  );

  return {
    id,
    label,
    min: typeof min === "number" ? constraintEditor("min") : min,
    max: typeof max === "number" ? constraintEditor("max") : max,
    defaultValue:
      typeof defaultValue === "number" ? (
        <Input
          type="number"
          value={defaultValue}
          onChange={(e) => onDefaultChange(feature.id, Number(e.target.value))}
        />
      ) : (
        defaultValue
      ),
    staticValue:
      typeof staticValue === "number" ? (
        <Input
          type="number"
          value={staticValue}
          onChange={(e) => onStaticChange(feature.id, Number(e.target.value))}
        />
      ) : (
        staticValue
      ),
  };
}
