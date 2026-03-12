import type { VizijAssetBundle, VizijInputMetadata } from "../types";
import { buildRigInputPath } from "./posePaths";

type InputConstraint = { min?: number; max?: number; defaultValue?: number };

export type FaceScalarControl = {
  path: string;
  min: number;
  max: number;
  defaultValue: number;
};

export type ResolvedFaceControls = {
  faceId: string;
  gazeSource:
    | "standard-vizij"
    | "standard"
    | "propsrig"
    | "coupled-gaze"
    | "none";
  blinkSource: "lids" | "blink" | "none";
  eyes: {
    leftX: FaceScalarControl | null;
    leftY: FaceScalarControl | null;
    rightX: FaceScalarControl | null;
    rightY: FaceScalarControl | null;
  };
  eyelids: {
    leftUpper: FaceScalarControl | null;
    rightUpper: FaceScalarControl | null;
  };
  blink: FaceScalarControl | null;
};

type ControlsLookup = {
  pathSet: Set<string>;
  metadataByPath: Map<string, VizijInputMetadata>;
};

const DEFAULT_GAZE_CONTROL = {
  min: -1,
  max: 1,
  defaultValue: 0,
} as const;

const DEFAULT_BLINK_CONTROL = {
  min: 0,
  max: 1,
  defaultValue: 0,
} as const;

const STANDARD_VIZIJ_EYE_PATHS = {
  leftX: "/standard/vizij/left_eye/pos/x",
  leftY: "/standard/vizij/left_eye/pos/y",
  rightX: "/standard/vizij/right_eye/pos/x",
  rightY: "/standard/vizij/right_eye/pos/y",
  leftUpper: "/standard/vizij/left_eye_top_eyelid/pos/y",
  rightUpper: "/standard/vizij/right_eye_top_eyelid/pos/y",
} as const;

const LEGACY_STANDARD_EYE_PATHS = {
  leftX: "/standard/left_eye/pos/x",
  leftY: "/standard/left_eye/pos/y",
  rightX: "/standard/right_eye/pos/x",
  rightY: "/standard/right_eye/pos/y",
  leftUpper: "/standard/left_eye_top_eyelid/pos/y",
  rightUpper: "/standard/right_eye_top_eyelid/pos/y",
} as const;

const PROPSRIG_EYE_PATHS = {
  leftX: "/propsrig/l_eye/translation/x",
  leftY: "/propsrig/l_eye/translation/y",
  rightX: "/propsrig/r_eye/translation/x",
  rightY: "/propsrig/r_eye/translation/y",
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeInputPath(path: string | null | undefined): string | null {
  const trimmed = path?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("/")) {
    return trimmed;
  }
  const rigMatch = trimmed.match(/^rig\/[^/]+(\/.*)$/);
  if (rigMatch?.[1]) {
    return rigMatch[1];
  }
  return `/${trimmed}`;
}

function buildControlsLookup(assetBundle: VizijAssetBundle): ControlsLookup {
  const metadata = assetBundle.rig?.inputMetadata ?? [];
  const metadataByPath = new Map<string, VizijInputMetadata>();
  const pathSet = new Set<string>();

  metadata.forEach((entry) => {
    const normalized = normalizeInputPath(entry.path);
    if (!normalized) {
      return;
    }
    pathSet.add(normalized);
    if (!metadataByPath.has(normalized)) {
      metadataByPath.set(normalized, entry);
    }
  });

  return { pathSet, metadataByPath };
}

function resolveConstraint(
  absolutePath: string,
  relativePath: string,
  inputConstraints:
    | Record<string, { min?: number; max?: number; defaultValue?: number }>
    | undefined,
): InputConstraint | null {
  if (!inputConstraints) {
    return null;
  }
  const normalizedRelative = relativePath.replace(/^\//, "");
  const candidates = [
    absolutePath,
    relativePath,
    normalizedRelative,
    absolutePath.replace(/^rig\/[^/]+\//, ""),
  ];

  for (const candidate of candidates) {
    const constraint = inputConstraints[candidate];
    if (constraint) {
      return constraint;
    }
  }

  return null;
}

function createControl(
  faceId: string,
  lookup: ControlsLookup,
  relativePath: string,
  inputConstraints:
    | Record<string, { min?: number; max?: number; defaultValue?: number }>
    | undefined,
  fallback: { min: number; max: number; defaultValue: number },
): FaceScalarControl | null {
  const normalizedRelative = normalizeInputPath(relativePath);
  if (!normalizedRelative || !lookup.pathSet.has(normalizedRelative)) {
    return null;
  }

  const absolutePath = buildRigInputPath(faceId, normalizedRelative);
  const metadata = lookup.metadataByPath.get(normalizedRelative);
  const constraint = resolveConstraint(
    absolutePath,
    normalizedRelative,
    inputConstraints,
  );

  const min = Number.isFinite(Number(constraint?.min ?? metadata?.range?.min))
    ? Number(constraint?.min ?? metadata?.range?.min)
    : fallback.min;
  const max = Number.isFinite(Number(constraint?.max ?? metadata?.range?.max))
    ? Number(constraint?.max ?? metadata?.range?.max)
    : fallback.max;
  const midpoint = min + (max - min) / 2;
  const defaultValue = Number.isFinite(
    Number(constraint?.defaultValue ?? metadata?.defaultValue),
  )
    ? Number(constraint?.defaultValue ?? metadata?.defaultValue)
    : Number.isFinite(midpoint)
      ? midpoint
      : fallback.defaultValue;

  return {
    path: absolutePath,
    min,
    max,
    defaultValue,
  };
}

function hasAll(
  controls: Record<string, FaceScalarControl | null>,
  keys: string[],
): boolean {
  return keys.every((key) => Boolean(controls[key]));
}

export function resolveFaceControls(
  assetBundle: VizijAssetBundle,
  runtimeFaceId?: string | null,
  inputConstraints?: Record<string, InputConstraint>,
): ResolvedFaceControls {
  const faceId =
    assetBundle.faceId ??
    assetBundle.pose?.config?.faceId ??
    runtimeFaceId ??
    "face";
  const lookup = buildControlsLookup(assetBundle);

  const standardVizijControls = {
    leftX: createControl(
      faceId,
      lookup,
      STANDARD_VIZIJ_EYE_PATHS.leftX,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    leftY: createControl(
      faceId,
      lookup,
      STANDARD_VIZIJ_EYE_PATHS.leftY,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    rightX: createControl(
      faceId,
      lookup,
      STANDARD_VIZIJ_EYE_PATHS.rightX,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    rightY: createControl(
      faceId,
      lookup,
      STANDARD_VIZIJ_EYE_PATHS.rightY,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    leftUpper: createControl(
      faceId,
      lookup,
      STANDARD_VIZIJ_EYE_PATHS.leftUpper,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    rightUpper: createControl(
      faceId,
      lookup,
      STANDARD_VIZIJ_EYE_PATHS.rightUpper,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
  };

  const legacyStandardControls = {
    leftX: createControl(
      faceId,
      lookup,
      LEGACY_STANDARD_EYE_PATHS.leftX,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    leftY: createControl(
      faceId,
      lookup,
      LEGACY_STANDARD_EYE_PATHS.leftY,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    rightX: createControl(
      faceId,
      lookup,
      LEGACY_STANDARD_EYE_PATHS.rightX,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    rightY: createControl(
      faceId,
      lookup,
      LEGACY_STANDARD_EYE_PATHS.rightY,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    leftUpper: createControl(
      faceId,
      lookup,
      LEGACY_STANDARD_EYE_PATHS.leftUpper,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    rightUpper: createControl(
      faceId,
      lookup,
      LEGACY_STANDARD_EYE_PATHS.rightUpper,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
  };

  const propsrigControls = {
    leftX: createControl(
      faceId,
      lookup,
      PROPSRIG_EYE_PATHS.leftX,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    leftY: createControl(
      faceId,
      lookup,
      PROPSRIG_EYE_PATHS.leftY,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    rightX: createControl(
      faceId,
      lookup,
      PROPSRIG_EYE_PATHS.rightX,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    rightY: createControl(
      faceId,
      lookup,
      PROPSRIG_EYE_PATHS.rightY,
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
  };

  const coupledGazeControls = {
    leftX: createControl(
      faceId,
      lookup,
      "/gaze/left_right",
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    leftY: createControl(
      faceId,
      lookup,
      "/gaze/up_down",
      inputConstraints,
      DEFAULT_GAZE_CONTROL,
    ),
    rightX:
      createControl(
        faceId,
        lookup,
        "/gaze/left_right_copy",
        inputConstraints,
        DEFAULT_GAZE_CONTROL,
      ) ??
      createControl(
        faceId,
        lookup,
        "/gaze/left_right",
        inputConstraints,
        DEFAULT_GAZE_CONTROL,
      ),
    rightY:
      createControl(
        faceId,
        lookup,
        "/gaze/up_down_copy",
        inputConstraints,
        DEFAULT_GAZE_CONTROL,
      ) ??
      createControl(
        faceId,
        lookup,
        "/gaze/up_down",
        inputConstraints,
        DEFAULT_GAZE_CONTROL,
      ),
  };

  const blinkFromLids = createControl(
    faceId,
    lookup,
    "/lids/blink",
    inputConstraints,
    DEFAULT_BLINK_CONTROL,
  );
  const blinkDirect = createControl(
    faceId,
    lookup,
    "/blink",
    inputConstraints,
    DEFAULT_BLINK_CONTROL,
  );

  if (hasAll(standardVizijControls, ["leftX", "leftY", "rightX", "rightY"])) {
    return {
      faceId,
      gazeSource: "standard-vizij",
      blinkSource: blinkFromLids ? "lids" : blinkDirect ? "blink" : "none",
      eyes: {
        leftX: standardVizijControls.leftX,
        leftY: standardVizijControls.leftY,
        rightX: standardVizijControls.rightX,
        rightY: standardVizijControls.rightY,
      },
      eyelids: {
        leftUpper: standardVizijControls.leftUpper,
        rightUpper: standardVizijControls.rightUpper,
      },
      blink: blinkFromLids ?? blinkDirect,
    };
  }

  if (hasAll(legacyStandardControls, ["leftX", "leftY", "rightX", "rightY"])) {
    return {
      faceId,
      gazeSource: "standard",
      blinkSource: blinkDirect ? "blink" : blinkFromLids ? "lids" : "none",
      eyes: {
        leftX: legacyStandardControls.leftX,
        leftY: legacyStandardControls.leftY,
        rightX: legacyStandardControls.rightX,
        rightY: legacyStandardControls.rightY,
      },
      eyelids: {
        leftUpper: legacyStandardControls.leftUpper,
        rightUpper: legacyStandardControls.rightUpper,
      },
      blink: blinkDirect ?? blinkFromLids,
    };
  }

  if (hasAll(propsrigControls, ["leftX", "leftY", "rightX", "rightY"])) {
    return {
      faceId,
      gazeSource: "propsrig",
      blinkSource: blinkDirect ? "blink" : blinkFromLids ? "lids" : "none",
      eyes: {
        leftX: propsrigControls.leftX,
        leftY: propsrigControls.leftY,
        rightX: propsrigControls.rightX,
        rightY: propsrigControls.rightY,
      },
      eyelids: {
        leftUpper: null,
        rightUpper: null,
      },
      blink: blinkDirect ?? blinkFromLids,
    };
  }

  if (hasAll(coupledGazeControls, ["leftX", "leftY", "rightX", "rightY"])) {
    return {
      faceId,
      gazeSource: "coupled-gaze",
      blinkSource: blinkFromLids ? "lids" : blinkDirect ? "blink" : "none",
      eyes: {
        leftX: coupledGazeControls.leftX,
        leftY: coupledGazeControls.leftY,
        rightX: coupledGazeControls.rightX,
        rightY: coupledGazeControls.rightY,
      },
      eyelids: {
        leftUpper: null,
        rightUpper: null,
      },
      blink: blinkFromLids ?? blinkDirect,
    };
  }

  return {
    faceId,
    gazeSource: "none",
    blinkSource: blinkFromLids ? "lids" : blinkDirect ? "blink" : "none",
    eyes: {
      leftX: null,
      leftY: null,
      rightX: null,
      rightY: null,
    },
    eyelids: {
      leftUpper: null,
      rightUpper: null,
    },
    blink: blinkFromLids ?? blinkDirect,
  };
}

export function mapNormalizedControlValue(
  control: FaceScalarControl,
  normalizedValue: number,
): number {
  const value = clamp(normalizedValue, -1, 1);
  if (value === 0) {
    return control.defaultValue;
  }
  if (value > 0) {
    return control.defaultValue + (control.max - control.defaultValue) * value;
  }
  return control.defaultValue + (control.defaultValue - control.min) * value;
}

export function mapUnitControlValue(
  control: FaceScalarControl,
  unitValue: number,
): number {
  const value = clamp(unitValue, 0, 1);
  return control.defaultValue + (control.max - control.defaultValue) * value;
}
