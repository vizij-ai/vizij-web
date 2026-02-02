import { useEffect, type ReactNode, type RefObject } from "react";
import { VizijRuntimeFace, useVizijRuntime } from "@vizij/runtime-react";

export type RuntimeFaceFrameProps = {
  label?: string;
  subtitle?: string;
  variant?: "sm" | "md" | "lg" | "fill";
  className?: string;
  pointerTargetRef?: RefObject<HTMLDivElement>;
  onCanvasClick?: () => void;
  overlay?: ReactNode;
  footer?: ReactNode;
};

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
  const { ready, loading, error, stagePoseNeutral } = useVizijRuntime();

  useEffect(() => {
    if (ready) {
      stagePoseNeutral();
    }
  }, [ready, stagePoseNeutral]);

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
        <VizijRuntimeFace className="face-canvas" showSafeArea={false} />
        <RuntimeStatusBadge ready={ready} loading={loading} error={error} />
        {overlay}
      </div>
      {footer && <div className="face-frame__footer">{footer}</div>}
    </div>
  );
}

type RuntimeErrorLike = ReturnType<typeof useVizijRuntime>["error"];

type RuntimeStatusBadgeProps = {
  ready: boolean;
  loading: boolean;
  error: RuntimeErrorLike | Error | null | undefined;
};

function RuntimeStatusBadge({
  ready,
  loading,
  error,
}: RuntimeStatusBadgeProps) {
  if (error) {
    return (
      <div className="face-frame__status face-frame__status--error">
        {error.message}
      </div>
    );
  }
  if (!ready) {
    return <div className="face-frame__status">Initialising Vizij…</div>;
  }
  if (loading) {
    return <div className="face-frame__status">Loading face…</div>;
  }
  return null;
}
