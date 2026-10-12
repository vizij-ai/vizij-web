import type { ReactNode, RefObject } from "react";
import { VizijRuntimeFace, useVizijRuntime } from "@vizij/runtime-react";

export type RuntimeFaceFrameProps = {
  label?: string;
  subtitle?: string;
  variant?: "sm" | "md" | "lg";
  className?: string;
  pointerTargetRef?: RefObject<HTMLDivElement | null>;
  onCanvasClick?: () => void;
  overlay?: ReactNode;
  footer?: ReactNode;
};

/** A card around the section's face slot; the face frames itself on its
 * authored bounds. */
export function RuntimeFaceFrame({
  label,
  subtitle,
  variant = "md",
  className,
  pointerTargetRef,
  onCanvasClick,
  overlay,
  footer,
}: RuntimeFaceFrameProps) {
  const { status, error } = useVizijRuntime();
  const frameClassName = ["face-frame", `face-frame--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={frameClassName}>
      {(label || subtitle) && (
        <div className="face-frame__meta">
          {label && <p className="face-frame__label">{label}</p>}
          {subtitle && <p className="face-frame__subtitle">{subtitle}</p>}
        </div>
      )}
      <div
        ref={pointerTargetRef ?? undefined}
        className="face-frame__canvas"
        onClick={onCanvasClick}
      >
        <VizijRuntimeFace className="face-canvas" />
        {error ? (
          <div className="face-frame__status face-frame__status--error">
            {error.message}
          </div>
        ) : status === "loading" ? (
          <div className="face-frame__status">Loading face…</div>
        ) : null}
        {overlay}
      </div>
      {footer && <div className="face-frame__footer">{footer}</div>}
    </div>
  );
}
