import { Fragment, useCallback } from "react";
import { createDefaultRemap } from "../../rig/state";
import type { StandardRigInput } from "../../rig/standardRigInputs";
import type { BindingTarget, BindingField } from "./types";
import { formatStandardInputLabel } from "./panelUtils";

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

interface BindingMatrixProps {
  targets: BindingTarget[];
  standardInputs: StandardRigInput[];
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
}

export function BindingMatrix({
  targets,
  standardInputs,
  onBindingInputChange,
  onBindingRemapChange,
  onResetBinding,
  onRequestCreateStandardInput,
}: BindingMatrixProps) {
  const handleCreateAndBind = useCallback(
    (target: BindingTarget) => {
      const created = onRequestCreateStandardInput();
      if (created) {
        onBindingInputChange(target.targetId, created.id);
      }
    },
    [onBindingInputChange, onRequestCreateStandardInput],
  );

  if (!targets.length) {
    return null;
  }

  const columnCount = targets.length;
  const matrixClass = `feature-row__binding-matrix feature-row__binding-matrix--columns-${columnCount}`;
  const hasBoundInputs = targets.some((target) =>
    Boolean(target.binding?.inputId),
  );

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
            <div className="feature-row__binding-select-row">
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
              <button
                type="button"
                className="feature-row__binding-add-btn"
                onClick={() => handleCreateAndBind(target)}
              >
                Add
              </button>
            </div>
          </div>
        );
      })}

      {hasBoundInputs &&
        bindingFieldOrder.map((field) => (
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
                  {isUnbound ? (
                    <span className="feature-row__binding-placeholder">
                      Bind to edit
                    </span>
                  ) : (
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
                  )}
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
}
