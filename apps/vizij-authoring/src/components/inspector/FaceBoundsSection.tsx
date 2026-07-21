import { useCallback, useRef } from "react";
import { Scan } from "lucide-react";
import type { Group as VizijGroup } from "@vizij/render";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { useGraphRuntime } from "../../state/RigControllerProvider";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { Button, Switch } from "../ui";
import { CommitOnBlurNumberInput, ScrubbableLabel } from "./RiggingPropertyRow";

type FaceBounds = NonNullable<VizijGroup["rootBounds"]>;

// Mirrors the fallback the renderer uses when a root group has no bounds.
const FALLBACK_BOUNDS: FaceBounds = {
  center: { x: 0, y: 0 },
  size: { x: 5, y: 4 },
};

const MIN_BOUNDS_SIZE = 1e-3;

function formatBoundsNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}

interface BoundsFieldProps {
  label: string;
  value: number;
  step: number;
  testId: string;
  onCommit: (value: number) => void;
}

function BoundsField({ label, value, step, testId, onCommit }: BoundsFieldProps) {
  const scrubStartRef = useRef(0);
  return (
    <div
      data-testid={testId}
      className="flex items-center bg-bg-input/50 rounded-sm border border-transparent relative flex-1 min-w-0 h-5 focus-within:border-accent/50"
    >
      <ScrubbableLabel
        label={label}
        className="text-[9px] font-bold px-1 text-text-secondary"
        onScrubStart={() => {
          scrubStartRef.current = value;
        }}
        onScrub={(_, totalDelta) => {
          onCommit(scrubStartRef.current + totalDelta * step);
        }}
      />
      <CommitOnBlurNumberInput
        value={value}
        step={step}
        formatValue={formatBoundsNumber}
        onCommit={onCommit}
      />
    </div>
  );
}

interface FaceBoundsSectionProps {
  node: SceneObjectNode;
}

/**
 * Inspector section for the face's camera bounding box (`rootBounds` on the
 * root group). The runtime camera crops the face to this rectangle, so
 * editing it reframes the face everywhere it renders.
 */
export function FaceBoundsSection({ node }: FaceBoundsSectionProps) {
  const world = useGraphRuntime((state) => state.world);
  const setStoreState = useGraphRuntime((state) => state.setStoreState);
  const runtimeViewRootId = useGraphRuntime((state) => state.runtimeViewRootId);
  const measureFaceGeometryBounds = useGraphRuntime(
    (state) => state.measureFaceGeometryBounds,
  );
  const overlayVisible = useWorkspaceStore(
    (state) => state.faceBoundsOverlayVisible,
  );
  const setOverlayVisible = useWorkspaceStore(
    (state) => state.setFaceBoundsOverlayVisible,
  );

  const applyBounds = useCallback(
    (updater: (current: FaceBounds) => FaceBounds) => {
      setStoreState((state) => {
        const entry = state.world[node.id];
        if (!entry || entry.type !== "group") {
          return state;
        }
        const next = updater(entry.rootBounds ?? FALLBACK_BOUNDS);
        const sanitized: FaceBounds = {
          center: { x: next.center.x, y: next.center.y },
          size: {
            x: Math.max(Math.abs(next.size.x), MIN_BOUNDS_SIZE),
            y: Math.max(Math.abs(next.size.y), MIN_BOUNDS_SIZE),
          },
        };
        return {
          ...state,
          world: {
            ...state.world,
            [node.id]: { ...entry, root: true, rootBounds: sanitized },
          },
        };
      });
    },
    [node.id, setStoreState],
  );

  const handleFitToGeometry = useCallback(() => {
    const measured = measureFaceGeometryBounds?.();
    if (!measured) {
      return;
    }
    applyBounds(() => measured);
  }, [applyBounds, measureFaceGeometryBounds]);

  const entry = world[node.id] as VizijGroup | undefined;
  const isFaceRoot =
    entry?.type === "group" &&
    (Boolean(entry.rootBounds) ||
      entry.root === true ||
      node.id === runtimeViewRootId);

  if (!isFaceRoot) {
    return null;
  }

  const bounds = entry?.rootBounds ?? FALLBACK_BOUNDS;
  const hasStoredBounds = Boolean(entry?.rootBounds);
  const scrubStep = Math.max(
    0.01,
    Math.max(bounds.size.x, bounds.size.y) / 200,
  );
  const aspect =
    bounds.size.y > 0 ? bounds.size.x / bounds.size.y : Number.NaN;

  return (
    <div
      data-testid="face-bounds-section"
      className="flex flex-col gap-1 p-1.5 bg-bg-panel/40 rounded-lg border border-border-default/50"
    >
      <div className="flex items-center justify-between px-0.5">
        <div className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">
          Face Bounds
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-text-muted">Show</span>
          <Switch
            data-testid="face-bounds-overlay-toggle"
            size="sm"
            checked={overlayVisible}
            onChange={setOverlayVisible}
          />
        </div>
      </div>
      <p className="px-0.5 text-[10px] leading-tight text-text-muted">
        The camera crops the face to this box. Toggle Show to see it in the
        viewport.
      </p>
      <div className="flex items-center gap-1.5">
        <span className="w-12 shrink-0 text-[10px] text-text-secondary">
          Center
        </span>
        <BoundsField
          label="X"
          testId="face-bounds-center-x"
          value={bounds.center.x}
          step={scrubStep}
          onCommit={(value) =>
            applyBounds((current) => ({
              ...current,
              center: { ...current.center, x: value },
            }))
          }
        />
        <BoundsField
          label="Y"
          testId="face-bounds-center-y"
          value={bounds.center.y}
          step={scrubStep}
          onCommit={(value) =>
            applyBounds((current) => ({
              ...current,
              center: { ...current.center, y: value },
            }))
          }
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-12 shrink-0 text-[10px] text-text-secondary">
          Size
        </span>
        <BoundsField
          label="W"
          testId="face-bounds-size-x"
          value={bounds.size.x}
          step={scrubStep}
          onCommit={(value) =>
            applyBounds((current) => ({
              ...current,
              size: { ...current.size, x: value },
            }))
          }
        />
        <BoundsField
          label="H"
          testId="face-bounds-size-y"
          value={bounds.size.y}
          step={scrubStep}
          onCommit={(value) =>
            applyBounds((current) => ({
              ...current,
              size: { ...current.size, y: value },
            }))
          }
        />
      </div>
      <div className="flex items-center justify-between gap-1.5 px-0.5">
        <span className="text-[9px] text-text-muted">
          {Number.isFinite(aspect)
            ? `Aspect ${aspect.toFixed(3)}`
            : "Aspect —"}
          {hasStoredBounds ? "" : " · using default bounds"}
        </span>
        <Button
          data-testid="face-bounds-fit-geometry"
          variant="ghost"
          size="sm"
          disabled={!measureFaceGeometryBounds}
          onClick={handleFitToGeometry}
          title={
            measureFaceGeometryBounds
              ? "Recompute the bounds from the rendered face geometry"
              : "Available while the runtime preview is mounted"
          }
        >
          <Scan size={12} className="mr-1 shrink-0" />
          Fit to Geometry
        </Button>
      </div>
    </div>
  );
}
