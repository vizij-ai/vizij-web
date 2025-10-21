import { Fragment, useCallback, type ChangeEvent } from "react";
import { formatRawValue } from "../../utils/format";
import type { StandardRigInput } from "../../rig/standardRigInputs";
import { createDefaultRemap } from "../../rig/state";
import type {
  AnimatableValue,
  RawValue,
  AnimatableNumber,
  AnimatableEuler,
  AnimatableVector3,
  AnimatableColor,
} from "@vizij/utils";
import { computeNumberBounds, computeVectorBounds } from "../../rig/bounds";
import {
  formatStandardInputLabel,
  ensureVectorValue,
  cloneVectorTuple,
  isApproximatelyEqual,
} from "./panelUtils";
import type { FeatureRowProps, BindingTarget, BindingField } from "./types";

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
}: FeatureRowProps) {
  const descriptor = entry.descriptor;
  const bindingFieldLabels: Record<BindingField, string> = {
    inLow: "Input low",
    inAnchor: "Input anchor",
    inHigh: "Input high",
    outLow: "Output low",
    outAnchor: "Output anchor",
    outHigh: "Output high",
  };
  const bindingFieldOrder: BindingField[] = [
    "inLow",
    "inAnchor",
    "inHigh",
    "outLow",
    "outAnchor",
    "outHigh",
  ];

  const renderBindingMatrix = (targets: BindingTarget[]) => {
    if (!targets.length) {
      return null;
    }
    const columnCount = targets.length;
    const matrixClass = `feature-row__binding-matrix feature-row__binding-matrix--columns-${columnCount}`;

    return (
      <div className={matrixClass}>
        <div className="feature-row__binding-matrix-cell feature-row__binding-matrix-cell--label" />
        {targets.map((target) => {
          const isUnbound = !target.binding?.inputId;
          const headerClass = `feature-row__binding-matrix-cell feature-row__binding-matrix-cell--header${
            isUnbound ? " feature-row__binding-matrix-cell--unbound" : ""
          }`;
          return (
            <div key={`${target.targetId}-header`} className={headerClass}>
              {target.label}
            </div>
          );
        })}

        <div className="feature-row__binding-matrix-cell feature-row__binding-matrix-cell--label">
          Standard input
        </div>
        {targets.map((target) => {
          const isUnbound = !target.binding?.inputId;
          const cellClass = `feature-row__binding-matrix-cell${
            isUnbound ? " feature-row__binding-matrix-cell--unbound" : ""
          }`;
          const selectClass = isUnbound
            ? "feature-row__binding-select feature-row__binding-select--unbound"
            : "feature-row__binding-select";
          return (
            <div key={`${target.targetId}-input`} className={cellClass}>
              <select
                className={selectClass}
                value={target.binding?.inputId ?? ""}
                onChange={(event) =>
                  onBindingInputChange(
                    target.targetId,
                    event.target.value ? event.target.value : null,
                  )
                }
                aria-label={`${target.label} standard input`}
              >
                <option value="">Unbound</option>
                {standardInputs.map((input) => (
                  <option key={input.id} value={input.id}>
                    {formatStandardInputLabel(input)}
                  </option>
                ))}
              </select>
            </div>
          );
        })}

        {bindingFieldOrder.map((field) => (
          <Fragment key={`binding-row-${field}`}>
            <div className="feature-row__binding-matrix-cell feature-row__binding-matrix-cell--label">
              {bindingFieldLabels[field]}
            </div>
            {targets.map((target) => {
              const isUnbound = !target.binding?.inputId;
              const cellClass = `feature-row__binding-matrix-cell${
                isUnbound ? " feature-row__binding-matrix-cell--unbound" : ""
              }`;
              const defaults = createDefaultRemap(target.component);
              const remap = target.binding?.remap ?? defaults;
              return (
                <div key={`${target.targetId}-${field}`} className={cellClass}>
                  <input
                    type="number"
                    value={remap[field]}
                    step={0.01}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (Number.isFinite(parsed)) {
                        onBindingRemapChange(target.targetId, field, parsed);
                      }
                    }}
                    aria-label={`${target.label} ${bindingFieldLabels[field]}`}
                  />
                </div>
              );
            })}
          </Fragment>
        ))}

        <div className="feature-row__binding-matrix-cell feature-row__binding-matrix-cell--label">
          Actions
        </div>
        {targets.map((target) => {
          const isUnbound = !target.binding?.inputId;
          const cellClass = `feature-row__binding-matrix-cell feature-row__binding-matrix-cell--actions${
            isUnbound ? " feature-row__binding-matrix-cell--unbound" : ""
          }`;
          return (
            <div key={`${target.targetId}-actions`} className={cellClass}>
              <button
                type="button"
                onClick={() => onResetBinding(target.targetId)}
              >
                Reset
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderRigPreview = (targets: BindingTarget[]) => {
    const uniqueInputs = new Map<
      string,
      {
        input: StandardRigInput;
        value: number;
      }
    >();

    targets.forEach((target) => {
      const inputId = target.binding?.inputId;
      if (!inputId) {
        return;
      }
      if (uniqueInputs.has(inputId)) {
        return;
      }
      const inputMeta = standardInputLookup.get(inputId);
      if (!inputMeta) {
        return;
      }
      const value = inputValues[inputId] ?? inputMeta.defaultValue;
      uniqueInputs.set(inputId, {
        input: inputMeta,
        value,
      });
    });

    if (uniqueInputs.size === 0) {
      return null;
    }

    return (
      <div className="feature-row__rig-preview">
        <div className="feature-row__rig-preview-inputs">
          {Array.from(uniqueInputs.entries()).map(([inputId, entry]) => {
            const range = inputRanges.get(inputId) ?? entry.input.range;
            const step = Math.max((range.max - range.min) / 200, 0.001);
            return (
              <div
                key={inputId}
                className="feature-panel__input-row feature-row__rig-preview-row"
              >
                <div className="feature-panel__input-meta">
                  <strong>{entry.input.label}</strong>
                  <span>{entry.input.path}</span>
                </div>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={step}
                  value={entry.value}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isFinite(parsed)) {
                      onInputValueChange(inputId, parsed);
                    }
                  }}
                />
                <div className="feature-panel__input-number-wrapper">
                  <input
                    className="feature-panel__input-number"
                    type="number"
                    min={range.min}
                    max={range.max}
                    step={step}
                    value={entry.value}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (Number.isFinite(parsed)) {
                        onInputValueChange(inputId, parsed);
                      }
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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

  const renderAnimatedControls = () => {
    if (!descriptor) {
      return null;
    }

    if (entry.type === "number") {
      const numberDescriptor = descriptor as AnimatableNumber;
      const defaultValue =
        typeof numberDescriptor.default === "number"
          ? numberDescriptor.default
          : 0;
      const constraints = numberDescriptor.constraints ?? {};
      const fallback = computeNumberBounds(defaultValue, entry.featureKey);
      const currentMin = constraints.min ?? fallback[0];
      const currentMax = constraints.max ?? fallback[1];
      const isPinched =
        isApproximatelyEqual(currentMin, defaultValue) &&
        isApproximatelyEqual(currentMax, defaultValue);
      const bindingTargets: BindingTarget[] = [];
      if (entry.animatableId) {
        const componentMeta = componentsById.get(entry.animatableId);
        if (componentMeta) {
          bindingTargets.push({
            label: "Value",
            targetId: entry.animatableId,
            binding: bindings[entry.animatableId],
            component: componentMeta,
          });
        }
      }

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
                      const next = { ...(current as any) };
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
                        const next = { ...(current as any) };
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
                      const next = { ...(current as any) };
                      next.max = parsed;
                      return next;
                    });
                  }
                }}
                aria-label="Maximum value"
              />
            </div>
          </div>
          {renderBindingMatrix(bindingTargets)}
          {renderRigPreview(bindingTargets)}
        </>
      );
    }

    const vectorDescriptor =
      entry.vector.descriptorType === "rgb"
        ? (descriptor as AnimatableColor)
        : entry.vector.descriptorType === "euler"
          ? (descriptor as AnimatableEuler)
          : (descriptor as AnimatableVector3);

    const current = ensureVectorValue(entry, vectorDescriptor.default);

    const fallbackConstraints = computeVectorBounds(
      entry.vector.descriptorType,
      entry.featureKey,
      current,
    );
    const resolvedMin =
      vectorDescriptor.constraints?.min ?? fallbackConstraints.min;
    const resolvedMax =
      vectorDescriptor.constraints?.max ?? fallbackConstraints.max;
    const vectorColumnsClass =
      entry.vector.components.length === 2
        ? "feature-row__matrix feature-row__matrix--columns-2"
        : "feature-row__matrix feature-row__matrix--columns-3";

    const bindingTargets: BindingTarget[] = [];
    if (entry.animatableId) {
      entry.vector.components.forEach((component) => {
        const targetId = `${entry.animatableId}:${component}`;
        const componentMeta = componentsById.get(targetId);
        if (componentMeta) {
          bindingTargets.push({
            label: component.toUpperCase(),
            targetId,
            binding: bindings[targetId],
            component: componentMeta,
          });
        }
      });
    }

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
        {renderBindingMatrix(bindingTargets)}
        {renderRigPreview(bindingTargets)}
      </>
    );
  };

  const renderStaticControls = () => {
    if (entry.animated) {
      return null;
    }

    if (entry.type === "number") {
      const numeric =
        typeof entry.staticValue === "number" ? entry.staticValue : 0;
      return (
        <div className="feature-row__matrix feature-row__matrix--columns-1">
          <div className="feature-row__matrix-cell feature-row__matrix-cell--label" />
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
                  onStaticUpdate(entry, parsed);
                }
              }}
              aria-label="Value"
            />
          </div>
        </div>
      );
    }

    const current = ensureVectorValue(
      entry,
      entry.staticValue ?? entry.descriptor?.default,
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
                onStaticUpdate(entry, next);
              }}
              aria-label={`${component.toUpperCase()} value`}
            />
          </div>
        ))}
      </div>
    );
  };

  const badgeLabel =
    entry.type === "number"
      ? "NUMBER"
      : entry.vector.descriptorType.toUpperCase();

  const summaryValue = entry.animated
    ? descriptor
      ? formatRawValue(descriptor.default as RawValue)
      : "—"
    : entry.staticValue !== undefined
      ? formatRawValue(entry.staticValue)
      : descriptor
        ? formatRawValue(descriptor.default as RawValue)
        : "—";

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

      {!isCollapsed && entry.animated && descriptor ? (
        <div className="feature-row__body" id={`${entry.id}-body`}>
          <div className="feature-row__grid">
            <label className="feature-row__field">
              <span>Name</span>
              <input
                className="feature-row__input"
                value={descriptor.name ?? ""}
                onChange={handleNameInput}
                spellCheck={false}
              />
            </label>
            <label className="feature-row__field">
              <span>Display Label</span>
              <input
                className="feature-row__input"
                value={descriptor.pub?.output ?? ""}
                onChange={handleLabelInput}
                spellCheck={false}
              />
            </label>
          </div>
          {renderAnimatedControls()}
          <div className="feature-row__metrics">
            <span>
              Default:{" "}
              <strong>{formatRawValue(descriptor.default as RawValue)}</strong>
            </span>
          </div>
        </div>
      ) : null}

      {!isCollapsed && !entry.animated && (
        <div className="feature-row__body" id={`${entry.id}-body`}>
          {renderStaticControls()}
          <div className="feature-row__metrics">
            <span>
              Value: <strong>{summaryValue}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
