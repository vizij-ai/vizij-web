import { useEffect, type ReactNode } from "react";
import { VizijRuntimeFace, useVizijRuntime } from "@vizij/runtime-react";
import { cn } from "../../utils/cn";

export type RuntimeFaceFrameProps = {
  className?: string;
  variant?: "fill" | "sm" | "md" | "lg";
  showSelectionGlow?: boolean;
  label?: string;
  subtitle?: string;
  footer?: ReactNode;
  overlay?: ReactNode;
  pointerTargetRef?: React.RefObject<HTMLDivElement>;
  onCanvasClick?: () => void;
  skipBounds?: boolean;
};

export function RuntimeFaceFrame({
  className,
  variant = "fill",
  showSelectionGlow = false,
  label,
  subtitle,
  footer,
  overlay,
  pointerTargetRef,
  onCanvasClick,
  skipBounds: _skipBounds = false,
}: RuntimeFaceFrameProps) {
  const {
    ready,
    loading,
    error,
    firstFrameReady,
    controllableReady,
    stagePoseNeutral,
  } = useVizijRuntime();

  useEffect(() => {
    if (controllableReady) {
      stagePoseNeutral();
    }
  }, [controllableReady, stagePoseNeutral]);

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
          "relative flex-1 w-full min-h-0 overflow-hidden rounded-xl border border-slate-800/60 bg-[radial-gradient(circle_at_50%_30%,theme(colors.slate.800)_0%,theme(colors.slate.950)_100%)]",
          onCanvasClick && "cursor-pointer",
        )}
        onClick={onCanvasClick}
      >
        <VizijRuntimeFace
          className="face-canvas"
          showSafeArea={false}
          showSelectionGlow={showSelectionGlow}
        />
        <RuntimeStatusBadge
          ready={ready}
          loading={loading}
          firstFrameReady={firstFrameReady}
          controllableReady={controllableReady}
          error={error}
        />
        {overlay}
      </div>
      {footer && (
        <div className="text-[11px] text-slate-500 px-2 italic">{footer}</div>
      )}
    </div>
  );
}

type RuntimeErrorLike = ReturnType<typeof useVizijRuntime>["error"];

type RuntimeStatusBadgeProps = {
  ready: boolean;
  loading: boolean;
  firstFrameReady: boolean;
  controllableReady: boolean;
  error: RuntimeErrorLike | Error | null | undefined;
};

function RuntimeStatusBadge({
  ready,
  loading,
  firstFrameReady,
  controllableReady,
  error,
}: RuntimeStatusBadgeProps) {
  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-medium text-red-400 bg-slate-950/85 backdrop-blur-sm">
        {error.message}
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-slate-300 bg-slate-950/85 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Initialising Vizij…</span>
        </div>
      </div>
    );
  }
  if (loading || !firstFrameReady) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-slate-400 bg-slate-950/85 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading face…</span>
        </div>
      </div>
    );
  }
  if (!controllableReady) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-slate-400 bg-slate-950/85 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
          <span>Preparing controls…</span>
        </div>
      </div>
    );
  }
  return null;
}
