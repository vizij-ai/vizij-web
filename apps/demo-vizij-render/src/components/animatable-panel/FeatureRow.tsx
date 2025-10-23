import { ChangeEvent, useCallback, useMemo } from "react";
import { formatRawValue } from "../../utils/format";
import type {
  AnimatableNumber,
  AnimatableVector3,
  AnimatableEuler,
  AnimatableColor,
  AnimatableValue,
  RawValue,
} from "@vizij/utils";
import { NumericFeatureBody } from "./NumericFeatureBody";
import { VectorFeatureBody } from "./VectorFeatureBody";
import type { BindingTarget, FeatureRowProps } from "./types";

export function FeatureRow({
  entry,
  namespace,
  onToggleAnimated,
  onNameChange,
  onLabelChange,
  onDefaultChange,
  onConstraintChange,
  onStaticUpdate,
  setValue,
  bindings,
  componentsById,
  onBindingInputChange,
  onBindingRemapChange,
  onResetBinding,
  inputValues,
  onInputValueChange,
  standardInputs,
  standardInputLookup,
  inputRanges,
  isCollapsed,
  onToggleCollapse,
  onRequestCreateStandardInput,
}: FeatureRowProps) {
  const bindingTargets = useMemo<BindingTarget[]>(() => {
    if (!entry.animatableId) {
      return [];
    }
    if (entry.type === "number") {
      const componentMeta = componentsById.get(entry.animatableId);
      if (!componentMeta) {
        return [];
      }
      return [
        {
          label: "Value",
          targetId: entry.animatableId,
          binding: bindings[entry.animatableId],
          component: componentMeta,
        },
      ];
    }

    const targets: BindingTarget[] = [];
    entry.vector.components.forEach((component) => {
      const targetId = `${entry.animatableId}:${component}`;
      const componentMeta = componentsById.get(targetId);
      if (componentMeta) {
        targets.push({
          label: component.toUpperCase(),
          targetId,
          binding: bindings[targetId],
          component: componentMeta,
        });
      }
    });
    return targets;
  }, [bindings, componentsById, entry]);

  const handleAnimatedChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onToggleAnimated(entry, event.target.checked);
    },
    [entry, onToggleAnimated],
  );

  const handleNameInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onNameChange(entry, event.target.value);
    },
    [entry, onNameChange],
  );

  const handleLabelInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onLabelChange(entry, event.target.value);
    },
    [entry, onLabelChange],
  );

  const updateDefault = useCallback(
    (value: RawValue) => {
      onDefaultChange(entry, value);
      if (entry.animatableId) {
        setValue(entry.animatableId, namespace, value);
      }
    },
    [entry, namespace, onDefaultChange, setValue],
  );

  const updateConstraints = useCallback(
    (
      updater: (
        constraints: NonNullable<AnimatableValue["constraints"]>,
      ) => NonNullable<AnimatableValue["constraints"]>,
    ) => {
      onConstraintChange(entry, updater);
    },
    [entry, onConstraintChange],
  );

  const badgeLabel =
    entry.type === "number"
      ? "NUMBER"
      : entry.vector.descriptorType.toUpperCase();

  const summaryValue = entry.animated
    ? entry.descriptor
      ? formatRawValue(entry.descriptor.default as RawValue)
      : "—"
    : entry.staticValue !== undefined
      ? formatRawValue(entry.staticValue)
      : entry.descriptor
        ? formatRawValue(entry.descriptor.default as RawValue)
        : "—";

  let body: JSX.Element | null = null;
  if (entry.type === "number") {
    const descriptor = entry.descriptor as AnimatableNumber | undefined;
    body = (
      <NumericFeatureBody
        descriptor={descriptor}
        bindingTargets={bindingTargets}
        standardInputs={standardInputs}
        standardInputLookup={standardInputLookup}
        inputValues={inputValues}
        inputRanges={inputRanges}
        onInputValueChange={onInputValueChange}
        onBindingInputChange={onBindingInputChange}
        onBindingRemapChange={onBindingRemapChange}
        onResetBinding={onResetBinding}
        onRequestCreateStandardInput={onRequestCreateStandardInput}
        updateDefault={(value) => updateDefault(value)}
        updateConstraints={updateConstraints}
        onStaticUpdate={(value) => onStaticUpdate(entry, value)}
        entryDefault={entry.staticValue ?? descriptor?.default}
        entryAnimated={entry.animated}
        featureKey={entry.featureKey}
      />
    );
  } else {
    const descriptor = entry.descriptor as
      | AnimatableVector3
      | AnimatableEuler
      | AnimatableColor
      | undefined;
    body = (
      <VectorFeatureBody
        entry={entry}
        descriptor={descriptor}
        bindingTargets={bindingTargets}
        standardInputs={standardInputs}
        standardInputLookup={standardInputLookup}
        inputValues={inputValues}
        inputRanges={inputRanges}
        onInputValueChange={onInputValueChange}
        onBindingInputChange={onBindingInputChange}
        onBindingRemapChange={onBindingRemapChange}
        onResetBinding={onResetBinding}
        onRequestCreateStandardInput={onRequestCreateStandardInput}
        updateDefault={(value) => updateDefault(value)}
        updateConstraints={updateConstraints}
        onStaticUpdate={(value) => onStaticUpdate(entry, value)}
        entryAnimated={entry.animated}
      />
    );
  }

  return (
    <div
      className={`feature-row${isCollapsed ? " feature-row--collapsed" : ""}`}
    >
      <div className="feature-row__header">
        <div className="feature-row__header-left">
          <button
            type="button"
            className="feature-row__collapse-btn"
            onClick={() => onToggleCollapse(entry.id)}
            aria-expanded={!isCollapsed}
            aria-controls={`${entry.id}-body`}
          >
            {isCollapsed ? "+" : "−"}
          </button>
          <div className="feature-row__summary">
            <div className="feature-row__title">
              <strong>{entry.featureLabel}</strong>
              <span className="feature-row__badge">{badgeLabel}</span>
            </div>
            <div className="feature-row__subtitle">
              <span>{entry.elementName}</span>
              <span>•</span>
              <span>{entry.elementType}</span>
            </div>
          </div>
        </div>
        <div className="feature-row__header-right">
          <label className="feature-row__toggle">
            <input
              type="checkbox"
              checked={entry.animated}
              onChange={handleAnimatedChange}
            />
            <span>Animatable</span>
          </label>
        </div>
      </div>
      {!isCollapsed && (
        <div className="feature-row__body" id={`${entry.id}-body`}>
          {entry.animated && entry.descriptor ? (
            <>
              <div className="feature-row__grid">
                <label className="feature-row__field">
                  <span>Name</span>
                  <input
                    className="feature-row__input"
                    value={entry.descriptor.name ?? ""}
                    onChange={handleNameInput}
                    spellCheck={false}
                  />
                </label>
                <label className="feature-row__field">
                  <span>Display Label</span>
                  <input
                    className="feature-row__input"
                    value={entry.descriptor.pub?.output ?? ""}
                    onChange={handleLabelInput}
                    spellCheck={false}
                  />
                </label>
              </div>
              {body}
              <div className="feature-row__metrics">
                <span>
                  Default:{" "}
                  <strong>
                    {formatRawValue(entry.descriptor.default as RawValue)}
                  </strong>
                </span>
              </div>
            </>
          ) : (
            <>
              {body}
              <div className="feature-row__metrics">
                <span>
                  Value: <strong>{summaryValue}</strong>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
