import { useEffect, type ReactNode, type RefObject } from "react";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import {
  VizijRuntimeFace,
  useVizijRuntime,
  type RootBounds,
} from "@vizij/runtime-react";
import { FACE_ROOT_BOUNDS } from "../config/runtimeFace";

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
        <FaceCameraBounds />
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

function FaceCameraBounds() {
  const { rootId } = useVizijRuntime();
  const setStore = useVizijStoreSetter();
  const currentBounds = useVizijStore((state) => {
    if (!rootId) {
      return null;
    }
    const entry = state.world[rootId];
    if (entry && "rootBounds" in entry) {
      return (entry.rootBounds as RootBounds | undefined) ?? null;
    }
    return null;
  });

  useEffect(() => {
    if (!rootId) {
      return;
    }
    if (hasSameBounds(currentBounds, FACE_ROOT_BOUNDS)) {
      return;
    }
    setStore((state) => {
      const entry = state.world[rootId];
      if (!entry || !("rootBounds" in entry)) {
        return {};
      }
      return {
        world: {
          ...state.world,
          [rootId]: {
            ...entry,
            rootBounds: {
              center: { ...FACE_ROOT_BOUNDS.center },
              size: { ...FACE_ROOT_BOUNDS.size },
            },
          },
        },
      };
    });
  }, [rootId, currentBounds, setStore]);

  return null;
}

const BOUNDS_EPSILON = 0.005;

function hasSameBounds(
  candidate: RootBounds | null | undefined,
  target: typeof FACE_ROOT_BOUNDS,
): boolean {
  if (!candidate) {
    return false;
  }
  return (
    almostEqual(candidate.center.x, target.center.x) &&
    almostEqual(candidate.center.y, target.center.y) &&
    almostEqual(candidate.size.x, target.size.x) &&
    almostEqual(candidate.size.y, target.size.y)
  );
}

function almostEqual(a: number, b: number) {
  return Math.abs(a - b) <= BOUNDS_EPSILON;
}
