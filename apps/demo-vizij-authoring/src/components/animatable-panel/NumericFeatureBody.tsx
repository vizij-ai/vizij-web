import { computeNumberBounds } from "@vizij/utils";
import type { AnimatableNumber, RawValue } from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import type { StandardInputValues } from "../../rig/state";
import { isApproximatelyEqual } from "./panelUtils";
import { BindingMatrix } from "./BindingMatrix";
import { RigPreview } from "./RigPreview";
import type { BindingTarget, BindingField } from "./types";

interface NumericFeatureBodyProps {
  descriptor: AnimatableNumber | undefined;
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
  updateDefault: (value: number) => void;
  updateConstraints: (updater: (constraints: any) => any) => void;
  onStaticUpdate: (value: RawValue) => void;
  entryDefault: RawValue | undefined;
  entryAnimated: boolean;
  featureKey: string;
}

export function NumericFeatureBody({
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
  entryDefault,
  entryAnimated,
  featureKey,
}: NumericFeatureBodyProps) {
  if (!entryAnimated || !descriptor) {
    const numeric =
      typeof entryDefault === "number"
        ? entryDefault
        : typeof descriptor?.default === "number"
          ? descriptor.default
          : 0;
    return (
      <div className="feature-row__matrix feature-row__matrix--columns-1">
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Value
        </div>
        <div className="feature-row__matrix-cell feature-row__matrix-cell--header">
          Value
        </div>
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Value
        </div>
        <div className="feature-row__matrix-cell">
          <input
            type="number"
            className="feature-row__input feature-row__input--compact"
            value={numeric}
            step={0.1}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed)) {
                onStaticUpdate(parsed);
              }
            }}
            aria-label="Value"
          />
        </div>
      </div>
    );
  }

  const defaultValue =
    typeof descriptor.default === "number" ? descriptor.default : 0;
  const constraints = descriptor.constraints ?? {};
  const fallback = computeNumberBounds(defaultValue, featureKey);
  const currentMin = constraints.min ?? fallback[0];
  const currentMax = constraints.max ?? fallback[1];
  const isPinched =
    isApproximatelyEqual(currentMin, defaultValue) &&
    isApproximatelyEqual(currentMax, defaultValue);

  return (
    <>
      <div className="feature-row__matrix feature-row__matrix--columns-1">
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label" />
        <div className="feature-row__matrix-cell feature-row__matrix-cell--header">
          Value
        </div>
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Min
        </div>
        <div className="feature-row__matrix-cell">
          <input
            type="number"
            className="feature-row__input feature-row__input--compact"
            value={currentMin}
            step={0.1}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed)) {
                updateConstraints((current) => {
                  const next = { ...current };
                  next.min = parsed;
                  return next;
                });
              }
            }}
            aria-label="Minimum value"
          />
        </div>
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Default
        </div>
        <div className="feature-row__matrix-cell">
          <input
            type="number"
            className="feature-row__input feature-row__input--compact"
            value={defaultValue}
            step={0.1}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed)) {
                updateDefault(parsed);
                if (isPinched) {
                  updateConstraints((current) => {
                    const next = { ...current };
                    next.min = parsed;
                    next.max = parsed;
                    return next;
                  });
                }
              }
            }}
            aria-label="Default value"
          />
        </div>
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Max
        </div>
        <div className="feature-row__matrix-cell">
          <input
            type="number"
            className="feature-row__input feature-row__input--compact"
            value={currentMax}
            step={0.1}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed)) {
                updateConstraints((current) => {
                  const next = { ...current };
                  next.max = parsed;
                  return next;
                });
              }
            }}
            aria-label="Maximum value"
          />
        </div>
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
