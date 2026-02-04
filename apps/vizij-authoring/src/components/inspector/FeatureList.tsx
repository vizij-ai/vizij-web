import React, { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { BindingMap, BindingValueType } from "@vizij/node-graph-authoring";
import {
  SELF_BINDING_ID,
  type AnimatableValue,
  type RawValue,
  type StandardRigInput,
} from "@vizij/utils";
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
import {
  Button,
  CollapsibleGroup,
  CollapsibleRow,
  Input,
  Switch,
  Chip,
} from "../ui";
import { cn } from "../../utils/cn";

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
    <div className="flex flex-col gap-2">
      {mode === "bindings" && hiddenDriverIds.size > 0 && showHideControls && (
        <div className="flex items-center gap-2 px-1 mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px]"
            onClick={handleShowAllDrivers}
          >
            Show hidden ({hiddenDriverIds.size})
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-3">
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
      <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-800/30 border border-slate-800/50">
        <span className="text-[9px] uppercase font-bold text-slate-500">
          Animated
        </span>
        <Switch
          checked={isAnimated}
          onChange={(checked) => onToggleAnimated(feature.id, checked)}
        />
      </div>
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
        className="border-slate-800/60 bg-slate-900/20"
      >
        <div className="flex flex-col gap-2 p-1">
          {isAnimated ? (
            <div className="overflow-hidden rounded border border-slate-800/40">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800/40 border-b border-slate-800/40">
                    <th className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Property
                    </th>
                    <th className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Min
                    </th>
                    <th className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Default
                    </th>
                    <th className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Max
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/30">
                  {matrixRows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-800/20 transition-colors"
                    >
                      <th
                        scope="row"
                        className="px-3 py-2 text-[11px] font-medium text-slate-300"
                      >
                        {row.label}
                      </th>
                      <td className="px-3 py-1">{row.min}</td>
                      <td className="px-3 py-1">{row.defaultValue}</td>
                      <td className="px-3 py-1">{row.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-hidden rounded border border-slate-800/40">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800/40 border-b border-slate-800/40">
                    <th className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Property
                    </th>
                    <th className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                      Static Value
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/30">
                  {matrixRows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-800/20 transition-colors"
                    >
                      <th
                        scope="row"
                        className="px-3 py-2 text-[11px] font-medium text-slate-300"
                      >
                        {row.label}
                      </th>
                      <td className="px-3 py-1 text-right">
                        {row.staticValue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
    <p className="text-[11px] text-slate-500 italic py-2 px-3">
      No binding active
    </p>
  );

  if (shouldOmit) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-800/60 bg-slate-950/10 mb-2 overflow-hidden",
        isGrey && "opacity-50 grayscale-[0.5]",
      )}
    >
      {isGrey && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/40 text-[10px] text-slate-400">
          <Chip tone="warning" className="h-4 text-[9px] px-1 uppercase">
            Hidden
          </Chip>
          <span className="flex-1 italic">
            This binding is hidden in rigging
          </span>
          {hiddenSlotIds.length > 0 && onShowDriver && (
            <Button
              variant="secondary"
              size="sm"
              className="h-5 px-2 text-[9px]"
              onClick={handleUnhide}
            >
              Unhide
            </Button>
          )}
        </div>
      )}
      <CollapsibleRow
        id={rowId}
        title={title}
        subtitle={subtitle}
        showSlider={false}
        expandedContent={content}
        className="border-none m-0 rounded-none bg-transparent"
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
      className="h-6 w-16 text-[11px] bg-slate-950/40 border-slate-800/60"
      value={(compConstraints[kind] ?? featureConstraints[kind] ?? "") as any}
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
          className="h-6 w-16 text-[11px] bg-slate-950/40 border-slate-800/60"
          value={defaultValue as any}
          onChange={(e) => onDefaultChange(feature.id, Number(e.target.value))}
        />
      ) : (
        defaultValue
      ),
    staticValue:
      typeof staticValue === "number" ? (
        <Input
          type="number"
          className="h-6 w-16 text-[11px] bg-slate-950/40 border-slate-800/60"
          value={staticValue as any}
          onChange={(e) => onStaticChange(feature.id, Number(e.target.value))}
        />
      ) : (
        staticValue
      ),
  };
}
