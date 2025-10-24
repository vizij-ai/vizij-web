import { computeVectorBounds } from "@vizij/utils";
import type {
  AnimatableColor,
  AnimatableEuler,
  AnimatableVector3,
  RawValue,
} from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import type { StandardInputValues } from "../../rig/state";
import {
  ensureVectorValue,
  cloneVectorTuple,
  isApproximatelyEqual,
} from "./panelUtils";
import { BindingMatrix } from "./BindingMatrix";
import { RigPreview } from "./RigPreview";
import type { BindingTarget, BindingField, VectorFeatureEntry } from "./types";

type VectorDescriptor =
  | AnimatableVector3
  | AnimatableEuler
  | AnimatableColor
  | undefined;

interface VectorFeatureBodyProps {
  entry: VectorFeatureEntry;
  descriptor: VectorDescriptor;
  bindingTargets: BindingTarget[];
  standardInputs: StandardRigInput[];
  standardInputLookup: Map<string, StandardRigInput>;
  inputValues: StandardInputValues;
  inputRanges: Map<string, { min: number; max: number }>;
  onInputValueChange: (inputId: string, value: number) => void;
  onBindingInputChange: (targetId: string, inputId: string | null) => void;
  onBindingRemapChange: (
    targetId: string,
    field: BindingField,
    value: number,
  ) => void;
  onResetBinding: (targetId: string) => void;
  onRequestCreateStandardInput: (
    suggestedPath?: string,
  ) => StandardRigInput | null;
  updateDefault: (value: RawValue) => void;
  updateConstraints: (updater: (constraints: any) => any) => void;
  onStaticUpdate: (value: RawValue) => void;
  entryAnimated: boolean;
}

export function VectorFeatureBody({
  entry,
  descriptor,
  bindingTargets,
  standardInputs,
  standardInputLookup,
  inputValues,
  inputRanges,
  onInputValueChange,
  onBindingInputChange,
  onBindingRemapChange,
  onResetBinding,
  onRequestCreateStandardInput,
  updateDefault,
  updateConstraints,
  onStaticUpdate,
  entryAnimated,
}: VectorFeatureBodyProps) {
  if (!entryAnimated || !descriptor) {
    const current = ensureVectorValue(
      entry,
      entry.staticValue ?? descriptor?.default,
    );
    const vectorColumnsClass =
      entry.vector.components.length === 2
        ? "feature-row__matrix feature-row__matrix--columns-2"
        : "feature-row__matrix feature-row__matrix--columns-3";

    return (
      <div className={vectorColumnsClass}>
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label" />
        {entry.vector.components.map((component) => (
          <div
            className="feature-row__matrix-cell feature-row__matrix-cell--header"
            key={`${component}-static-header`}
          >
            {component.toUpperCase()}
          </div>
        ))}
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Value
        </div>
        {entry.vector.components.map((component) => (
          <div className="feature-row__matrix-cell" key={`${component}-static`}>
            <input
              type="number"
              className="feature-row__input feature-row__input--compact"
              value={(current as any)[component]}
              min={entry.vector.descriptorType === "rgb" ? 0 : undefined}
              max={entry.vector.descriptorType === "rgb" ? 1 : undefined}
              step={entry.vector.descriptorType === "rgb" ? 0.01 : 0.1}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                const next = {
                  ...current,
                  [component]: parsed,
                } as typeof current;
                onStaticUpdate(next);
              }}
              aria-label={`${component.toUpperCase()} value`}
            />
          </div>
        ))}
      </div>
    );
  }

  const current = ensureVectorValue(entry, descriptor.default);

  const fallbackConstraints = computeVectorBounds(
    entry.vector.descriptorType,
    entry.featureKey,
    current,
  );
  const resolvedMin = descriptor.constraints?.min ?? fallbackConstraints.min;
  const resolvedMax = descriptor.constraints?.max ?? fallbackConstraints.max;
  const vectorColumnsClass =
    entry.vector.components.length === 2
      ? "feature-row__matrix feature-row__matrix--columns-2"
      : "feature-row__matrix feature-row__matrix--columns-3";

  const componentRows = entry.vector.components.map((component, index) => {
    const componentDefault = (current as any)[component] as number;
    const componentMin = resolvedMin[index];
    const componentMax = resolvedMax[index];
    const componentPinched =
      isApproximatelyEqual(componentMin, componentDefault) &&
      isApproximatelyEqual(componentMax, componentDefault);
    return {
      component,
      index,
      componentDefault,
      componentMin,
      componentMax,
      componentPinched,
    };
  });

  return (
    <>
      <div className={vectorColumnsClass}>
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label" />
        {entry.vector.components.map((component) => (
          <div
            className="feature-row__matrix-cell feature-row__matrix-cell--header"
            key={`${component}-header`}
          >
            {component.toUpperCase()}
          </div>
        ))}
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Min
        </div>
        {componentRows.map(({ component, index, componentMin }) => (
          <div className="feature-row__matrix-cell" key={`${component}-min`}>
            <input
              type="number"
              className="feature-row__input feature-row__input--compact"
              value={componentMin ?? 0}
              min={entry.vector.descriptorType === "rgb" ? 0 : undefined}
              max={entry.vector.descriptorType === "rgb" ? 1 : undefined}
              step={entry.vector.descriptorType === "rgb" ? 0.01 : 0.1}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateConstraints((currentConstraints) => {
                  const next = { ...(currentConstraints as any) };
                  const nextMin = cloneVectorTuple(
                    (next.min ?? resolvedMin) as [
                      number | null,
                      number | null,
                      number | null,
                    ],
                  );
                  nextMin[index] = parsed;
                  next.min = nextMin;
                  if (!next.max) {
                    next.max = cloneVectorTuple(resolvedMax as any);
                  }
                  return next;
                });
              }}
              aria-label={`${component.toUpperCase()} minimum`}
            />
          </div>
        ))}
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Default
        </div>
        {componentRows.map(
          ({ component, index, componentDefault, componentPinched }) => (
            <div
              className="feature-row__matrix-cell"
              key={`${component}-default`}
            >
              <input
                type="number"
                className="feature-row__input feature-row__input--compact"
                value={componentDefault}
                min={entry.vector.descriptorType === "rgb" ? 0 : undefined}
                max={entry.vector.descriptorType === "rgb" ? 1 : undefined}
                step={entry.vector.descriptorType === "rgb" ? 0.01 : 0.1}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed)) {
                    return;
                  }
                  const next = {
                    ...current,
                    [component]: parsed,
                  } as typeof current;
                  updateDefault(next);
                  if (componentPinched) {
                    updateConstraints((currentConstraints) => {
                      const nextConstraints = {
                        ...(currentConstraints as any),
                      };
                      const nextMin = cloneVectorTuple(
                        (nextConstraints.min ?? resolvedMin) as [
                          number | null,
                          number | null,
                          number | null,
                        ],
                      );
                      const nextMax = cloneVectorTuple(
                        (nextConstraints.max ?? resolvedMax) as [
                          number | null,
                          number | null,
                          number | null,
                        ],
                      );
                      nextMin[index] = parsed;
                      nextMax[index] = parsed;
                      nextConstraints.min = nextMin;
                      nextConstraints.max = nextMax;
                      return nextConstraints;
                    });
                  }
                }}
                aria-label={`${component.toUpperCase()} default`}
              />
            </div>
          ),
        )}
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Max
        </div>
        {componentRows.map(({ component, index, componentMax }) => (
          <div className="feature-row__matrix-cell" key={`${component}-max`}>
            <input
              type="number"
              className="feature-row__input feature-row__input--compact"
              value={componentMax ?? 0}
              min={entry.vector.descriptorType === "rgb" ? 0 : undefined}
              max={entry.vector.descriptorType === "rgb" ? 1 : undefined}
              step={entry.vector.descriptorType === "rgb" ? 0.01 : 0.1}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateConstraints((currentConstraints) => {
                  const next = { ...(currentConstraints as any) };
                  const nextMax = cloneVectorTuple(
                    (next.max ?? resolvedMax) as [
                      number | null,
                      number | null,
                      number | null,
                    ],
                  );
                  nextMax[index] = parsed;
                  next.max = nextMax;
                  if (!next.min) {
                    next.min = cloneVectorTuple(resolvedMin as any);
                  }
                  return next;
                });
              }}
              aria-label={`${component.toUpperCase()} maximum`}
            />
          </div>
        ))}
      </div>
      <BindingMatrix
        targets={bindingTargets}
        standardInputs={standardInputs}
        onBindingInputChange={onBindingInputChange}
        onBindingRemapChange={onBindingRemapChange}
        onResetBinding={onResetBinding}
        onRequestCreateStandardInput={onRequestCreateStandardInput}
      />
      <RigPreview
        targets={bindingTargets}
        standardInputLookup={standardInputLookup}
        inputValues={inputValues}
        inputRanges={inputRanges}
        onInputValueChange={onInputValueChange}
      />
    </>
  );
}
