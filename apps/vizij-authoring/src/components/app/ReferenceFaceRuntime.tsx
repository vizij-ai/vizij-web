import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type VizijAssetBundle,
  VizijRuntimeProvider,
  useVizijRuntime,
} from "@vizij/runtime-react";
import type { VizijBundleExtension } from "@vizij/render";
import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import {
  isPoseControlInputPath,
  isPoseOutputInputPath,
  isPoseWeightInputPath,
} from "../../poseRig/utils";
import { Button } from "../ui";
import { RuntimeFaceControlsOverlay } from "./RuntimeFaceControlsOverlay";
import { buildRuntimeInputCatalogFromConstraints } from "./runtimeInputsFromConstraints";
import { RuntimeFaceFrame } from "./RuntimeFaceFrame";

type ReferenceFaceRuntimeProps = {
  namespace?: string;
  file?: File | null;
  active?: boolean;
  fallback?: ReactNode;
  autostart?: boolean;
  driveOrchestrator?: boolean;
  visible?: boolean;
  /** Called when standard inputs are detected from the loaded face */
  onStandardInputsReady?: (
    inputs: StandardRigInput[],
    byId: Map<string, StandardRigInput>,
  ) => void;
  /** Called when loading state changes */
  onLoadingStateChange?: (isLoading: boolean, isLoaded: boolean) => void;
  /** Called to get the animateValue function for controlling the face */
  onAnimateValueReady?: (
    animateValue: ReferenceFaceRuntimeProps["_animateValueFn"],
  ) => void;
  /** Internal type for the animate function */
  _animateValueFn?: (path: string, value: number) => void;
  /** Called when any standard input value changes on the reference face (from any source) */
  onStandardInputChange?: (inputId: string, value: number) => void;
  /** Called when the bundle extension is extracted from the loaded face */
  onBundleReady?: (bundle: VizijBundleExtension | null) => void;
  /** Whether the split is vertical */
  splitVertical?: boolean;
  /** Callback to toggle split orientation */
  onToggleSplit?: () => void;
};

const FACE_ASSET_GLB_BASE = {
  kind: "url" as const,
  aggressiveImport: true,
  // Note: rootBounds intentionally omitted to let each loaded face define its own bounds
};

interface ReferenceOverrideInputRoute {
  valuePath: string | null;
  enabledPath: string | null;
}

function normalizeGraphInputPath(path: string): string {
  return path.trim().replace(/^\/+/, "");
}

function stripRuntimeNamespacePrefix(path: string, namespace: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return trimmed;
  }
  const namespacePrefix = `${namespace}/`;
  if (trimmed.startsWith(namespacePrefix)) {
    return trimmed.slice(namespacePrefix.length);
  }
  const debugPrefix = `debug/${namespacePrefix}`;
  if (trimmed.startsWith(debugPrefix)) {
    return trimmed.slice(debugPrefix.length);
  }
  if (trimmed.startsWith("debug/")) {
    return trimmed.slice("debug/".length);
  }
  return trimmed;
}

function runtimePathCandidateScore(path: string): number {
  if (/^rig\/[^/]+\/.+/.test(path)) {
    return 3;
  }
  if (path.startsWith("rig/")) {
    return 2;
  }
  return 1;
}

function buildRuntimeWritePathMap(params: {
  inputConstraints: Record<string, unknown> | null | undefined;
  namespace: string;
  graphSpec?: unknown;
}): Map<string, string> {
  const bestByNormalized = new Map<string, { path: string; score: number }>();
  const registerPath = (rawPath: string, source: "constraints" | "graph") => {
    if (!rawPath || rawPath.trim().length === 0) {
      return;
    }
    const namespacedPath = stripRuntimeNamespacePrefix(
      rawPath,
      params.namespace,
    );
    const candidatePath = normalizeGraphInputPath(namespacedPath);
    if (!candidatePath) {
      return;
    }
    const normalizedInputPath = normalizeStandardRigInputPath(candidatePath);
    if (!normalizedInputPath || normalizedInputPath === "/custom/input") {
      return;
    }
    const score =
      runtimePathCandidateScore(candidatePath) + (source === "graph" ? 2 : 0);
    if (score <= 0) {
      return;
    }
    const existing = bestByNormalized.get(normalizedInputPath);
    if (!existing || score > existing.score) {
      bestByNormalized.set(normalizedInputPath, {
        path: candidatePath,
        score,
      });
    }
  };
  const constraints = params.inputConstraints;
  if (constraints) {
    Object.keys(constraints).forEach((rawPath) => {
      registerPath(rawPath, "constraints");
    });
  }

  const specRecord =
    params.graphSpec && typeof params.graphSpec === "object"
      ? (params.graphSpec as {
          nodes?: unknown;
        })
      : null;
  const nodes = Array.isArray(specRecord?.nodes) ? specRecord.nodes : [];
  nodes.forEach((nodeEntry) => {
    const node =
      nodeEntry && typeof nodeEntry === "object"
        ? (nodeEntry as {
            type?: unknown;
            params?: { path?: unknown };
          })
        : null;
    if (!node || node.type !== "input") {
      return;
    }
    const rawPath = node.params?.path;
    if (typeof rawPath !== "string") {
      return;
    }
    registerPath(rawPath, "graph");
  });

  const byNormalized = new Map<string, string>();
  bestByNormalized.forEach((entry, normalizedPath) => {
    byNormalized.set(normalizedPath, entry.path);
  });
  return byNormalized;
}

function buildOverrideRoutesByInputId(
  graphSpec: unknown,
): Map<string, ReferenceOverrideInputRoute> {
  const map = new Map<string, ReferenceOverrideInputRoute>();
  const specRecord =
    graphSpec && typeof graphSpec === "object"
      ? (graphSpec as { nodes?: unknown })
      : null;
  const nodes = Array.isArray(specRecord?.nodes) ? specRecord.nodes : [];

  nodes.forEach((nodeEntry) => {
    const node =
      nodeEntry && typeof nodeEntry === "object"
        ? (nodeEntry as {
            type?: unknown;
            params?: { path?: unknown };
          })
        : null;
    if (!node || node.type !== "input") {
      return;
    }

    const rawPath = node.params?.path;
    if (typeof rawPath !== "string") {
      return;
    }
    const graphPath = normalizeGraphInputPath(rawPath);
    const match = graphPath.match(
      /^rig\/[^/]+\/override\/([^/]+)\/(enabled|value)$/,
    );
    if (!match) {
      return;
    }

    const inputId = (match[1] ?? "").trim();
    const field = match[2] === "enabled" ? "enabledPath" : "valuePath";
    if (!inputId) {
      return;
    }
    const existing = map.get(inputId) ?? {
      valuePath: null,
      enabledPath: null,
    };
    existing[field] = graphPath;
    map.set(inputId, existing);
  });

  return map;
}

function createBundleConfig(glbUrl: string): VizijAssetBundle {
  return {
    namespace: "refface",
    glb: {
      ...FACE_ASSET_GLB_BASE,
      src: glbUrl,
    },
    pose: {
      stageNeutralFilter: (_id, path) => !path.includes("/color/"),
    },
  };
}

type ReferenceFaceBundleConfig = {
  file: File;
  bundle: VizijAssetBundle;
  glbUrl: string;
};

export function ReferenceFaceRuntime({
  namespace: _namespace = "refface",
  file = null,
  active = true,
  fallback = null,
  autostart = true,
  driveOrchestrator = false,
  visible = true,
  onStandardInputsReady,
  onLoadingStateChange,
  onAnimateValueReady,
  onStandardInputChange,
  onBundleReady,
  splitVertical,
  onToggleSplit,
}: ReferenceFaceRuntimeProps) {
  const [bundleConfig, setBundleConfig] =
    useState<ReferenceFaceBundleConfig | null>(null);
  useEffect(() => {
    if (!file) {
      setBundleConfig(null);
      return;
    }

    const glbUrl = URL.createObjectURL(file);
    setBundleConfig({
      file,
      bundle: createBundleConfig(glbUrl),
      glbUrl,
    });

    return () => {
      URL.revokeObjectURL(glbUrl);
    };
  }, [file]);

  const activeBundleConfig =
    file && bundleConfig?.file === file ? bundleConfig : null;

  if (!active) {
    return <>{fallback}</>;
  }

  // Show placeholder when no file is loaded
  if (!activeBundleConfig) {
    return (
      <ReferenceFacePlaceholder
        splitVertical={splitVertical}
        onToggleSplit={onToggleSplit}
      />
    );
  }

  const shouldAutostart = autostart && visible;
  const shouldDriveVisible = driveOrchestrator && visible;
  return (
    <VizijRuntimeProvider
      assetBundle={activeBundleConfig.bundle}
      autostart={shouldAutostart}
      driveOrchestrator={shouldDriveVisible}
      orchestratorScope="shared"
    >
      <ReferenceFaceBridge
        onStandardInputsReady={onStandardInputsReady}
        onLoadingStateChange={onLoadingStateChange}
        onAnimateValueReady={onAnimateValueReady}
        onStandardInputChange={onStandardInputChange}
        onBundleReady={onBundleReady}
        splitVertical={splitVertical}
        onToggleSplit={onToggleSplit}
      />
    </VizijRuntimeProvider>
  );
}

type ReferenceFaceBridgeProps = {
  onStandardInputsReady?: (
    inputs: StandardRigInput[],
    byId: Map<string, StandardRigInput>,
  ) => void;
  onLoadingStateChange?: (isLoading: boolean, isLoaded: boolean) => void;
  onAnimateValueReady?: (
    animateValue: ((path: string, value: number) => void) | undefined,
  ) => void;
  /** Called when any standard input value changes on the reference face */
  onStandardInputChange?: (inputId: string, value: number) => void;
  /** Called when the bundle extension is extracted from the loaded face */
  onBundleReady?: (bundle: VizijBundleExtension | null) => void;
  /** Whether the split is vertical */
  splitVertical?: boolean;
  /** Callback to toggle split orientation */
  onToggleSplit?: () => void;
};

/**
 * Bridge component that connects the Vizij runtime to callbacks.
 * It extracts standard inputs from the runtime and reports them to the parent.
 * Also manages idle behavior state and renders the face frame.
 */
function ReferenceFaceBridge({
  onStandardInputsReady,
  onLoadingStateChange,
  onAnimateValueReady,
  onStandardInputChange,
  onBundleReady,
  splitVertical,
  onToggleSplit,
}: ReferenceFaceBridgeProps) {
  const {
    ready,
    loading,
    setInput,
    inputConstraints,
    faceId,
    assetBundle,
    namespace,
  } = useVizijRuntime();
  const setInputRef = useRef(setInput);
  const faceIdRef = useRef(faceId);
  const onStandardInputChangeRef = useRef(onStandardInputChange);

  // Keep refs updated
  useEffect(() => {
    setInputRef.current = setInput;
    faceIdRef.current = faceId;
    onStandardInputChangeRef.current = onStandardInputChange;
  }, [setInput, faceId, onStandardInputChange]);

  // Discover runtime inputs from available constraints (standard + non-standard).
  const {
    inputs: standardInputs,
    byId: standardInputsById,
    byPath: standardInputsByPath,
  } = useMemo(
    () =>
      buildRuntimeInputCatalogFromConstraints(ready ? inputConstraints : null, {
        namespace,
      }),
    [inputConstraints, namespace, ready],
  );

  // Keep a ref of standardInputsByPath for use in callbacks
  const standardInputsByPathRef = useRef(standardInputsByPath);
  useEffect(() => {
    standardInputsByPathRef.current = standardInputsByPath;
  }, [standardInputsByPath]);

  const overrideRoutesByInputId = useMemo(
    () => buildOverrideRoutesByInputId(assetBundle.rig?.spec),
    [assetBundle.rig?.spec],
  );
  const overrideRoutesByInputIdRef = useRef(overrideRoutesByInputId);
  useEffect(() => {
    overrideRoutesByInputIdRef.current = overrideRoutesByInputId;
  }, [overrideRoutesByInputId]);
  const runtimeWritePathByNormalizedInputPath = useMemo(
    () =>
      buildRuntimeWritePathMap({
        inputConstraints: ready ? inputConstraints : null,
        namespace,
        graphSpec: assetBundle.rig?.spec,
      }),
    [assetBundle.rig?.spec, inputConstraints, namespace, ready],
  );
  const runtimeWritePathByNormalizedInputPathRef = useRef(
    runtimeWritePathByNormalizedInputPath,
  );
  useEffect(() => {
    runtimeWritePathByNormalizedInputPathRef.current =
      runtimeWritePathByNormalizedInputPath;
  }, [runtimeWritePathByNormalizedInputPath]);

  const resolveRuntimeWritePath = useCallback((inputPath: string) => {
    const normalizedPath = normalizeStandardRigInputPath(inputPath);
    if (!normalizedPath || normalizedPath === "/custom/input") {
      return null;
    }
    const mappedPath =
      runtimeWritePathByNormalizedInputPathRef.current.get(normalizedPath);
    if (mappedPath) {
      return mappedPath;
    }
    const currentFaceId = faceIdRef.current;
    return currentFaceId
      ? `rig/${currentFaceId}${normalizedPath}`
      : `rig/face${normalizedPath}`;
  }, []);

  const stageStandardInputPath = useCallback(
    (inputPath: string, value: number) => {
      const normalizedInputPath = normalizeStandardRigInputPath(inputPath);
      const input = standardInputsByPathRef.current.get(normalizedInputPath);
      if (input) {
        const overrideRoute = overrideRoutesByInputIdRef.current.get(input.id);
        const useOverrideRoute = Boolean(
          overrideRoute?.valuePath && !isPoseWeightInputPath(input.path),
        );
        if (useOverrideRoute && overrideRoute?.enabledPath) {
          setInputRef.current(overrideRoute.enabledPath, { float: 1 });
        }
        if (useOverrideRoute && overrideRoute?.valuePath) {
          setInputRef.current(overrideRoute.valuePath, { float: value });
        } else {
          const runtimePath = resolveRuntimeWritePath(normalizedInputPath);
          if (runtimePath) {
            setInputRef.current(runtimePath, { float: value });
          }
        }
        if (onStandardInputChangeRef.current) {
          onStandardInputChangeRef.current(input.id, value);
        }
        return;
      }

      const pathSuffix =
        normalizedInputPath && normalizedInputPath !== "/custom/input"
          ? normalizedInputPath
          : inputPath;
      const runtimePath = resolveRuntimeWritePath(pathSuffix);
      if (runtimePath) {
        setInputRef.current(runtimePath, { float: value });
      }
    },
    [resolveRuntimeWritePath],
  );

  // Report loading state changes
  useEffect(() => {
    onLoadingStateChange?.(loading, ready);
  }, [loading, ready, onLoadingStateChange]);

  // Report bundle when ready (only once per bundle)
  const lastReportedBundleRef = useRef<typeof assetBundle.bundle | undefined>(
    undefined,
  );
  useEffect(() => {
    if (ready && assetBundle.bundle !== lastReportedBundleRef.current) {
      lastReportedBundleRef.current = assetBundle.bundle;
      onBundleReady?.(assetBundle.bundle ?? null);
    }
  }, [ready, assetBundle.bundle, onBundleReady]);

  // Report standard inputs when they change (and clear when none are available)
  useEffect(() => {
    if (!ready) {
      onStandardInputsReady?.([], new Map());
      return;
    }
    onStandardInputsReady?.(standardInputs, standardInputsById);
  }, [ready, standardInputs, standardInputsById, onStandardInputsReady]);

  // Create and report the animate function
  useEffect(() => {
    if (!ready) {
      onAnimateValueReady?.(undefined);
      return;
    }

    const animateFn = (inputPath: string, value: number) => {
      stageStandardInputPath(inputPath, value);
    };

    onAnimateValueReady?.(animateFn);
  }, [ready, onAnimateValueReady, stageStandardInputPath]);

  const resettableStandardInputs = useMemo(
    () =>
      standardInputs.filter(
        (input) =>
          !isPoseControlInputPath(input.path) &&
          !isPoseOutputInputPath(input.path) &&
          input.id.trim().length > 0,
      ),
    [standardInputs],
  );

  const handleResetInputs = useCallback(() => {
    resettableStandardInputs.forEach((input) => {
      const resetValue = Number.isFinite(input.defaultValue)
        ? input.defaultValue
        : 0;
      const overrideRoute = overrideRoutesByInputIdRef.current.get(input.id);
      const useOverrideRoute = Boolean(
        overrideRoute?.valuePath && !isPoseWeightInputPath(input.path),
      );
      // Reset should return the channel to normal composed behavior, so clear
      // direct override enable flags before writing the default value.
      if (useOverrideRoute && overrideRoute?.enabledPath) {
        setInputRef.current(overrideRoute.enabledPath, { float: 0 });
      }
      if (useOverrideRoute && overrideRoute?.valuePath) {
        setInputRef.current(overrideRoute.valuePath, { float: resetValue });
      } else {
        const runtimePath = resolveRuntimeWritePath(input.path);
        if (runtimePath) {
          setInputRef.current(runtimePath, { float: resetValue });
        }
      }
      if (onStandardInputChangeRef.current) {
        onStandardInputChangeRef.current(input.id, resetValue);
      }
    });
  }, [resettableStandardInputs, resolveRuntimeWritePath]);

  return (
    <div
      data-testid="reference-face-runtime"
      className="h-full w-full bg-bg-panel overflow-hidden"
    >
      <RuntimeFaceFrame
        variant="fill"
        className="h-full w-full"
        overlay={
          <RuntimeFaceControlsOverlay
            onResetInputs={handleResetInputs}
            onToggleSplit={onToggleSplit}
            splitVertical={splitVertical}
            resetButtonLabel="Reset Reference Inputs"
            resetButtonTitle="Reset reference-face inputs to their default values"
            resetButtonTestId="reference-runtime-reset-inputs"
            readyFlagTestId="reference-runtime-ready-flag"
          />
        }
      />
    </div>
  );
}

type ReferenceFacePlaceholderProps = {
  splitVertical?: boolean;
  onToggleSplit?: () => void;
};

function ReferenceFacePlaceholder({
  splitVertical,
  onToggleSplit,
}: ReferenceFacePlaceholderProps) {
  return (
    <div className="h-full w-full relative bg-bg-panel overflow-hidden">
      {onToggleSplit && (
        <div className="absolute top-2 left-2 z-10">
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleSplit}
            title={
              splitVertical
                ? "Switch to horizontal split"
                : "Switch to vertical split"
            }
          >
            {splitVertical ? "⬌" : "⬍"}
          </Button>
        </div>
      )}
      <div className="flex h-full w-full items-center justify-center p-8 text-center">
        <p className="text-text-muted text-sm max-w-xs">
          Load a reference face GLB using the sidebar to begin.
        </p>
      </div>
    </div>
  );
}
