import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useVizijStore } from "@vizij/render";
import type {
  LowLevelRigDefinition,
  LowLevelRigTrackDefinition,
} from "@vizij/config";
import type { RawValue } from "@vizij/utils";

import type { FaceConfig } from "../data/faces";
import {
  buildGazePath,
  getGazeMapping,
  SUPPORTED_GAZE_FACE_IDS,
  type Axis,
  type AxisMappingConfig,
} from "../data/gazeMappings";
import { useOrchestratorBridge } from "./OrchestratorPanel";

const AXES = { x: 0, y: 1, z: 2 } as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveTrackKind(trackName: string) {
  const lower = trackName.toLowerCase();
  if (lower === "pos" || lower === "position") return "pos";
  if (lower === "rot" || lower === "rotation") return "rot";
  if (lower === "scale") return "scale";
  if (lower === "morph") return "morph";
  return lower;
}

function buildAnimatableName(
  rig: LowLevelRigDefinition,
  channelName: string,
  trackName: string,
  track: LowLevelRigTrackDefinition,
): string | null {
  const channel = rig.channels[channelName];
  if (!channel) return null;
  const shapeKey = channel.shapeKey;
  const kind = resolveTrackKind(trackName);

  switch (kind) {
    case "morph":
      return `${shapeKey} Key ${track.key ?? "1"}`;
    case "pos":
      return `${shapeKey} translation`;
    case "rot":
      return `${shapeKey} rotation`;
    case "scale":
      return `${shapeKey} scale`;
    default:
      return `${shapeKey} ${trackName}`;
  }
}

function getAxisComponent(value: RawValue | undefined, axis: Axis) {
  if (value == null) return 0;
  if (Array.isArray(value)) {
    const index = AXES[axis];
    const numeric = value[index];
    return typeof numeric === "number" ? numeric : 0;
  }
  if (typeof value === "object") {
    const record = value as Partial<Record<Axis, unknown>>;
    const numeric = record[axis];
    if (typeof numeric === "number") {
      return numeric;
    }
  }
  return 0;
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

type AxisEntry = {
  path: string;
  kind: string;
  min: number;
  max: number;
  base: number;
  from: number;
  to: number;
  primary: boolean;
  defaultOffset: number;
  baseT: number;
};

type AxisEntryMap = {
  x: AxisEntry[];
  y: AxisEntry[];
};

export function GazeControlPanel({ face }: { face?: FaceConfig }) {
  const animatables = useVizijStore((state) => state.animatables);
  const { ready, status, inputRows, inputValues, updateInputValue } =
    useOrchestratorBridge();

  const mapping = face?.rig ? getGazeMapping(face.id) : undefined;

  const animByName = useMemo(() => {
    const map = new Map<string, { default?: RawValue }>();
    Object.values(animatables).forEach((anim) => {
      if (anim && typeof anim.name === "string" && anim.name.length) {
        map.set(anim.name, { default: anim.default });
      }
    });
    return map;
  }, [animatables]);

  const inputRowMap = useMemo(() => {
    const map = new Map<string, (typeof inputRows)[number]>();
    inputRows.forEach((row) => {
      if (row.path) {
        map.set(row.path, row);
      }
    });
    return map;
  }, [inputRows]);

  const axisEntries = useMemo<AxisEntryMap | null>(() => {
    if (!face?.rig || !mapping) {
      return null;
    }

    const buildEntries = (entries: AxisMappingConfig[]) => {
      const list: AxisEntry[] = [];
      entries.forEach((entry) => {
        const channel = face.rig!.channels[entry.channel];
        if (!channel) return;
        const track = channel.tracks[entry.track];
        if (!track) return;
        const path = buildGazePath(face.id, entry);
        if (!inputRowMap.has(path)) return;
        const row = inputRowMap.get(path)!;
        const animName = buildAnimatableName(
          face.rig!,
          entry.channel,
          entry.track,
          track,
        );
        if (!animName) return;
        const animDefaults = animByName.get(animName);
        const base = getAxisComponent(animDefaults?.default, entry.axis);
        const min = toNumber(row.meta?.min, Number.NEGATIVE_INFINITY);
        const max = toNumber(row.meta?.max, Number.POSITIVE_INFINITY);
        const defaultOffset = toNumber(row.defaultValue, 0);
        const denom = entry.to - entry.from;
        const baseT =
          Math.abs(denom) > 1e-6
            ? clamp((base - entry.from) / denom, 0, 1)
            : 0.5;
        list.push({
          path,
          kind: row.kind,
          min,
          max,
          base,
          from: entry.from,
          to: entry.to,
          primary: Boolean(entry.primary),
          defaultOffset,
          baseT,
        });
      });
      return list;
    };

    const xEntries = buildEntries(mapping.x);
    const yEntries = buildEntries(mapping.y);

    if (!xEntries.length || !yEntries.length) {
      return null;
    }

    return { x: xEntries, y: yEntries };
  }, [animByName, face, inputRowMap, mapping]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setDragging(false);
  }, [face?.id]);

  const getAxisPosition = useCallback(
    (entries: AxisEntry[]) => {
      const primary = entries.find((entry) => entry.primary) ?? entries[0];
      if (!primary) return 0.5;
      const raw =
        primary.path in inputValues
          ? inputValues[primary.path]
          : primary.defaultOffset;
      const offset = toNumber(raw, 0);
      const absolute = primary.base + offset;
      const denom = primary.to - primary.from;
      if (Math.abs(denom) < 1e-6) {
        return primary.baseT;
      }
      return clamp((absolute - primary.from) / denom, 0, 1);
    },
    [inputValues],
  );

  const applyAxisValue = useCallback(
    (entries: AxisEntry[], t: number) => {
      const clamped = clamp(t, 0, 1);
      entries.forEach((entry) => {
        const absolute = entry.from + (entry.to - entry.from) * clamped;
        const offset = clamp(absolute - entry.base, entry.min, entry.max);
        if (Number.isFinite(offset)) {
          updateInputValue(entry.path, entry.kind as any, offset);
        }
      });
    },
    [updateInputValue],
  );

  const updateFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!axisEntries || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = clamp(event.clientX - rect.left, 0, rect.width);
      const relativeY = clamp(event.clientY - rect.top, 0, rect.height);
      const width = rect.width || 1;
      const height = rect.height || 1;
      const normX = relativeX / width;
      const normY = 1 - relativeY / height;
      applyAxisValue(axisEntries.x, normX);
      applyAxisValue(axisEntries.y, normY);
    },
    [axisEntries, applyAxisValue],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!axisEntries || !containerRef.current) return;
      event.preventDefault();
      containerRef.current.setPointerCapture(event.pointerId);
      setDragging(true);
      updateFromPointer(event);
    },
    [axisEntries, updateFromPointer],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging || !axisEntries) return;
      event.preventDefault();
      updateFromPointer(event);
    },
    [axisEntries, dragging, updateFromPointer],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (containerRef.current?.hasPointerCapture(event.pointerId)) {
        containerRef.current.releasePointerCapture(event.pointerId);
      }
      setDragging(false);
    },
    [],
  );

  const supportedFacesLabel = useMemo(() => {
    if (!SUPPORTED_GAZE_FACE_IDS.length) {
      return "";
    }
    return SUPPORTED_GAZE_FACE_IDS.map(
      (id) => id.charAt(0).toUpperCase() + id.slice(1),
    ).join(", ");
  }, []);

  const isInteractive = Boolean(face?.rig && mapping && axisEntries);

  const statusLabel =
    !face?.rig || !mapping
      ? "unsupported"
      : !ready
        ? "loading"
        : !axisEntries
          ? "disabled"
          : "ready";

  const knobX = axisEntries ? getAxisPosition(axisEntries.x) : 0.5;
  const knobY = axisEntries ? getAxisPosition(axisEntries.y) : 0.5;

  const primaryX =
    axisEntries?.x.find((entry) => entry.primary) ?? axisEntries?.x[0];
  const primaryY =
    axisEntries?.y.find((entry) => entry.primary) ?? axisEntries?.y[0];

  const horizontalOffset =
    primaryX != null
      ? toNumber(
          primaryX.path in inputValues
            ? inputValues[primaryX.path]
            : primaryX.defaultOffset,
          0,
        )
      : null;

  const verticalOffset =
    primaryY != null
      ? toNumber(
          primaryY.path in inputValues
            ? inputValues[primaryY.path]
            : primaryY.defaultOffset,
          0,
        )
      : null;

  const handleReset = useCallback(() => {
    if (!axisEntries) {
      return;
    }
    const primaryXEntry =
      axisEntries.x.find((entry) => entry.primary) ?? axisEntries.x[0];
    const primaryYEntry =
      axisEntries.y.find((entry) => entry.primary) ?? axisEntries.y[0];
    applyAxisValue(axisEntries.x, primaryXEntry?.baseT ?? 0.5);
    applyAxisValue(axisEntries.y, primaryYEntry?.baseT ?? 0.5);
  }, [axisEntries, applyAxisValue]);

  const areaClassName = [
    "gaze-area",
    dragging ? "is-dragging" : "",
    !isInteractive ? "is-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const unsupportedMessage = supportedFacesLabel.length
    ? `Gaze controls are only available for low-level rigs (${supportedFacesLabel}).`
    : "Gaze controls are only available for supported faces.";

  const disabledMessage =
    status && ready
      ? status
      : "Connect the orchestrator bridge to enable gaze control for this face.";

  if (!face) {
    return null;
  }

  return (
    <div className="panel gaze-panel">
      <div className="panel-header">
        <div className="panel-heading">
          <h2>Gaze Control</h2>
          <p>Drag the handle to steer the low-rig gaze.</p>
        </div>
        <div className="gaze-panel-actions">
          <span className="tag">{statusLabel}</span>
          <button
            type="button"
            className="btn btn-muted"
            onClick={handleReset}
            disabled={!axisEntries}
          >
            Reset
          </button>
        </div>
      </div>
      <div className="panel-body gaze-body">
        {!mapping ? (
          <p className="panel-status">{unsupportedMessage}</p>
        ) : (
          <>
            <div
              className={areaClassName}
              ref={containerRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              tabIndex={0}
              aria-label="Gaze control"
            >
              <div className="gaze-grid" aria-hidden="true">
                <div />
              </div>
              <div
                className="gaze-knob"
                style={{
                  left: `${knobX * 100}%`,
                  top: `${(1 - knobY) * 100}%`,
                }}
                aria-hidden="true"
              />
            </div>
            <div className="gaze-readout">
              <span>
                Horizontal offset:{" "}
                {horizontalOffset != null ? horizontalOffset.toFixed(3) : "–"}
              </span>
              <span>
                Vertical offset:{" "}
                {verticalOffset != null ? verticalOffset.toFixed(3) : "–"}
              </span>
            </div>
            {!axisEntries ? (
              <p className="gaze-note">{disabledMessage}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
