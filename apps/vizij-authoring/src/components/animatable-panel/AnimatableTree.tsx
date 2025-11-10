import {
  useCallback,
  useMemo,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { formatRawValue } from "../../utils/format";
import {
  ensureVectorValue,
  cloneVectorTuple,
  isApproximatelyEqual,
} from "./panelUtils";
import { RigPreview } from "./RigPreview";
import {
  useSlotDiagnosticsResolver,
  type SlotDiagnosticsNode,
} from "./SlotDiagnosticsContext";
import { SELF_BINDING_ID } from "@vizij/utils";
import type {
  BindingField,
  BindingTarget,
  FeatureEntry,
  FeatureTreeNode,
  PropertyNode,
  ShapeTreeNode,
  VectorDefaults,
  VectorFeatureEntry,
} from "./types";
import type { AnimatableTreeState } from "./useAnimatableTreeState";
import {
  computeNumberBounds,
  computeVectorBounds,
  getLookup,
} from "@vizij/utils";
import type {
  AnimatableComponent,
  AnimatableNumber,
  AnimatableValue,
  AnimatableVector3,
  AnimatableEuler,
  AnimatableColor,
  RawValue,
} from "@vizij/utils";
import {
  type BindingMap,
  type StandardInputValues,
  type BindingValueType,
} from "@vizij/node-graph-authoring";
import type { StandardRigInput } from "@vizij/utils";
import { BindingEditor } from "./BindingEditor";
import { formatRigPathLabel } from "../../utils/rigPaths";

type OutputControlConfig = {
  defaultValue: number;
  minValue: number | null;
  maxValue: number | null;
  step: number;
  minLimit?: number;
  maxLimit?: number;
  onDefaultChange: (value: number) => void;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
};

interface PropertyBindingRowProps {
  property: PropertyNode;
  bindingTarget: BindingTarget | undefined;
  treeState: AnimatableTreeState;
  standardInputs: StandardRigInput[];
  standardInputLookup: Map<string, StandardRigInput>;
  faceId?: string | null;
  namespace: string;
  values: Map<string, RawValue | undefined>;
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
  onResetBinding: (targetId: string) => void;
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
  outputControls?: OutputControlConfig;
  featureFlags: Record<string, boolean>;
}

function PropertyBindingRow({
  property,
  bindingTarget,
  treeState,
  standardInputs,
  standardInputLookup,
  faceId,
  namespace,
  values,
  onBindingInputChange,
  onBindingRemapChange,
  onResetBinding,
  onRequestCreateStandardInput,
  onAddBindingSlot,
  onRemoveBindingSlot,
  onBindingExpressionChange,
  onBindingSlotAliasChange,
  onBindingSlotValueTypeChange,
  outputControls,
  featureFlags,
}: PropertyBindingRowProps) {
  const expanded = treeState.isExpanded("property", property.id);

  const binding = bindingTarget?.binding ?? null;
  const targetId = bindingTarget?.targetId ?? null;
  const liveOutputAnimatableId = bindingTarget?.component.animatableId ?? null;
  const resolveSlotDiagnostics = useSlotDiagnosticsResolver();

  const currentOutputValue = useMemo(() => {
    if (!liveOutputAnimatableId) {
      return undefined;
    }
    const lookupKey = getLookup(namespace, liveOutputAnimatableId);
    return values.get(lookupKey);
  }, [liveOutputAnimatableId, namespace, values]);

  const slotPipelines = useMemo(() => {
    if (!bindingTarget || !binding?.slots) {
      return [] as Array<{
        id: string;
        alias?: string | null;
        inputLabel: string;
        upstreamNodes: SlotDiagnosticsNode[];
        downstreamNodes: SlotDiagnosticsNode[];
        expressionNode?: SlotDiagnosticsNode;
      }>;
    }
    return binding.slots.map((slot, index) => {
      const diagnostics = slot.id
        ? resolveSlotDiagnostics?.(bindingTarget.targetId, slot.id)
        : undefined;
      const upstreamNodes = diagnostics?.upstreamNodes ?? [];
      const downstreamNodes = diagnostics?.downstreamNodes ?? [];
      let inputLabel = "Unbound";
      if (slot.inputId === SELF_BINDING_ID) {
        inputLabel = "Self";
      } else if (slot.inputId) {
        const meta = standardInputLookup.get(slot.inputId);
        inputLabel = meta?.path
          ? formatRigPathLabel(meta.path, faceId)
          : (meta?.label ?? slot.inputId);
      }
      return {
        id: slot.id ?? `${bindingTarget.targetId}:${index}`,
        alias: slot.alias,
        inputLabel,
        upstreamNodes,
        downstreamNodes,
        expressionNode: diagnostics?.expressionNode,
      };
    });
  }, [
    binding,
    bindingTarget,
    resolveSlotDiagnostics,
    standardInputLookup,
    faceId,
  ]);

  if (!bindingTarget || !binding || !targetId) {
    return (
      <div className="feature-tree__property-row">
        <div className="feature-tree__property-main">
          <span className="feature-tree__property-label">{property.label}</span>
        </div>
      </div>
    );
  }

  const issueList = bindingTarget.issues ?? [];

  const handleExpandedChange = (nextExpanded: boolean) => {
    treeState.setExpanded("property", property.id, nextExpanded);
  };

  const formattedCurrentOutput =
    currentOutputValue !== undefined
      ? formatRawValue(currentOutputValue)
      : formatRawValue(bindingTarget.component.defaultValue);

  const liveOutputNode = (
    <span className="feature-tree__property-live">
      <span className="feature-tree__property-live-label">Current output</span>
      <span className="feature-tree__property-live-value">
        {formattedCurrentOutput}
      </span>
    </span>
  );

  return (
    <>
      {slotPipelines.length > 0 && (
        <div className="feature-tree__property-pipeline">
          <h4 className="feature-tree__section-title">Signal path</h4>
          <ul className="feature-tree__pipeline-list">
            {slotPipelines.map((slot) => (
              <li key={slot.id} className="feature-tree__pipeline-item">
                <div className="feature-tree__pipeline-row">
                  <span className="feature-tree__pipeline-alias">
                    {slot.alias ?? "Slot"}
                  </span>
                  <span className="feature-tree__pipeline-arrow">→</span>
                  <span className="feature-tree__pipeline-input">
                    {slot.inputLabel}
                  </span>
                </div>
                {slot.upstreamNodes.length > 0 && (
                  <div className="feature-tree__pipeline-track">
                    <span className="feature-tree__pipeline-track-label">
                      Input chain
                    </span>
                    <div className="feature-tree__pipeline-track-chips">
                      <span className="feature-tree__pipeline-chip feature-tree__pipeline-chip--input">
                        {slot.inputLabel}
                      </span>
                      {slot.upstreamNodes.map((node) => (
                        <span
                          key={`${slot.id}-up-${node.id}`}
                          className="feature-tree__pipeline-chip"
                          title={`${node.label} · ${node.type}`}
                        >
                          {node.label}
                        </span>
                      ))}
                      <span className="feature-tree__pipeline-chip feature-tree__pipeline-chip--alias">
                        {slot.alias ?? "Slot"}
                      </span>
                    </div>
                  </div>
                )}
                {(slot.expressionNode || slot.downstreamNodes.length > 0) && (
                  <div className="feature-tree__pipeline-track">
                    <span className="feature-tree__pipeline-track-label">
                      Output chain
                    </span>
                    <div className="feature-tree__pipeline-track-chips">
                      {slot.expressionNode && (
                        <span
                          className="feature-tree__pipeline-chip feature-tree__pipeline-chip--expression"
                          title={`${slot.expressionNode.label} · ${slot.expressionNode.type}`}
                        >
                          {slot.expressionNode.label}
                        </span>
                      )}
                      {slot.downstreamNodes.map((node) => (
                        <span
                          key={`${slot.id}-down-${node.id}`}
                          className="feature-tree__pipeline-chip"
                          title={`${node.label} · ${node.type}`}
                        >
                          {node.label}
                        </span>
                      ))}
                      <span className="feature-tree__pipeline-chip feature-tree__pipeline-chip--output">
                        {property.label}
                      </span>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <BindingEditor
        binding={binding}
        targetId={bindingTarget.targetId}
        label={property.label}
        standardInputs={standardInputs}
        standardInputLookup={standardInputLookup}
        faceId={faceId}
        issues={issueList}
        headerActions={liveOutputNode}
        onBindingInputChange={onBindingInputChange}
        onBindingRemapChange={onBindingRemapChange}
        onAddBindingSlot={onAddBindingSlot}
        onRemoveBindingSlot={onRemoveBindingSlot}
        onBindingExpressionChange={onBindingExpressionChange}
        onBindingSlotAliasChange={onBindingSlotAliasChange}
        onBindingSlotValueTypeChange={onBindingSlotValueTypeChange}
        onRequestCreateStandardInput={onRequestCreateStandardInput}
        onResetBinding={onResetBinding}
        expanded={expanded}
        onExpandedChange={handleExpandedChange}
        featureFlags={featureFlags}
      ></BindingEditor>
      {outputControls && (
        <div className="feature-tree__property-column">
          <h4> {property.label} Default (Non Rigged) Animatable Parameters</h4>
          <div className="feature-tree__matrix-grid">
            <label>
              Min
              <input
                type="number"
                step={0.01}
                value={outputControls.minValue ?? ""}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed)) {
                    outputControls.onMinChange(parsed);
                  }
                }}
              />
            </label>
            <label>
              <span>Default</span>
              <input
                type="number"
                step={0.01}
                value={outputControls.defaultValue}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed)) {
                    outputControls.onDefaultChange(parsed);
                  }
                }}
              />
            </label>
            <label>
              <span>Max</span>
              <input
                type="number"
                step={0.01}
                value={outputControls.maxValue ?? ""}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed)) {
                    outputControls.onMaxChange(parsed);
                  }
                }}
              />
            </label>
          </div>
        </div>
      )}
    </>
  );
}

// function MetadataEditor({
//   descriptor,
//   onNameChange,
//   onLabelChange,
// }: {
//   descriptor: AnimatableValue | undefined;
//   onNameChange: (value: string) => void;
//   onLabelChange: (value: string) => void;
// }) {
//   if (!descriptor) {
//     return null;
//   }
//   return (
//     <div className="feature-tree__metadata">
//       <label>
//         <span>Name</span>
//         <input
//           value={descriptor.name ?? ""}
//           onChange={(event) => onNameChange(event.target.value)}
//           spellCheck={false}
//         />
//       </label>
//       <label>
//         <span>Display Label</span>
//         <input
//           value={descriptor.pub?.output ?? ""}
//           onChange={(event) => onLabelChange(event.target.value)}
//           spellCheck={false}
//         />
//       </label>
//     </div>
//   );
// }

function StaticValueEditor({
  feature,
  onStaticUpdate,
}: {
  feature: FeatureTreeNode;
  onStaticUpdate: (entry: FeatureEntry, value: RawValue) => void;
}) {
  if (!feature.entry.descriptor) {
    return null;
  }

  if (feature.entry.type === "number") {
    const numeric =
      typeof feature.staticValue === "number"
        ? feature.staticValue
        : typeof feature.entry.descriptor.default === "number"
          ? (feature.entry.descriptor.default as number)
          : 0;
    return (
      <div className="feature-tree__static-grid">
        <label>
          <span>Value</span>
          <input
            type="number"
            value={numeric}
            step={0.1}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed)) {
                onStaticUpdate(feature.entry, parsed);
              }
            }}
          />
        </label>
      </div>
    );
  }

  const descriptor = feature.entry.descriptor as
    | AnimatableVector3
    | AnimatableEuler
    | AnimatableColor;
  const current = ensureVectorValue(
    feature.entry as any,
    feature.staticValue ?? descriptor.default,
  );
  const step = feature.entry.vector.descriptorType === "rgb" ? 0.01 : 0.1;
  const min = feature.entry.vector.descriptorType === "rgb" ? 0 : undefined;
  const max = feature.entry.vector.descriptorType === "rgb" ? 1 : undefined;

  return (
    <div className="feature-tree__static-grid">
      {feature.entry.vector.components.map((component) => (
        <label key={component}>
          <span>{component.toUpperCase()}</span>
          <input
            type="number"
            value={(current as any)[component]}
            min={min}
            max={max}
            step={step}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (!Number.isFinite(parsed)) {
                return;
              }
              const next = {
                ...current,
                [component]: parsed,
              } as VectorDefaults;
              onStaticUpdate(feature.entry, next as RawValue);
            }}
          />
        </label>
      ))}
    </div>
  );
}

interface PropertyControlsProps {
  feature: FeatureTreeNode;
  treeState: AnimatableTreeState;
  namespace: string;
  values: Map<string, RawValue | undefined>;
  standardInputs: StandardRigInput[];
  standardInputLookup: Map<string, StandardRigInput>;
  faceId?: string | null;
  inputValues: StandardInputValues;
  inputRanges: Map<string, { min: number; max: number }>;
  bindingTargets: BindingTarget[];
  onInputValueChange: (inputId: string, value: number) => void;
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
  onResetBinding: (targetId: string) => void;
  onRequestCreateStandardInput: (
    suggestedPath?: string,
  ) => StandardRigInput | null;
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
  onDefaultChange: (entry: FeatureEntry, value: RawValue) => void;
  onConstraintChange: (
    entry: FeatureEntry,
    updater: (
      constraints: NonNullable<AnimatableValue["constraints"]>,
    ) => NonNullable<AnimatableValue["constraints"]>,
  ) => void;
  featureFlags: Record<string, boolean>;
}

function PropertyControls({
  feature,
  treeState,
  namespace,
  values,
  standardInputs,
  standardInputLookup,
  faceId,
  inputValues,
  inputRanges,
  bindingTargets,
  onInputValueChange,
  onBindingInputChange,
  onBindingRemapChange,
  onResetBinding,
  onRequestCreateStandardInput,
  onAddBindingSlot,
  onRemoveBindingSlot,
  onBindingExpressionChange,
  onBindingSlotAliasChange,
  onBindingSlotValueTypeChange,
  onDefaultChange,
  onConstraintChange,
  featureFlags,
}: PropertyControlsProps) {
  const bindingTargetMap = useMemo(() => {
    const map = new Map<string, BindingTarget>();
    bindingTargets.forEach((target) => {
      map.set(target.targetId, target);
    });
    return map;
  }, [bindingTargets]);

  const animatable = feature.animatable;
  if (!animatable) {
    return null;
  }

  const descriptor = animatable.descriptor;

  const renderPropertyRow = (property: PropertyNode): JSX.Element | null => {
    if (!property.targetId) {
      return null;
    }
    const bindingTarget = bindingTargetMap.get(property.targetId);

    let outputControls: OutputControlConfig | undefined;

    if (animatable.type === "number") {
      const numericDescriptor = descriptor as AnimatableNumber | undefined;
      if (numericDescriptor) {
        const defaultValue =
          typeof numericDescriptor.default === "number"
            ? numericDescriptor.default
            : 0;
        const [fallbackMin, fallbackMax] = computeNumberBounds(
          defaultValue,
          feature.entry.featureKey,
        );
        const constraints = numericDescriptor.constraints ?? {};
        const minValue =
          typeof constraints.min === "number" ? constraints.min : fallbackMin;
        const maxValue =
          typeof constraints.max === "number" ? constraints.max : fallbackMax;
        const pinched =
          isApproximatelyEqual(constraints.min, defaultValue) &&
          isApproximatelyEqual(constraints.max, defaultValue);

        outputControls = {
          defaultValue,
          minValue,
          maxValue,
          step: 0.1,
          onDefaultChange: (value) => {
            onDefaultChange(feature.entry, value);
            if (pinched) {
              onConstraintChange(feature.entry, (current) => {
                const next = {
                  ...(current as AnimatableNumber["constraints"]),
                };
                next.min = value;
                next.max = value;
                return next;
              });
            }
          },
          onMinChange: (value) =>
            onConstraintChange(feature.entry, (current) => {
              const next = {
                ...(current as AnimatableNumber["constraints"]),
              };
              next.min = value;
              return next;
            }),
          onMaxChange: (value) =>
            onConstraintChange(feature.entry, (current) => {
              const next = {
                ...(current as AnimatableNumber["constraints"]),
              };
              next.max = value;
              return next;
            }),
        };
      }
    } else if (
      animatable.type === "vector3" ||
      animatable.type === "euler" ||
      animatable.type === "rgb"
    ) {
      const vectorDescriptor = descriptor as
        | AnimatableVector3
        | AnimatableEuler
        | AnimatableColor
        | undefined;
      if (vectorDescriptor && property.componentKey) {
        const vectorEntry = feature.entry as VectorFeatureEntry;
        const current = ensureVectorValue(
          vectorEntry,
          vectorDescriptor.default,
        );
        const descriptorType = vectorEntry.vector.descriptorType;
        const { min: fallbackMin, max: fallbackMax } = computeVectorBounds(
          descriptorType,
          vectorEntry.featureKey,
          current,
        );
        const constraints = vectorDescriptor.constraints ?? {};
        const resolvedMin = (constraints.min ?? fallbackMin) as [
          number | null,
          number | null,
          number | null,
        ];
        const resolvedMax = (constraints.max ?? fallbackMax) as [
          number | null,
          number | null,
          number | null,
        ];
        const componentIndex = vectorEntry.vector.components.indexOf(
          property.componentKey,
        );
        const defaultValue = (current as any)[property.componentKey] as number;
        const minValue =
          resolvedMin[componentIndex] !== null
            ? (resolvedMin[componentIndex] as number)
            : null;
        const maxValue =
          resolvedMax[componentIndex] !== null
            ? (resolvedMax[componentIndex] as number)
            : null;

        const step = descriptorType === "rgb" ? 0.01 : 0.1;
        const minLimit = descriptorType === "rgb" ? 0 : undefined;
        const maxLimit = descriptorType === "rgb" ? 1 : undefined;

        const setConstraint = (kind: "min" | "max", value: number): void => {
          onConstraintChange(feature.entry, (currentConstraints) => {
            const next = {
              ...(currentConstraints as AnimatableVector3["constraints"]),
            };
            const source =
              (kind === "min" ? next.min : next.max) ??
              (kind === "min" ? resolvedMin : resolvedMax);
            const tuple = cloneVectorTuple(
              source as [number | null, number | null, number | null],
            );
            tuple[componentIndex] = value;
            if (kind === "min") {
              next.min = tuple;
              if (!next.max) {
                next.max = cloneVectorTuple(resolvedMax as any);
              }
            } else {
              next.max = tuple;
              if (!next.min) {
                next.min = cloneVectorTuple(resolvedMin as any);
              }
            }
            return next;
          });
        };

        const pinched =
          isApproximatelyEqual(resolvedMin[componentIndex], defaultValue) &&
          isApproximatelyEqual(resolvedMax[componentIndex], defaultValue);

        outputControls = {
          defaultValue,
          minValue,
          maxValue,
          step,
          minLimit,
          maxLimit,
          onDefaultChange: (value) => {
            const next = {
              ...current,
              [property.componentKey!]: value,
            } as VectorDefaults;
            onDefaultChange(feature.entry, next as RawValue);
            if (pinched) {
              setConstraint("min", value);
              setConstraint("max", value);
            }
          },
          onMinChange: (value) => setConstraint("min", value),
          onMaxChange: (value) => setConstraint("max", value),
        };
      }
    }

    return (
      <PropertyBindingRow
        key={property.id}
        property={property}
        bindingTarget={bindingTarget}
        treeState={treeState}
        standardInputs={standardInputs}
        standardInputLookup={standardInputLookup}
        faceId={faceId}
        namespace={namespace}
        values={values}
        onBindingInputChange={onBindingInputChange}
        onBindingRemapChange={onBindingRemapChange}
        onResetBinding={onResetBinding}
        onRequestCreateStandardInput={onRequestCreateStandardInput}
        onAddBindingSlot={onAddBindingSlot}
        onRemoveBindingSlot={onRemoveBindingSlot}
        onBindingExpressionChange={onBindingExpressionChange}
        onBindingSlotAliasChange={onBindingSlotAliasChange}
        onBindingSlotValueTypeChange={onBindingSlotValueTypeChange}
        outputControls={outputControls}
        featureFlags={featureFlags}
      />
    );
  };

  return (
    <div className="feature-tree__components">
      {animatable.fields.map((field) => (
        <div className="feature-tree__field" key={field.id}>
          <div className="feature-tree__field-title">
            Property {field.label}
          </div>
          <div className="feature-tree__field-body">
            {field.properties.map(renderPropertyRow)}
          </div>
        </div>
      ))}
      <RigPreview
        targets={bindingTargets}
        standardInputLookup={standardInputLookup}
        inputValues={inputValues}
        inputRanges={inputRanges}
        onInputValueChange={onInputValueChange}
      />
    </div>
  );
}

interface FeatureNodeProps {
  feature: FeatureTreeNode;
  treeState: AnimatableTreeState;
  componentsById: Map<string, AnimatableComponent>;
  bindings: BindingMap;
  bindingIssues: Map<string, readonly string[]>;
  namespace: string;
  values: Map<string, RawValue | undefined>;
  standardInputs: StandardRigInput[];
  standardInputLookup: Map<string, StandardRigInput>;
  faceId?: string | null;
  inputValues: StandardInputValues;
  inputRanges: Map<string, { min: number; max: number }>;
  onInputValueChange: (inputId: string, value: number) => void;
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
  onResetBinding: (targetId: string) => void;
  onRequestCreateStandardInput: (
    suggestedPath?: string,
  ) => StandardRigInput | null;
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
  onToggleAnimated: (entry: FeatureEntry, makeAnimated: boolean) => void;
  onFeatureLabelChange: (entry: FeatureEntry, value: string) => void;
  onDefaultChange: (entry: FeatureEntry, value: RawValue) => void;
  onConstraintChange: (
    entry: FeatureEntry,
    updater: (
      constraints: NonNullable<AnimatableValue["constraints"]>,
    ) => NonNullable<AnimatableValue["constraints"]>,
  ) => void;
  onStaticUpdate: (entry: FeatureEntry, value: RawValue) => void;
  featureFlags: Record<string, boolean>;
}

const VECTOR_COMPONENT_TYPES: ReadonlySet<
  AnimatableComponent["animatableType"]
> = new Set(["vector2", "vector3", "euler", "rgb"]);

function resolveBindingValueType(
  component: AnimatableComponent,
): BindingValueType {
  if (component.component) {
    return "scalar";
  }
  return VECTOR_COMPONENT_TYPES.has(component.animatableType)
    ? "vector"
    : "scalar";
}

function FeatureNode({
  feature,
  treeState,
  componentsById,
  bindings,
  bindingIssues,
  namespace,
  values,
  standardInputs,
  standardInputLookup,
  faceId,
  inputValues,
  inputRanges,
  onInputValueChange,
  onBindingInputChange,
  onBindingRemapChange,
  onResetBinding,
  onRequestCreateStandardInput,
  onAddBindingSlot,
  onRemoveBindingSlot,
  onBindingExpressionChange,
  onBindingSlotAliasChange,
  onBindingSlotValueTypeChange,
  onToggleAnimated,
  onFeatureLabelChange,
  onDefaultChange,
  onConstraintChange,
  onStaticUpdate,
  featureFlags,
}: FeatureNodeProps) {
  const expanded = treeState.isExpanded("feature", feature.id);
  const toggleFeature = useCallback(() => {
    treeState.toggleNode("feature", feature.id);
  }, [feature.id, treeState]);

  const bindingTargets = useMemo<BindingTarget[]>(() => {
    if (!feature.entry.animatableId) {
      return [];
    }
    const targets: BindingTarget[] = [];
    if (feature.entry.type === "number") {
      const componentMeta = componentsById.get(feature.entry.animatableId);
      if (componentMeta) {
        targets.push({
          label: "Value",
          targetId: feature.entry.animatableId,
          binding: bindings[feature.entry.animatableId],
          component: componentMeta,
          issues: bindingIssues.get(feature.entry.animatableId),
          valueType: resolveBindingValueType(componentMeta),
        });
      }
    } else {
      feature.entry.vector.components.forEach((component) => {
        const targetId = `${feature.entry.animatableId}:${component}`;
        const componentMeta = componentsById.get(targetId);
        if (componentMeta) {
          targets.push({
            label: component.toUpperCase(),
            targetId,
            binding: bindings[targetId],
            component: componentMeta,
            issues: bindingIssues.get(targetId),
            valueType: resolveBindingValueType(componentMeta),
          });
        }
      });
    }
    return targets;
  }, [bindings, componentsById, feature.entry]);

  const summaryValue = useMemo(() => {
    if (feature.isAnimated) {
      const descriptor = feature.entry.descriptor;
      return descriptor ? formatRawValue(descriptor.default as RawValue) : "—";
    }
    return feature.staticValue !== undefined
      ? formatRawValue(feature.staticValue)
      : feature.entry.descriptor
        ? formatRawValue(feature.entry.descriptor.default as RawValue)
        : "—";
  }, [feature]);

  const featureLabelTrimmed = feature.entry.featureLabel.trim();
  const defaultLabelTrimmed = feature.entry.defaultLabel.trim();
  const hasCustomLabel = featureLabelTrimmed !== defaultLabelTrimmed;
  const effectiveFeatureLabel =
    featureLabelTrimmed.length > 0
      ? feature.entry.featureLabel
      : feature.entry.defaultLabel;

  return (
    <div className="feature-tree__feature">
      <header className="feature-tree__feature-header">
        <div className="feature-tree__feature-heading">
          <button
            type="button"
            onClick={toggleFeature}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} feature ${effectiveFeatureLabel}`}
          />
          <div className="feature-tree__feature-title">
            <div className="feature-tree__feature-name-row">
              <input
                className={`feature-tree__feature-name-input${hasCustomLabel ? " feature-tree__feature-name-input--overridden" : ""}`}
                value={feature.entry.featureLabel}
                placeholder={feature.entry.defaultLabel}
                onChange={(event) =>
                  onFeatureLabelChange(feature.entry, event.target.value)
                }
                aria-label={`Name for ${feature.entry.elementName} ${feature.entry.featureKey}`}
                spellCheck={false}
              />
              {hasCustomLabel && (
                <button
                  type="button"
                  className="feature-tree__feature-reset"
                  onClick={() =>
                    onFeatureLabelChange(
                      feature.entry,
                      feature.entry.defaultLabel,
                    )
                  }
                >
                  Reset
                </button>
              )}
            </div>
            <span className="feature-tree__feature-summary">
              {summaryValue}
            </span>
          </div>
        </div>
        <label className="feature-tree__feature-toggle">
          <input
            type="checkbox"
            checked={feature.isAnimated}
            onChange={(event) =>
              onToggleAnimated(feature.entry, event.target.checked)
            }
          />
          <span>Animatable</span>
        </label>
      </header>
      {expanded && (
        <div className="feature-tree__feature-body">
          <div className="feature-tree__feature-meta">
            <span>{feature.entry.elementName}</span>
            <span>•</span>
            <span>{feature.entry.elementType}</span>
          </div>
          {feature.isAnimated && feature.animatable ? (
            <>
              <PropertyControls
                feature={feature}
                treeState={treeState}
                namespace={namespace}
                values={values}
                standardInputs={standardInputs}
                standardInputLookup={standardInputLookup}
                faceId={faceId}
                inputValues={inputValues}
                inputRanges={inputRanges}
                bindingTargets={bindingTargets}
                onInputValueChange={onInputValueChange}
                onBindingInputChange={onBindingInputChange}
                onBindingRemapChange={onBindingRemapChange}
                onResetBinding={onResetBinding}
                onRequestCreateStandardInput={onRequestCreateStandardInput}
                onAddBindingSlot={onAddBindingSlot}
                onRemoveBindingSlot={onRemoveBindingSlot}
                onBindingExpressionChange={onBindingExpressionChange}
                onBindingSlotAliasChange={onBindingSlotAliasChange}
                onBindingSlotValueTypeChange={onBindingSlotValueTypeChange}
                onDefaultChange={onDefaultChange}
                onConstraintChange={onConstraintChange}
                featureFlags={featureFlags}
              />
            </>
          ) : (
            <StaticValueEditor
              feature={feature}
              onStaticUpdate={onStaticUpdate}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface AnimatableTreeProps {
  shapes: ShapeTreeNode[];
  treeState: AnimatableTreeState;
  faceId: string;
  componentsById: Map<string, AnimatableComponent>;
  bindings: BindingMap;
  bindingIssues: Map<string, readonly string[]>;
  featureFlags: Record<string, boolean>;
  namespace: string;
  values: Map<string, RawValue | undefined>;
  standardInputs: StandardRigInput[];
  standardInputLookup: Map<string, StandardRigInput>;
  inputValues: StandardInputValues;
  inputRanges: Map<string, { min: number; max: number }>;
  onShapeRename: (shapeId: string, value: string) => void;
  onInputValueChange: (inputId: string, value: number) => void;
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
  onResetBinding: (targetId: string) => void;
  onRequestCreateStandardInput: (
    suggestedPath?: string,
  ) => StandardRigInput | null;
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
  onToggleAnimated: (entry: FeatureEntry, makeAnimated: boolean) => void;
  onFeatureLabelChange: (entry: FeatureEntry, value: string) => void;
  onDefaultChange: (entry: FeatureEntry, value: RawValue) => void;
  onConstraintChange: (
    entry: FeatureEntry,
    updater: (
      constraints: NonNullable<AnimatableValue["constraints"]>,
    ) => NonNullable<AnimatableValue["constraints"]>,
  ) => void;
  onStaticUpdate: (entry: FeatureEntry, value: RawValue) => void;
}

export function AnimatableTree({
  shapes,
  treeState,
  faceId,
  componentsById,
  bindings,
  bindingIssues,
  featureFlags,
  namespace,
  values,
  standardInputs,
  standardInputLookup,
  inputValues,
  inputRanges,
  onShapeRename,
  onInputValueChange,
  onBindingInputChange,
  onBindingRemapChange,
  onResetBinding,
  onRequestCreateStandardInput,
  onAddBindingSlot,
  onRemoveBindingSlot,
  onBindingExpressionChange,
  onBindingSlotAliasChange,
  onBindingSlotValueTypeChange,
  onToggleAnimated,
  onFeatureLabelChange,
  onDefaultChange,
  onConstraintChange,
  onStaticUpdate,
}: AnimatableTreeProps) {
  if (shapes.length === 0) {
    return (
      <p className="sidebar__empty">No features match the current filters.</p>
    );
  }

  return (
    <div className="feature-tree">
      {shapes.map((shape) => {
        const expanded = treeState.isExpanded("shape", shape.id);
        const handleShapeNameCommit = (element: HTMLInputElement) => {
          const trimmed = element.value.trim();
          if (!trimmed) {
            element.value = shape.name;
            return;
          }
          if (trimmed === shape.name) {
            return;
          }
          onShapeRename(shape.id, trimmed);
        };

        const handleShapeNameKeyDown = (
          event: KeyboardEvent<HTMLInputElement>,
        ) => {
          if (event.key === "Enter") {
            event.preventDefault();
            handleShapeNameCommit(event.target as HTMLInputElement);
          } else if (event.key === "Escape") {
            event.preventDefault();
            const target = event.target as HTMLInputElement;
            target.value = shape.name;
            target.blur();
          }
        };

        const handleShapeNameBlur = (event: FocusEvent<HTMLInputElement>) => {
          handleShapeNameCommit(event.target as HTMLInputElement);
        };

        return (
          <section className="feature-tree__shape" key={shape.id}>
            <header className="feature-tree__shape-header">
              <button
                type="button"
                onClick={() => treeState.toggleNode("shape", shape.id)}
                aria-expanded={expanded}
                aria-label={`${expanded ? "Collapse" : "Expand"} shape ${shape.name}`}
              />
              <div className="feature-tree__shape-summary">
                <input
                  key={`${shape.id}:${shape.name}`}
                  className="feature-tree__shape-name-input"
                  type="text"
                  defaultValue={shape.name}
                  onBlur={handleShapeNameBlur}
                  onKeyDown={handleShapeNameKeyDown}
                  spellCheck={false}
                  aria-label={`Rename ${shape.name}`}
                />
                <span>{shape.type}</span>
              </div>
            </header>
            {expanded && (
              <div className="feature-tree__shape-body">
                {shape.features.map((feature) => (
                  <FeatureNode
                    key={feature.id}
                    feature={feature}
                    treeState={treeState}
                    componentsById={componentsById}
                    bindings={bindings}
                    bindingIssues={bindingIssues}
                    namespace={namespace}
                    values={values}
                    featureFlags={featureFlags}
                    standardInputs={standardInputs}
                    standardInputLookup={standardInputLookup}
                    faceId={faceId}
                    inputValues={inputValues}
                    inputRanges={inputRanges}
                    onInputValueChange={onInputValueChange}
                    onBindingInputChange={onBindingInputChange}
                    onBindingRemapChange={onBindingRemapChange}
                    onResetBinding={onResetBinding}
                    onRequestCreateStandardInput={onRequestCreateStandardInput}
                    onAddBindingSlot={onAddBindingSlot}
                    onRemoveBindingSlot={onRemoveBindingSlot}
                    onBindingExpressionChange={onBindingExpressionChange}
                    onBindingSlotAliasChange={onBindingSlotAliasChange}
                    onBindingSlotValueTypeChange={onBindingSlotValueTypeChange}
                    onFeatureLabelChange={onFeatureLabelChange}
                    onToggleAnimated={onToggleAnimated}
                    onDefaultChange={onDefaultChange}
                    onConstraintChange={onConstraintChange}
                    onStaticUpdate={onStaticUpdate}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
