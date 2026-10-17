import type { ReactNode } from "react";
import { VizijRuntimeFace, useVizijRuntime } from "@vizij/runtime-react";
import { cn } from "../../utils/cn";

export type RuntimeFaceFrameProps = {
  className?: string;
  variant?: "fill" | "sm" | "md" | "lg";
  label?: string;
  subtitle?: string;
  footer?: ReactNode;
  overlay?: ReactNode;
  pointerTargetRef?: React.RefObject<HTMLDivElement | null>;
  onCanvasClick?: () => void;
};

/**
 * A face of the nearest provider, framed: its slot on the page's canvas, an
 * error over it if its load failed, and the caller's overlay. The frame has
 * no background of its own, so the canvas beneath shows the face.
 */
export function RuntimeFaceFrame({
  className,
  variant = "fill",
  label,
  subtitle,
  footer,
  overlay,
  pointerTargetRef,
  onCanvasClick,
}: RuntimeFaceFrameProps) {
  const { error } = useVizijRuntime();

  return (
    <div
      className={cn(
        "relative flex flex-col gap-2",
        variant === "fill" && "w-full h-full",
        variant === "sm" && "w-32 h-32",
        variant === "md" && "w-48 h-48",
        variant === "lg" && "w-64 h-64",
        className,
      )}
    >
      {(label || subtitle) && (
        <div className="flex flex-col gap-1 px-2">
          {label && (
            <p className="m-0 uppercase tracking-[0.15em] text-[10px] text-slate-500 font-bold">
              {label}
            </p>
          )}
          {subtitle && (
            <p className="m-0 text-sm font-semibold text-slate-200">
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div
        ref={pointerTargetRef ?? undefined}
        className={cn(
          "relative flex-1 w-full min-h-0 overflow-hidden rounded-xl border border-slate-800/60",
          onCanvasClick && "cursor-pointer",
        )}
        onClick={onCanvasClick}
      >
        <VizijRuntimeFace className="face-canvas h-full w-full" />
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-medium text-red-400 bg-slate-950/85 backdrop-blur-sm">
            {error.message}
          </div>
        ) : null}
        {overlay}
      </div>
      {footer && (
        <div className="text-[11px] text-slate-500 px-2 italic">{footer}</div>
      )}
    </div>
  );
}
