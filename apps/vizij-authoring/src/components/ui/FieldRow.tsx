import { cloneElement, isValidElement, type ReactNode } from "react";
import "./fieldrow.css";

interface FieldRowProps {
  label: ReactNode;
  hint?: ReactNode;
  control: ReactNode;
  align?: "start" | "center";
  renderLabelInControl?: boolean;
}

export function FieldRow({
  label,
  hint,
  control,
  align = "center",
  renderLabelInControl = false,
}: FieldRowProps) {
  const shouldInlineLabel = renderLabelInControl && isValidElement(control);

  const controlWithLabel = shouldInlineLabel
    ? cloneElement(control, {
        label: (control.props as { label?: ReactNode }).label ?? label,
        hint: (control.props as { hint?: ReactNode }).hint ?? hint,
      })
    : control;

  return (
    <div
      className={`field-row field-row--${align} ${renderLabelInControl ? "field-row--control-label" : ""}`.trim()}
    >
      {shouldInlineLabel ? null : (
        <div className="field-row__text">
          <span className="field-row__label">{label}</span>
          {hint ? <span className="field-row__hint">{hint}</span> : null}
        </div>
      )}
      <div className="field-row__control">{controlWithLabel}</div>
    </div>
  );
}
