import { cloneElement, isValidElement } from "react";
import type { ReactNode, ReactElement } from "react";
import { cn } from "../../utils/cn";

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
    ? cloneElement(
        control as ReactElement<{ label?: ReactNode; hint?: ReactNode }>,
        {
          label: (control.props as { label?: ReactNode }).label ?? label,
          hint: (control.props as { hint?: ReactNode }).hint ?? hint,
        },
      )
    : control;

  return (
    <div
      className={cn(
        "flex gap-3 py-1.5",
        align === "center" ? "items-center" : "items-start",
        renderLabelInControl ? "justify-start" : "justify-between",
      )}
    >
      {shouldInlineLabel ? null : (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-semibold text-slate-200 text-[13px]">
            {label}
          </span>
          {hint ? (
            <span className="text-slate-500 text-[11px] leading-tight">
              {hint}
            </span>
          ) : null}
        </div>
      )}
      <div className="inline-flex items-center gap-2">{controlWithLabel}</div>
    </div>
  );
}
