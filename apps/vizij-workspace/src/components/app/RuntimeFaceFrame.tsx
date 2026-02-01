import { useEffect } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { Vizij, useVizijStore, useVizijStoreSetter } from "@vizij/render";
import { cn } from "../../utils/cn";

type RootBounds = {
  center: { x: number; y: number };
  size: { x: number; y: number };
};

// Define default bounds for checking if we need to reset
const FACE_ROOT_BOUNDS = {
  center: { x: 0, y: 0 },
  size: { x: 1, y: 1 },
};

export type RuntimeFaceFrameProps = {
  className?: string;
  variant?: "fill" | "sm" | "md" | "lg";
  label?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  overlay?: React.ReactNode;
  pointerTargetRef?: React.RefObject<HTMLDivElement>;
  onCanvasClick?: () => void;
  skipBounds?: boolean;
};

export function RuntimeFaceFrame({
  className,
  variant = "fill",
  label,
  subtitle,
  footer,
  overlay,
  pointerTargetRef,
  onCanvasClick,
  skipBounds = false,
}: RuntimeFaceFrameProps) {
  const { ready, loading, error, stagePoseNeutral, rootId } = useVizijRuntime();

  useEffect(() => {
    if (ready) {
      stagePoseNeutral();
    }
  }, [ready, stagePoseNeutral]);

  const frameClassName = ["face-frame", `face-frame--${variant}`, className]
    .filter(Boolean)
    .join(" ");

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
        {!skipBounds && <FaceCameraBounds />}
        {rootId && <Vizij rootId={rootId} namespace="refface" className="w-full h-full" showSafeArea={false} />}
        <RuntimeStatusBadge ready={ready} loading={loading} error={error} />
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
  error: RuntimeErrorLike | Error | null | undefined;
};

function RuntimeStatusBadge({
  ready,
  loading,
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
  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-slate-400 bg-slate-950/85 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading face…</span>
        </div>
      </div>
    );
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
