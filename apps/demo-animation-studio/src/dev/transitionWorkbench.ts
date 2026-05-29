import { cloneDeepSafe } from "@vizij/utils";

export const STUDIO_STANDARD_TRANSITIONS = [
  "linear",
  "sine",
  "quad",
  "cubic",
  "quart",
  "quint",
  "expo",
  "circ",
  "back",
] as const;

export const STUDIO_TRANSITION_DIRECTIVES = [
  "explicit-handles",
  "inferred-auto-clamped",
] as const;

export type StudioStandardTransition =
  (typeof STUDIO_STANDARD_TRANSITIONS)[number];
export type StudioTransitionDirective =
  (typeof STUDIO_TRANSITION_DIRECTIVES)[number];
export type StudioTransitionToken =
  | StudioStandardTransition
  | StudioTransitionDirective;
export type StudioExplicitTransition = { x: number; y: number };
export type StudioAuthoredTransition =
  | StudioTransitionToken
  | StudioExplicitTransition;
export type WorkbenchSegmentMode = StudioTransitionToken | "custom-explicit";
export type WorkbenchAssetKind =
  | "studio-canonical"
  | "generated-fixture"
  | "legacy-migrated";
export type WorkbenchAssetSourceKind =
  | WorkbenchAssetKind
  | "live-edited"
  | "imported";

export type WorkbenchTrackGroup = {
  id: string;
  name: string;
  children: (string | WorkbenchTrackGroup)[];
};

export type WorkbenchPoint = {
  id: string;
  stamp: number;
  value: unknown;
  transitions?: {
    in?: StudioAuthoredTransition;
    out?: StudioAuthoredTransition;
    pairing?: "paired" | "free";
  };
};

export type WorkbenchTrack = {
  id: string;
  name: string;
  animatableId: string;
  points: WorkbenchPoint[];
  settings?: { color?: string };
};

export type StudioV2WorkbenchAnimation = {
  id: string;
  name: string;
  formatVersion: 2;
  defaultViewportExtent: number;
  tracks: WorkbenchTrack[];
  groups: WorkbenchTrackGroup[];
  duration?: undefined;
};

export type WorldPoint = {
  stamp: number;
  value: number;
};

export type SegmentHandleGeometry = {
  start: WorldPoint;
  end: WorldPoint;
  cp1: WorldPoint;
  cp2: WorldPoint;
  startOut: StudioExplicitTransition;
  endIn: StudioExplicitTransition;
};

export type StudioV2CompatibilityReport = {
  sourceKind: WorkbenchAssetSourceKind;
  isCompatible: boolean;
  issues: string[];
  extentMs: number;
  maxStamp: number;
  hasLegacyDuration: boolean;
  hasDefaultViewportExtent: boolean;
  usesMillisecondStamps: boolean;
  groupsAreStudioArray: boolean;
  coverage: ReturnType<typeof getTransitionCoverage>;
};

export type LegacyAnimationMigrationDiagnostic = {
  level: "warning" | "error";
  code: string;
  message: string;
  path?: string;
};

export type LegacyVizijAnimation = {
  id: string;
  name: string;
  formatVersion?: number;
  duration?: number;
  defaultViewportExtent?: number;
  tracks: Array<{
    id: string;
    name: string;
    animatableId: string;
    points: Array<{
      id: string;
      stamp: number;
      value: unknown;
      transitions?: {
        in?: unknown;
        out?: unknown;
        pairing?: unknown;
      };
    }>;
    settings?: WorkbenchTrack["settings"];
  }>;
  groups?: unknown;
};

export type LegacyAnimationMigrationResult = {
  animation: StudioV2WorkbenchAnimation;
  diagnostics: LegacyAnimationMigrationDiagnostic[];
};

const STANDARD_PARAMS: Record<
  StudioStandardTransition,
  { out: StudioExplicitTransition; in: StudioExplicitTransition }
> = {
  sine: { out: { x: 0.37, y: 0 }, in: { x: 0.63, y: 1 } },
  cubic: { out: { x: 0.65, y: 0 }, in: { x: 0.35, y: 1 } },
  quint: { out: { x: 0.83, y: 0 }, in: { x: 0.17, y: 1 } },
  circ: { out: { x: 0.85, y: 0 }, in: { x: 0.15, y: 1 } },
  quad: { out: { x: 0.45, y: 0 }, in: { x: 0.55, y: 1 } },
  quart: { out: { x: 0.76, y: 0 }, in: { x: 0.24, y: 1 } },
  expo: { out: { x: 0.87, y: 0 }, in: { x: 0.13, y: 1 } },
  back: { out: { x: 0.68, y: -0.6 }, in: { x: 0.32, y: 1.6 } },
  linear: { out: { x: 0.33, y: 0.33 }, in: { x: 0.66, y: 0.66 } },
};

const AUTO_MAGIC_SCALE = 2.5614;
const ASYMMETRY_CLAMP_FACTOR = 5;

export const WORKBENCH_SCALAR_TRACK_ID = "workbench-transition-scalar";
export const WORKBENCH_SEGMENT_MODES: WorkbenchSegmentMode[] = [
  "linear",
  "sine",
  "quad",
  "cubic",
  "quart",
  "quint",
  "expo",
  "circ",
  "back",
  "custom-explicit",
  "explicit-handles",
  "inferred-auto-clamped",
];

export const WORKBENCH_ASSET_OPTIONS: Array<{
  id: WorkbenchAssetKind;
  label: string;
}> = [
  { id: "studio-canonical", label: "Studio canonical asset" },
  { id: "generated-fixture", label: "Generated coverage fixture" },
  { id: "legacy-migrated", label: "Migrated legacy fixture" },
];

const WORKBENCH_STAMPS_MS = [
  0, 800, 1600, 2200, 2800, 3400, 4000, 4700, 5400, 6100, 6800, 7400, 8000,
];

const WORKBENCH_VALUES = [
  0.15, 0.86, 0.6, 0.24, 0.74, 0.18, 0.95, 0.42, 0.82, 0.21, 0.66, 0.36, 0.9,
];

const STUDIO_CANONICAL_STAMPS_MS = [
  0, 680, 1340, 2050, 2680, 3330, 4020, 4680, 5340, 6040, 6740, 7420, 8200,
];

const STUDIO_CANONICAL_VALUES = [
  0.18, 0.74, 0.41, 0.92, 0.3, 0.66, 0.12, 0.86, 0.52, 0.96, 0.28, 0.58, 0.8,
];

const makeWorkbenchTrackGroups = (): WorkbenchTrackGroup[] => [
  {
    id: "workbench-curves",
    name: "Curve proof",
    children: [WORKBENCH_SCALAR_TRACK_ID],
  },
  {
    id: "workbench-hold-values",
    name: "Hold value proof",
    children: ["workbench-step-boolean", "workbench-step-text"],
  },
];

const roundDelta = (value: number) => {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const cloneAnimation = (
  animation: StudioV2WorkbenchAnimation,
): StudioV2WorkbenchAnimation => {
  return cloneDeepSafe(animation);
};

const isStandardTransition = (
  value: unknown,
): value is StudioStandardTransition => {
  return (
    typeof value === "string" &&
    (STUDIO_STANDARD_TRANSITIONS as readonly string[]).includes(value)
  );
};

const isDirective = (value: unknown): value is StudioTransitionDirective => {
  return (
    typeof value === "string" &&
    (STUDIO_TRANSITION_DIRECTIVES as readonly string[]).includes(value)
  );
};

const isExplicitTransition = (
  value: unknown,
): value is StudioExplicitTransition => {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<StudioExplicitTransition>;
  return (
    typeof maybe.x === "number" &&
    Number.isFinite(maybe.x) &&
    typeof maybe.y === "number" &&
    Number.isFinite(maybe.y)
  );
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const clamp01 = (value: number) => clamp(value, 0, 1);

export function dragHandleToTransitionDelta(params: {
  anchor: WorldPoint;
  handle: WorldPoint;
}): StudioExplicitTransition {
  return {
    x: roundDelta(params.handle.stamp - params.anchor.stamp),
    y: roundDelta(params.handle.value - params.anchor.value),
  };
}

function namedTransitionDelta(params: {
  side: "out" | "in";
  start: WorldPoint;
  end: WorldPoint;
  name: StudioStandardTransition;
}): StudioExplicitTransition {
  const { side, start, end, name } = params;
  const span = end.stamp - start.stamp;
  const valueSpan = end.value - start.value;
  const bezier = STANDARD_PARAMS[name][side];
  const worldX = start.stamp + bezier.x * span;
  const worldY = start.value + bezier.y * valueSpan;
  const anchor = side === "out" ? start : end;
  return {
    x: roundDelta(worldX - anchor.stamp),
    y: roundDelta(worldY - anchor.value),
  };
}

function normalizeDelta(delta: StudioExplicitTransition): {
  unit: StudioExplicitTransition;
  length: number;
} {
  const length = Math.hypot(delta.x, delta.y);
  if (!Number.isFinite(length) || length === 0) {
    return { unit: { x: 0, y: 0 }, length: 1 };
  }
  return {
    unit: {
      x: delta.x / length,
      y: delta.y / length,
    },
    length,
  };
}

function inferAutoHandleDeltas(
  prev: WorldPoint | undefined,
  anchor: WorldPoint,
  next: WorldPoint | undefined,
): { in: StudioExplicitTransition; out: StudioExplicitTransition } | null {
  if (!prev || !next) return null;

  const prevNorm = normalizeDelta({
    x: anchor.stamp - prev.stamp,
    y: anchor.value - prev.value,
  });
  const nextNorm = normalizeDelta({
    x: next.stamp - anchor.stamp,
    y: next.value - anchor.value,
  });
  const direction = {
    x: prevNorm.unit.x + nextNorm.unit.x,
    y: prevNorm.unit.y + nextNorm.unit.y,
  };
  const directionLength = Math.hypot(direction.x, direction.y);
  const scaleBase = directionLength * AUTO_MAGIC_SCALE;
  if (!Number.isFinite(scaleBase) || scaleBase <= 0) return null;

  const prevLength = Math.min(
    prevNorm.length,
    ASYMMETRY_CLAMP_FACTOR * nextNorm.length,
  );
  const nextLength = Math.min(
    nextNorm.length,
    ASYMMETRY_CLAMP_FACTOR * prevNorm.length,
  );
  const inScale = prevLength / scaleBase;
  const outScale = nextLength / scaleBase;
  return {
    in: {
      x: -direction.x * inScale,
      y: -direction.y * inScale,
    },
    out: {
      x: direction.x * outScale,
      y: direction.y * outScale,
    },
  };
}

function clampHandleToTargetValue(params: {
  anchor: WorldPoint;
  handle: WorldPoint;
  targetValue: number;
}): WorldPoint {
  const { anchor, handle, targetValue } = params;
  if (Math.abs(targetValue - anchor.value) < 1e-6) {
    return { stamp: handle.stamp, value: targetValue };
  }
  const dy = handle.value - anchor.value;
  if (dy === 0) return { stamp: anchor.stamp, value: targetValue };
  const ratio = (targetValue - anchor.value) / dy;
  if (!Number.isFinite(ratio)) {
    return { stamp: anchor.stamp, value: targetValue };
  }
  return {
    stamp: anchor.stamp + (handle.stamp - anchor.stamp) * ratio,
    value: anchor.value + dy * ratio,
  };
}

function clampHandleToTargetStamp(params: {
  anchor: WorldPoint;
  handle: WorldPoint;
  targetStamp: number;
}): WorldPoint {
  const { anchor, handle, targetStamp } = params;
  const dx = handle.stamp - anchor.stamp;
  if (dx === 0) return { stamp: targetStamp, value: anchor.value };
  const ratio = (targetStamp - anchor.stamp) / dx;
  if (!Number.isFinite(ratio)) {
    return { stamp: targetStamp, value: anchor.value };
  }
  return {
    stamp: anchor.stamp + dx * ratio,
    value: anchor.value + (handle.value - anchor.value) * ratio,
  };
}

function clampHandleToSegmentValueRange(params: {
  anchor: WorldPoint;
  opposite: WorldPoint;
  handle: WorldPoint;
}): WorldPoint {
  const minValue = Math.min(params.anchor.value, params.opposite.value);
  const maxValue = Math.max(params.anchor.value, params.opposite.value);
  if (params.handle.value >= minValue && params.handle.value <= maxValue) {
    return params.handle;
  }
  return clampHandleToTargetValue({
    anchor: params.anchor,
    handle: params.handle,
    targetValue: params.handle.value < minValue ? minValue : maxValue,
  });
}

function clampHandleToSegmentStampRange(params: {
  anchor: WorldPoint;
  handle: WorldPoint;
  minStamp: number;
  maxStamp: number;
}): WorldPoint {
  if (
    params.handle.stamp >= params.minStamp &&
    params.handle.stamp <= params.maxStamp
  ) {
    return params.handle;
  }
  return clampHandleToTargetStamp({
    anchor: params.anchor,
    handle: params.handle,
    targetStamp:
      params.handle.stamp < params.minStamp ? params.minStamp : params.maxStamp,
  });
}

function clampAutoDeltaToSegment(params: {
  side: "out" | "in";
  start: WorldPoint;
  end: WorldPoint;
  delta: StudioExplicitTransition;
}): StudioExplicitTransition {
  const anchor = params.side === "out" ? params.start : params.end;
  const opposite = params.side === "out" ? params.end : params.start;
  const minStamp = Math.min(params.start.stamp, params.end.stamp);
  const maxStamp = Math.max(params.start.stamp, params.end.stamp);
  let handle = {
    stamp: anchor.stamp + params.delta.x,
    value: anchor.value + params.delta.y,
  };
  handle = clampHandleToSegmentStampRange({
    anchor,
    handle,
    minStamp,
    maxStamp,
  });
  handle = clampHandleToSegmentValueRange({ anchor, opposite, handle });
  handle = clampHandleToSegmentStampRange({
    anchor,
    handle,
    minStamp,
    maxStamp,
  });
  return dragHandleToTransitionDelta({ anchor, handle });
}

function autoTransitionDelta(params: {
  side: "out" | "in";
  start: WorldPoint;
  end: WorldPoint;
  prev?: WorldPoint;
  next?: WorldPoint;
  clamped: boolean;
}): StudioExplicitTransition {
  const { side, start, end, prev, next, clamped } = params;
  const inferred =
    side === "out"
      ? inferAutoHandleDeltas(prev, start, end)?.out
      : inferAutoHandleDeltas(start, end, next)?.in;
  if (!inferred) {
    return namedTransitionDelta({
      side,
      start,
      end,
      name: "cubic",
    });
  }

  if (!clamped) {
    return {
      x: roundDelta(inferred.x),
      y: roundDelta(inferred.y),
    };
  }

  return clampAutoDeltaToSegment({ side, start, end, delta: inferred });
}

function transitionToDelta(params: {
  side: "out" | "in";
  transition: StudioAuthoredTransition | undefined;
  start: WorldPoint;
  end: WorldPoint;
  prev?: WorldPoint;
  next?: WorldPoint;
}): StudioExplicitTransition {
  const { side, transition, start, end, prev, next } = params;
  if (isExplicitTransition(transition)) {
    return { x: transition.x, y: transition.y };
  }
  if (transition === "inferred-auto-clamped") {
    return autoTransitionDelta({
      side,
      start,
      end,
      prev,
      next,
      clamped: true,
    });
  }
  if (transition === "explicit-handles") {
    return autoTransitionDelta({
      side,
      start,
      end,
      prev,
      next,
      clamped: false,
    });
  }
  return namedTransitionDelta({
    side,
    start,
    end,
    name: isStandardTransition(transition) ? transition : "cubic",
  });
}

function explicitDeltasForSegment(
  start: WorldPoint,
  end: WorldPoint,
): { out: StudioExplicitTransition; in: StudioExplicitTransition } {
  const span = end.stamp - start.stamp;
  const valueSpan = end.value - start.value;
  return {
    out: {
      x: roundDelta(span * 0.28),
      y: roundDelta(valueSpan * 0.2),
    },
    in: {
      x: roundDelta(-span * 0.32),
      y: roundDelta(-valueSpan * 0.18),
    },
  };
}

function setSegmentTransitions(
  points: WorkbenchPoint[],
  segmentIndex: number,
  mode: WorkbenchSegmentMode,
) {
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1];
  if (!start || !end) return;
  start.transitions = { ...(start.transitions ?? {}) };
  end.transitions = { ...(end.transitions ?? {}) };

  if (mode === "custom-explicit" || mode === "explicit-handles") {
    const explicit = explicitDeltasForSegment(
      { stamp: start.stamp, value: Number(start.value) },
      { stamp: end.stamp, value: Number(end.value) },
    );
    start.transitions.out = explicit.out;
    end.transitions.in = explicit.in;
    end.transitions.pairing = "free";
    return;
  }

  start.transitions.out = mode;
  end.transitions.in = mode;
}

function makeScalarProofPoints(
  stamps: readonly number[],
  values: readonly number[],
  idPrefix: string,
): WorkbenchPoint[] {
  const scalarPoints: WorkbenchPoint[] = stamps.map((stamp, index) => ({
    id: `${idPrefix}-${index.toString().padStart(2, "0")}`,
    stamp,
    value: values[index],
  }));

  WORKBENCH_SEGMENT_MODES.forEach((mode, index) => {
    if (mode === "explicit-handles") {
      const start = scalarPoints[index];
      const end = scalarPoints[index + 1];
      start.transitions = { ...(start.transitions ?? {}), out: mode };
      end.transitions = { ...(end.transitions ?? {}), in: mode };
      return;
    }
    setSegmentTransitions(scalarPoints, index, mode);
  });

  return scalarPoints;
}

function convertExplicitDeltasToLegacyBezierHandles(points: WorkbenchPoint[]) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const span = end.stamp - start.stamp;
    const valueSpan = Number(end.value) - Number(start.value);
    if (!Number.isFinite(span) || Math.abs(span) < Number.EPSILON) continue;

    const outgoing = start.transitions?.out;
    if (isExplicitTransition(outgoing)) {
      start.transitions = {
        ...(start.transitions ?? {}),
        out: {
          x: roundDelta(outgoing.x / span),
          y: roundDelta(
            Number.isFinite(valueSpan) && Math.abs(valueSpan) > Number.EPSILON
              ? outgoing.y / valueSpan
              : outgoing.y,
          ),
        },
      };
    }

    const incoming = end.transitions?.in;
    if (isExplicitTransition(incoming)) {
      end.transitions = {
        ...(end.transitions ?? {}),
        in: {
          x: roundDelta(1 + incoming.x / span),
          y: roundDelta(
            Number.isFinite(valueSpan) && Math.abs(valueSpan) > Number.EPSILON
              ? 1 + incoming.y / valueSpan
              : 1 + incoming.y,
          ),
        },
      };
    }
  }
}

export function makeStudioTransitionWorkbenchAnimation(): StudioV2WorkbenchAnimation {
  const scalarPoints = makeScalarProofPoints(
    WORKBENCH_STAMPS_MS,
    WORKBENCH_VALUES,
    "scalar",
  );

  return {
    id: "studio-v2-transition-workbench",
    name: "Studio v2 Transition Workbench",
    formatVersion: 2,
    defaultViewportExtent: 8000,
    tracks: [
      {
        id: WORKBENCH_SCALAR_TRACK_ID,
        name: "Scalar transition range",
        animatableId: "studio/transition/scalar",
        points: scalarPoints,
        settings: { color: "#58d6a9" },
      },
      {
        id: "workbench-step-boolean",
        name: "Boolean hold track",
        animatableId: "studio/step/bool",
        points: [
          { id: "bool-0", stamp: 0, value: false },
          { id: "bool-1", stamp: 1200, value: true },
          { id: "bool-2", stamp: 2600, value: false },
          { id: "bool-3", stamp: 4300, value: true },
          { id: "bool-4", stamp: 6200, value: false },
          { id: "bool-5", stamp: 8000, value: true },
        ],
        settings: { color: "#f2c94c" },
      },
      {
        id: "workbench-step-text",
        name: "Text hold track",
        animatableId: "studio/step/text",
        points: [
          { id: "text-0", stamp: 0, value: "start" },
          { id: "text-1", stamp: 1800, value: "linearized" },
          { id: "text-2", stamp: 3600, value: "handled" },
          { id: "text-3", stamp: 5600, value: "auto" },
          { id: "text-4", stamp: 8000, value: "done" },
        ],
        settings: { color: "#8fb3ff" },
      },
    ],
    groups: makeWorkbenchTrackGroups(),
  };
}

export function makeStudioCanonicalTransitionAsset(): StudioV2WorkbenchAnimation {
  const scalarPoints = makeScalarProofPoints(
    STUDIO_CANONICAL_STAMPS_MS,
    STUDIO_CANONICAL_VALUES,
    "studio-scalar",
  );

  return {
    id: "studio-canonical-transition-asset",
    name: "Studio Canonical Transition Asset",
    formatVersion: 2,
    defaultViewportExtent: 8200,
    tracks: [
      {
        id: WORKBENCH_SCALAR_TRACK_ID,
        name: "Canonical scalar transition range",
        animatableId: "studio/transition/scalar",
        points: scalarPoints,
        settings: { color: "#58d6a9" },
      },
      {
        id: "workbench-step-boolean",
        name: "Canonical boolean hold track",
        animatableId: "studio/step/bool",
        points: [
          { id: "studio-bool-0", stamp: 0, value: true },
          { id: "studio-bool-1", stamp: 1040, value: false },
          { id: "studio-bool-2", stamp: 2480, value: true },
          { id: "studio-bool-3", stamp: 4910, value: false },
          { id: "studio-bool-4", stamp: 8200, value: true },
        ],
        settings: { color: "#f2c94c" },
      },
      {
        id: "workbench-step-text",
        name: "Canonical text hold track",
        animatableId: "studio/step/text",
        points: [
          { id: "studio-text-0", stamp: 0, value: "idle" },
          { id: "studio-text-1", stamp: 1680, value: "anticipate" },
          { id: "studio-text-2", stamp: 3520, value: "overshoot" },
          { id: "studio-text-3", stamp: 5860, value: "settle" },
          { id: "studio-text-4", stamp: 8200, value: "complete" },
        ],
        settings: { color: "#8fb3ff" },
      },
    ],
    groups: makeWorkbenchTrackGroups(),
  };
}

function makeLegacyVizijTransitionAsset(): LegacyVizijAnimation {
  const durationMs = 8000;
  const normalizeStamp = (stamp: number) => roundDelta(stamp / durationMs);
  const scalarPoints = makeScalarProofPoints(
    WORKBENCH_STAMPS_MS.map(normalizeStamp),
    WORKBENCH_VALUES,
    "legacy-scalar",
  );
  convertExplicitDeltasToLegacyBezierHandles(scalarPoints);

  return {
    id: "legacy-vizij-migrated-transition-asset",
    name: "Legacy Vizij Migrated Transition Asset",
    duration: durationMs,
    groups: {
      curves: {
        name: "Legacy curves",
        children: [WORKBENCH_SCALAR_TRACK_ID],
      },
      holds: {
        name: "Legacy hold values",
        children: ["workbench-step-boolean", "workbench-step-text"],
      },
    },
    tracks: [
      {
        id: WORKBENCH_SCALAR_TRACK_ID,
        name: "Migrated scalar transition range",
        animatableId: "studio/transition/scalar",
        points: scalarPoints,
        settings: { color: "#58d6a9" },
      },
      {
        id: "workbench-step-boolean",
        name: "Migrated boolean hold track",
        animatableId: "studio/step/bool",
        points: [
          { id: "legacy-bool-0", stamp: 0, value: false },
          { id: "legacy-bool-1", stamp: normalizeStamp(1200), value: true },
          { id: "legacy-bool-2", stamp: normalizeStamp(2600), value: false },
          { id: "legacy-bool-3", stamp: normalizeStamp(4300), value: true },
          { id: "legacy-bool-4", stamp: normalizeStamp(6200), value: false },
          { id: "legacy-bool-5", stamp: 1, value: true },
        ],
        settings: { color: "#f2c94c" },
      },
      {
        id: "workbench-step-text",
        name: "Migrated text hold track",
        animatableId: "studio/step/text",
        points: [
          { id: "legacy-text-0", stamp: 0, value: "start" },
          {
            id: "legacy-text-1",
            stamp: normalizeStamp(1800),
            value: "linearized",
          },
          {
            id: "legacy-text-2",
            stamp: normalizeStamp(3600),
            value: "handled",
          },
          { id: "legacy-text-3", stamp: normalizeStamp(5600), value: "auto" },
          { id: "legacy-text-4", stamp: 1, value: "done" },
        ],
        settings: { color: "#8fb3ff" },
      },
    ],
  };
}

function cloneSerializableValue<T>(value: T): T {
  return cloneDeepSafe(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLegacyTrackGroup(
  candidate: unknown,
  fallbackId: string,
): WorkbenchTrackGroup {
  if (isPlainObject(candidate)) {
    const id =
      typeof candidate.id === "string" && candidate.id.length > 0
        ? candidate.id
        : fallbackId;
    const name =
      typeof candidate.name === "string" && candidate.name.length > 0
        ? candidate.name
        : id;
    const rawChildren = Array.isArray(candidate.children)
      ? candidate.children
      : Array.isArray(candidate.tracks)
        ? candidate.tracks
        : [];
    return {
      id,
      name,
      children: rawChildren
        .map((child, index) => {
          if (typeof child === "string") return child;
          if (isPlainObject(child)) {
            return normalizeLegacyTrackGroup(child, `${id}-${index}`);
          }
          return null;
        })
        .filter((child): child is string | WorkbenchTrackGroup =>
          Boolean(child),
        ),
    };
  }

  return {
    id: fallbackId,
    name: fallbackId,
    children: [],
  };
}

function normalizeLegacyGroups(groups: unknown): WorkbenchTrackGroup[] {
  if (Array.isArray(groups)) {
    return groups.map((group, index) =>
      normalizeLegacyTrackGroup(group, `group-${index}`),
    );
  }

  if (isPlainObject(groups)) {
    return Object.entries(groups).map(([id, group]) =>
      normalizeLegacyTrackGroup(group, id),
    );
  }

  return [];
}

type TransitionMigrationMode = "studio-v1" | "legacy-vizij" | "millisecond";

type TransitionSegmentContext = {
  spanMs: number;
  valueDelta?: number;
};

function resolveTransitionMigrationMode(params: {
  sourceVersion: number;
  shouldScaleUnitDomain: boolean;
}): TransitionMigrationMode {
  if (!params.shouldScaleUnitDomain) return "millisecond";
  return params.sourceVersion === 1 ? "studio-v1" : "legacy-vizij";
}

function numericValue(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function transitionSegmentContext(params: {
  side: "in" | "out";
  points: LegacyVizijAnimation["tracks"][number]["points"];
  pointIndex: number;
  durationMs: number;
  shouldScaleUnitDomain: boolean;
}): TransitionSegmentContext | undefined {
  const startIndex =
    params.side === "out" ? params.pointIndex : params.pointIndex - 1;
  if (startIndex < 0 || startIndex >= params.points.length - 1) {
    return undefined;
  }

  const start = params.points[startIndex];
  const end = params.points[startIndex + 1];
  const startStamp = Number(start.stamp);
  const endStamp = Number(end.stamp);
  if (!Number.isFinite(startStamp) || !Number.isFinite(endStamp)) {
    return undefined;
  }

  const stampScale = params.shouldScaleUnitDomain ? params.durationMs : 1;
  const startValue = numericValue(start.value);
  const endValue = numericValue(end.value);
  return {
    spanMs: (endStamp - startStamp) * stampScale,
    valueDelta:
      startValue !== undefined && endValue !== undefined
        ? endValue - startValue
        : undefined,
  };
}

function migrateLegacyTransitionValue(params: {
  value: unknown;
  durationMs: number;
  shouldScaleUnitDomain: boolean;
  mode: TransitionMigrationMode;
  side: "in" | "out";
  segment?: TransitionSegmentContext;
  diagnostics: LegacyAnimationMigrationDiagnostic[];
  path: string;
}): StudioAuthoredTransition | undefined {
  const {
    value,
    durationMs,
    shouldScaleUnitDomain,
    mode,
    side,
    segment,
    diagnostics,
    path,
  } = params;
  if (value === undefined) return undefined;

  if (isStandardTransition(value) || isDirective(value)) {
    return value;
  }

  if (typeof value === "string") {
    diagnostics.push({
      level: "error",
      code: "unknown-transition-token",
      message: `Unknown transition token "${value}" cannot be verified against Studio v2.`,
      path,
    });
    return value as StudioAuthoredTransition;
  }

  if (isExplicitTransition(value)) {
    const looksAlreadyMillisecond =
      shouldScaleUnitDomain && Math.abs(value.x) > 1;
    if (looksAlreadyMillisecond) {
      diagnostics.push({
        level: "warning",
        code: "transition-x-already-ms",
        message:
          "Transition x value looked larger than the legacy normalized domain, so it was preserved as milliseconds.",
        path,
      });
      return {
        x: roundDelta(value.x),
        y: roundDelta(value.y),
      };
    }

    if (mode === "studio-v1") {
      return {
        x: roundDelta(value.x * durationMs),
        y: roundDelta(value.y),
      };
    }

    if (mode === "legacy-vizij") {
      if (!segment || !Number.isFinite(segment.spanMs)) {
        diagnostics.push({
          level: "warning",
          code: "transition-segment-missing",
          message:
            "Transition handle could not be matched to a segment and was preserved as authored.",
          path,
        });
        return {
          x: roundDelta(value.x),
          y: roundDelta(value.y),
        };
      }

      const valueDelta = segment.valueDelta;
      if (side === "out") {
        return {
          x: roundDelta(value.x * segment.spanMs),
          y: roundDelta(
            valueDelta === undefined ? value.y : value.y * valueDelta,
          ),
        };
      }

      return {
        x: roundDelta((value.x - 1) * segment.spanMs),
        y: roundDelta(
          valueDelta === undefined ? value.y - 1 : (value.y - 1) * valueDelta,
        ),
      };
    }

    return {
      x: roundDelta(value.x),
      y: roundDelta(value.y),
    };
  }

  if (isPlainObject(value)) {
    const deltaStamp = Number(value.deltaStamp);
    const deltaValue = Number(value.deltaValue);
    if (Number.isFinite(deltaStamp) && Number.isFinite(deltaValue)) {
      diagnostics.push({
        level: "warning",
        code: "transition-delta-fields-normalized",
        message:
          "Transition used deltaStamp/deltaValue fields and was normalized to Studio x/y fields.",
        path,
      });
      return {
        x: roundDelta(deltaStamp),
        y: roundDelta(deltaValue),
      };
    }
  }

  diagnostics.push({
    level: "error",
    code: "malformed-transition",
    message: "Transition value was not a Studio-compatible token or handle.",
    path,
  });
  return undefined;
}

function resolveMigrationExtentMs(
  animation: LegacyVizijAnimation,
  maxStamp: number,
  diagnostics: LegacyAnimationMigrationDiagnostic[],
): number {
  const viewport = Number(animation.defaultViewportExtent);
  if (Number.isFinite(viewport) && viewport > 0) return viewport;

  const duration = Number(animation.duration);
  if (Number.isFinite(duration) && duration > 0) return duration;

  if (maxStamp > 1) return maxStamp;

  diagnostics.push({
    level: "warning",
    code: "missing-legacy-duration",
    message:
      "Legacy animation did not include duration/defaultViewportExtent; 1000 ms was used as a migration fallback.",
  });
  return 1000;
}

export function migrateLegacyVizijAnimationToStudioV2(
  animation: LegacyVizijAnimation,
): LegacyAnimationMigrationResult {
  const diagnostics: LegacyAnimationMigrationDiagnostic[] = [];
  const maxStamp = getMaxAuthoredStamp(animation);
  const durationMs = resolveMigrationExtentMs(animation, maxStamp, diagnostics);
  const sourceVersion = Number(animation.formatVersion);
  const shouldScaleUnitDomain = sourceVersion !== 2 && maxStamp <= 1;
  const transitionMode = resolveTransitionMigrationMode({
    sourceVersion,
    shouldScaleUnitDomain,
  });

  const tracks = animation.tracks.map((track, trackIndex) => ({
    id: track.id,
    name: track.name,
    animatableId: track.animatableId,
    points: track.points.map((point, pointIndex) => {
      const stamp = Number(point.stamp);
      if (!Number.isFinite(stamp)) {
        diagnostics.push({
          level: "error",
          code: "invalid-keypoint-stamp",
          message: "Keypoint stamp was not finite and was migrated to 0 ms.",
          path: `tracks[${trackIndex}].points[${pointIndex}].stamp`,
        });
      }
      const nextPoint: WorkbenchPoint = {
        id: point.id,
        stamp: roundDelta(
          (Number.isFinite(stamp) ? stamp : 0) *
            (shouldScaleUnitDomain ? durationMs : 1),
        ),
        value: cloneSerializableValue(point.value),
      };

      if (point.transitions) {
        const transitions: WorkbenchPoint["transitions"] = {};
        const incoming = migrateLegacyTransitionValue({
          value: point.transitions.in,
          durationMs,
          shouldScaleUnitDomain,
          mode: transitionMode,
          side: "in",
          segment: transitionSegmentContext({
            side: "in",
            points: track.points,
            pointIndex,
            durationMs,
            shouldScaleUnitDomain,
          }),
          diagnostics,
          path: `tracks[${trackIndex}].points[${pointIndex}].transitions.in`,
        });
        const outgoing = migrateLegacyTransitionValue({
          value: point.transitions.out,
          durationMs,
          shouldScaleUnitDomain,
          mode: transitionMode,
          side: "out",
          segment: transitionSegmentContext({
            side: "out",
            points: track.points,
            pointIndex,
            durationMs,
            shouldScaleUnitDomain,
          }),
          diagnostics,
          path: `tracks[${trackIndex}].points[${pointIndex}].transitions.out`,
        });
        if (incoming !== undefined) transitions.in = incoming;
        if (outgoing !== undefined) transitions.out = outgoing;
        if (
          point.transitions.pairing === "paired" ||
          point.transitions.pairing === "free"
        ) {
          transitions.pairing = point.transitions.pairing;
        } else if (point.transitions.pairing !== undefined) {
          diagnostics.push({
            level: "warning",
            code: "unknown-transition-pairing",
            message: "Unknown transition pairing was dropped.",
            path: `tracks[${trackIndex}].points[${pointIndex}].transitions.pairing`,
          });
        }
        if (Object.keys(transitions).length > 0) {
          nextPoint.transitions = transitions;
        }
      }

      return nextPoint;
    }),
    settings: cloneSerializableValue(track.settings),
  }));

  return {
    animation: {
      id: animation.id,
      name: animation.name,
      formatVersion: 2,
      defaultViewportExtent: durationMs,
      tracks,
      groups: normalizeLegacyGroups(animation.groups),
    },
    diagnostics,
  };
}

export function makeMigratedLegacyVizijTransitionAsset(): LegacyAnimationMigrationResult {
  return migrateLegacyVizijAnimationToStudioV2(
    makeLegacyVizijTransitionAsset(),
  );
}

export function makeTransitionWorkbenchAsset(
  kind: WorkbenchAssetKind,
): StudioV2WorkbenchAnimation {
  if (kind === "legacy-migrated") {
    return makeMigratedLegacyVizijTransitionAsset().animation;
  }

  return kind === "generated-fixture"
    ? makeStudioTransitionWorkbenchAnimation()
    : makeStudioCanonicalTransitionAsset();
}

export function getAnimationExtentMs(animation: {
  defaultViewportExtent?: unknown;
  duration?: unknown;
  tracks?: Array<{ points?: Array<{ stamp?: unknown }> }>;
}): number {
  const maxStamp = (animation.tracks ?? []).reduce((trackMax, track) => {
    const pointMax = (track.points ?? []).reduce((pointMaxValue, point) => {
      const stamp = Number(point.stamp);
      return Number.isFinite(stamp)
        ? Math.max(pointMaxValue, stamp)
        : pointMaxValue;
    }, 0);
    return Math.max(trackMax, pointMax);
  }, 0);
  const viewport = Number(animation.defaultViewportExtent);
  const duration = Number(animation.duration);
  return Math.max(
    1,
    Number.isFinite(viewport) ? viewport : 0,
    Number.isFinite(duration) ? duration : 0,
    maxStamp,
  );
}

export function getMaxAuthoredStamp(animation: {
  tracks?: Array<{ points?: Array<{ stamp?: unknown }> }>;
}): number {
  return (animation.tracks ?? []).reduce((trackMax, track) => {
    const pointMax = (track.points ?? []).reduce((pointMaxValue, point) => {
      const stamp = Number(point.stamp);
      return Number.isFinite(stamp)
        ? Math.max(pointMaxValue, stamp)
        : pointMaxValue;
    }, 0);
    return Math.max(trackMax, pointMax);
  }, 0);
}

export function usesUnitDomainStamps(animation: {
  formatVersion?: unknown;
  tracks?: Array<{ points?: Array<{ stamp?: unknown }> }>;
}): boolean {
  if (Number(animation.formatVersion) === 2) return false;
  return getMaxAuthoredStamp(animation) <= 1;
}

export function pointStampToSeconds(
  animation: {
    formatVersion?: unknown;
    defaultViewportExtent?: unknown;
    duration?: unknown;
    tracks?: Array<{ points?: Array<{ stamp?: unknown }> }>;
  },
  stamp: number,
): number {
  if (usesUnitDomainStamps(animation)) {
    return (
      (Math.max(0, Math.min(1, stamp)) * getAnimationExtentMs(animation)) / 1000
    );
  }
  return Math.max(0, stamp) / 1000;
}

export function getTransitionCoverage(animation: {
  tracks?: Array<{
    points?: WorkbenchPoint[];
  }>;
}): {
  standardNames: StudioStandardTransition[];
  directives: StudioTransitionDirective[];
  hasExplicitHandles: boolean;
  hasStepValueTracks: boolean;
} {
  const standards = new Set<StudioStandardTransition>();
  const directives = new Set<StudioTransitionDirective>();
  let hasExplicitHandles = false;
  let hasStepValueTracks = false;

  (animation.tracks ?? []).forEach((track) => {
    (track.points ?? []).forEach((point) => {
      if (typeof point.value === "boolean" || typeof point.value === "string") {
        hasStepValueTracks = true;
      }
      const values = [point.transitions?.in, point.transitions?.out];
      values.forEach((transition) => {
        if (isStandardTransition(transition)) standards.add(transition);
        if (isDirective(transition)) directives.add(transition);
        if (isExplicitTransition(transition)) hasExplicitHandles = true;
      });
    });
  });

  return {
    standardNames: STUDIO_STANDARD_TRANSITIONS.filter((name) =>
      standards.has(name),
    ),
    directives: STUDIO_TRANSITION_DIRECTIVES.filter((name) =>
      directives.has(name),
    ),
    hasExplicitHandles,
    hasStepValueTracks,
  };
}

function inferAssetSourceKind(animation: {
  id?: unknown;
}): WorkbenchAssetSourceKind {
  if (animation.id === "studio-v2-transition-workbench") {
    return "generated-fixture";
  }

  if (animation.id === "legacy-vizij-migrated-transition-asset") {
    return "legacy-migrated";
  }

  if (animation.id === "studio-canonical-transition-asset") {
    return JSON.stringify(animation) ===
      JSON.stringify(makeStudioCanonicalTransitionAsset())
      ? "studio-canonical"
      : "live-edited";
  }

  return "imported";
}

function collectTransitionIssues(animation: {
  tracks?: Array<{
    points?: Array<{
      transitions?: {
        in?: unknown;
        out?: unknown;
      };
    }>;
  }>;
}) {
  const issues: string[] = [];
  animation.tracks?.forEach((track, trackIndex) => {
    track.points?.forEach((point, pointIndex) => {
      const transitions = [point.transitions?.in, point.transitions?.out];
      transitions.forEach((transition) => {
        if (transition === undefined) return;
        if (
          !isStandardTransition(transition) &&
          !isDirective(transition) &&
          !isExplicitTransition(transition)
        ) {
          issues.push(
            `track ${trackIndex} point ${pointIndex} has an unknown transition`,
          );
        }
      });
    });
  });
  return issues;
}

export function getStudioV2CompatibilityReport(animation: {
  id?: unknown;
  formatVersion?: unknown;
  defaultViewportExtent?: unknown;
  duration?: unknown;
  tracks?: Array<{
    points?: Array<{
      stamp?: unknown;
      value?: unknown;
      transitions?: {
        in?: unknown;
        out?: unknown;
      };
    }>;
  }>;
  groups?: unknown;
}): StudioV2CompatibilityReport {
  const issues: string[] = [];
  const maxStamp = getMaxAuthoredStamp(animation);
  const extentMs = getAnimationExtentMs(animation);
  const hasLegacyDuration = typeof animation.duration === "number";
  const hasDefaultViewportExtent =
    typeof animation.defaultViewportExtent === "number" &&
    Number.isFinite(animation.defaultViewportExtent);
  const usesMillisecondStamps =
    Number(animation.formatVersion) === 2 &&
    (maxStamp > 1 || Number(animation.defaultViewportExtent) > 1);
  const groupsAreStudioArray = Array.isArray(animation.groups);

  if (Number(animation.formatVersion) !== 2) {
    issues.push("formatVersion is not 2");
  }
  if (hasLegacyDuration) {
    issues.push("legacy duration field is present");
  }
  if (!hasDefaultViewportExtent) {
    issues.push("defaultViewportExtent is missing");
  }
  if (!usesMillisecondStamps) {
    issues.push("keypoint stamps are not millisecond-domain");
  }
  if (!groupsAreStudioArray) {
    issues.push("groups is not a Studio track-group array");
  }
  if (!Array.isArray(animation.tracks) || animation.tracks.length === 0) {
    issues.push("tracks are missing");
  }
  animation.tracks?.forEach((track, trackIndex) => {
    if (!Array.isArray(track.points) || track.points.length === 0) {
      issues.push(`track ${trackIndex} has no keypoints`);
      return;
    }
    track.points.forEach((point, pointIndex) => {
      const stamp = Number(point.stamp);
      if (!Number.isFinite(stamp)) {
        issues.push(
          `track ${trackIndex} point ${pointIndex} has invalid stamp`,
        );
      }
    });
  });
  issues.push(...collectTransitionIssues(animation));

  const coverage = getTransitionCoverage(
    animation as unknown as StudioV2WorkbenchAnimation,
  );

  return {
    sourceKind: inferAssetSourceKind(animation),
    isCompatible: issues.length === 0,
    issues,
    extentMs,
    maxStamp,
    hasLegacyDuration,
    hasDefaultViewportExtent,
    usesMillisecondStamps,
    groupsAreStudioArray,
    coverage,
  };
}

export function applySegmentTransitionMode(
  animation: StudioV2WorkbenchAnimation,
  trackId: string,
  segmentIndex: number,
  mode: WorkbenchSegmentMode,
): StudioV2WorkbenchAnimation {
  const next = cloneAnimation(animation);
  const track = next.tracks.find((candidate) => candidate.id === trackId);
  if (!track || segmentIndex < 0 || segmentIndex >= track.points.length - 1) {
    return next;
  }
  setSegmentTransitions(track.points, segmentIndex, mode);
  return next;
}

export function updateSegmentHandle(
  animation: StudioV2WorkbenchAnimation,
  trackId: string,
  segmentIndex: number,
  anchor: "startOut" | "endIn",
  handle: WorldPoint,
): StudioV2WorkbenchAnimation {
  const next = cloneAnimation(animation);
  const track = next.tracks.find((candidate) => candidate.id === trackId);
  if (!track || segmentIndex < 0 || segmentIndex >= track.points.length - 1) {
    return next;
  }

  const start = track.points[segmentIndex];
  const end = track.points[segmentIndex + 1];
  const anchorPoint = anchor === "startOut" ? start : end;
  const delta = dragHandleToTransitionDelta({
    anchor: { stamp: anchorPoint.stamp, value: Number(anchorPoint.value) },
    handle,
  });

  anchorPoint.transitions = { ...(anchorPoint.transitions ?? {}) };
  if (anchor === "startOut") {
    anchorPoint.transitions.out = delta;
  } else {
    anchorPoint.transitions.in = delta;
  }
  return next;
}

export function resolveSegmentHandleGeometry(
  track: WorkbenchTrack,
  segmentIndex: number,
): SegmentHandleGeometry | null {
  const startPoint = track.points[segmentIndex];
  const endPoint = track.points[segmentIndex + 1];
  if (!startPoint || !endPoint) return null;
  if (
    typeof startPoint.value !== "number" ||
    typeof endPoint.value !== "number"
  ) {
    return null;
  }

  const prevPoint = track.points[segmentIndex - 1];
  const nextPoint = track.points[segmentIndex + 2];
  const start = { stamp: startPoint.stamp, value: startPoint.value };
  const end = { stamp: endPoint.stamp, value: endPoint.value };
  const prev =
    prevPoint && typeof prevPoint.value === "number"
      ? { stamp: prevPoint.stamp, value: prevPoint.value }
      : undefined;
  const next =
    nextPoint && typeof nextPoint.value === "number"
      ? { stamp: nextPoint.stamp, value: nextPoint.value }
      : undefined;

  const startOut = transitionToDelta({
    side: "out",
    transition: startPoint.transitions?.out,
    start,
    end,
    prev,
    next,
  });
  const endIn = transitionToDelta({
    side: "in",
    transition: endPoint.transitions?.in,
    start,
    end,
    prev,
    next,
  });

  return {
    start,
    end,
    startOut,
    endIn,
    cp1: {
      stamp: start.stamp + startOut.x,
      value: start.value + startOut.y,
    },
    cp2: {
      stamp: end.stamp + endIn.x,
      value: end.value + endIn.y,
    },
  };
}

function cubicAt(t: number, p0: number, p1: number, p2: number, p3: number) {
  const inv = 1 - t;
  return (
    inv * inv * inv * p0 +
    3 * inv * inv * t * p1 +
    3 * inv * t * t * p2 +
    t * t * t * p3
  );
}

function cubicDerivativeAt(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
) {
  const inv = 1 - t;
  return (
    3 * inv * inv * (p1 - p0) + 6 * inv * t * (p2 - p1) + 3 * t * t * (p3 - p2)
  );
}

function solveBezierTForX(x: number, cp1x: number, cp2x: number) {
  let t = clamp01(x);
  for (let i = 0; i < 8; i++) {
    const current = cubicAt(t, 0, cp1x, cp2x, 1) - x;
    const derivative = cubicDerivativeAt(t, 0, cp1x, cp2x, 1);
    if (Math.abs(derivative) < 1e-6) break;
    t = clamp01(t - current / derivative);
  }

  let lower = 0;
  let upper = 1;
  for (let i = 0; i < 16; i++) {
    const currentX = cubicAt(t, 0, cp1x, cp2x, 1);
    if (Math.abs(currentX - x) < 1e-5) break;
    if (currentX < x) lower = t;
    else upper = t;
    t = (lower + upper) / 2;
  }
  return t;
}

function segmentParams(geometry: SegmentHandleGeometry): {
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
} {
  const span = geometry.end.stamp - geometry.start.stamp || 1;
  const valueSpan = geometry.end.value - geometry.start.value || 1;
  return {
    cp1x: clamp01((geometry.cp1.stamp - geometry.start.stamp) / span),
    cp1y: (geometry.cp1.value - geometry.start.value) / valueSpan,
    cp2x: clamp01((geometry.cp2.stamp - geometry.start.stamp) / span),
    cp2y: (geometry.cp2.value - geometry.start.value) / valueSpan,
  };
}

export function sampleScalarTrackAt(
  track: WorkbenchTrack,
  stampMs: number,
): number {
  const points = [...track.points]
    .filter((point) => typeof point.value === "number")
    .sort((left, right) => left.stamp - right.stamp);
  if (points.length === 0) return Number.NaN;
  if (stampMs <= points[0].stamp) return Number(points[0].value);
  const last = points[points.length - 1];
  if (stampMs >= last.stamp) return Number(last.value);

  const segmentIndex = points.findIndex((point, index) => {
    const end = points[index + 1];
    return end ? stampMs >= point.stamp && stampMs <= end.stamp : false;
  });
  if (segmentIndex < 0) return Number(last.value);

  const geometry = resolveSegmentHandleGeometry(
    { ...track, points },
    segmentIndex,
  );
  if (!geometry) return Number(points[segmentIndex].value);

  const localX =
    (stampMs - geometry.start.stamp) /
    Math.max(1, geometry.end.stamp - geometry.start.stamp);
  const params = segmentParams(geometry);
  const t = solveBezierTForX(localX, params.cp1x, params.cp2x);
  const y = cubicAt(t, 0, params.cp1y, params.cp2y, 1);
  return geometry.start.value + y * (geometry.end.value - geometry.start.value);
}
