import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  type VizijAssetBundle,
  VizijRuntimeProvider,
  useVizijRuntime,
} from "@vizij/runtime-react";
import type { VizijBundleExtension } from "@vizij/render";
import {
  createStandardRigInputFromPath,
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import {
  useRuntimeInputDispatcher,
  type RuntimeInputDispatchPayload,
} from "../../hooks/useRuntimeInputDispatcher";
import {
  finalizeRuntimeImportPerfSession,
  markRuntimeRootAssigned,
  recordRuntimeFirstFrame,
  recordRuntimeReady,
  startRuntimeImportPerfSession,
} from "../../perf/runtimePerfMetrics";
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

function createBundleConfig(file: File): {
  bundle: VizijAssetBundle;
  glbUrl: string;
} {
  const glbUrl = URL.createObjectURL(file);
  return {
    bundle: {
      namespace: "refface",
      glb: {
        ...FACE_ASSET_GLB_BASE,
        src: glbUrl,
      },
      pose: {
        stageNeutralFilter: (_id, path) => !path.includes("/color/"),
      },
    },
    glbUrl,
  };
}

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
  const bundleConfig = useMemo(() => {
    if (!file) return null;
    return createBundleConfig(file);
  }, [file]);
  const importFingerprint = useMemo(() => {
    if (!file) {
      return null;
    }
    return JSON.stringify({
      version: "reference-runtime-v1",
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
    });
  }, [file]);

  useEffect(() => {
    return () => {
      if (bundleConfig?.glbUrl) {
        URL.revokeObjectURL(bundleConfig.glbUrl);
      }
    };
  }, [bundleConfig]);

  if (!active) {
    return <>{fallback}</>;
  }

  // Show placeholder when no file is loaded
  if (!bundleConfig) {
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
      assetBundle={bundleConfig.bundle}
      autostart={shouldAutostart}
      driveOrchestrator={shouldDriveVisible}
      orchestratorScope="shared"
    >
      <ReferenceFaceBridge
        importFingerprint={importFingerprint ?? "reference-runtime-unknown"}
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
  importFingerprint: string;
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
 * Also manages idle behavior state and renders the face with header.
 */
function ReferenceFaceBridge({
  importFingerprint,
  onStandardInputsReady,
  onLoadingStateChange,
  onAnimateValueReady,
  onStandardInputChange,
  onBundleReady,
  splitVertical,
  onToggleSplit,
}: ReferenceFaceBridgeProps) {
  const {
    firstFrameReady,
    controllableReady,
    loading,
    rootId,
    error,
    animateValue,
    step,
    inputConstraints,
    faceId,
    stepHz,
    assetBundle,
  } = useVizijRuntime();
  const animateValueRef = useRef(animateValue);
  const stepRef = useRef(step);
  const faceIdRef = useRef(faceId);
  const onStandardInputChangeRef = useRef(onStandardInputChange);
  const readyRootRef = useRef<string | null>(null);
  const firstFrameRootRef = useRef<string | null>(null);
  const completedFingerprintRef = useRef<string | null>(null);

  // Keep refs updated
  useEffect(() => {
    animateValueRef.current = animateValue;
    stepRef.current = step;
    faceIdRef.current = faceId;
    onStandardInputChangeRef.current = onStandardInputChange;
  }, [animateValue, step, faceId, onStandardInputChange]);

  useEffect(() => {
    if (!rootId) {
      return;
    }
    markRuntimeRootAssigned(rootId, undefined, "reference");
    startRuntimeImportPerfSession({
      fingerprint: importFingerprint,
      rootId,
      faceScope: "reference",
    });
  }, [importFingerprint, rootId]);

  useEffect(() => {
    return () => {
      finalizeRuntimeImportPerfSession("cancelled", "reference");
    };
  }, [importFingerprint]);

  useEffect(() => {
    if (!rootId) {
      readyRootRef.current = null;
      firstFrameRootRef.current = null;
      return;
    }
    if (!controllableReady) {
      readyRootRef.current = null;
      firstFrameRootRef.current = null;
      return;
    }
    if (readyRootRef.current !== rootId) {
      readyRootRef.current = rootId;
      recordRuntimeReady(rootId, "reference");
    }
    if (firstFrameRootRef.current === rootId) {
      return;
    }

    let cancelled = false;
    const frameHandle = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      firstFrameRootRef.current = rootId;
      recordRuntimeFirstFrame(rootId, "reference");
      if (completedFingerprintRef.current !== importFingerprint) {
        finalizeRuntimeImportPerfSession("success", "reference");
        completedFingerprintRef.current = importFingerprint;
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameHandle);
    };
  }, [controllableReady, importFingerprint, rootId]);

  useEffect(() => {
    if (!error) {
      return;
    }
    if (completedFingerprintRef.current === importFingerprint) {
      return;
    }
    finalizeRuntimeImportPerfSession("failure", "reference");
    completedFingerprintRef.current = importFingerprint;
  }, [error, importFingerprint]);

  // Discover standard inputs from inputConstraints (paths containing /standard/)
  const { standardInputs, standardInputsById, standardInputsByPath } =
    useMemo(() => {
      if (!controllableReady || !inputConstraints) {
        return {
          standardInputs: [],
          standardInputsById: new Map<string, StandardRigInput>(),
          standardInputsByPath: new Map<string, StandardRigInput>(),
        };
      }

      const available: StandardRigInput[] = [];
      const byId = new Map<string, StandardRigInput>();
      const byPath = new Map<string, StandardRigInput>();
      const seenPaths = new Set<string>();

      // Iterate over all input constraint paths and find those with /standard/
      for (const [fullPath, constraint] of Object.entries(inputConstraints)) {
        // Check if this path contains /standard/
        if (!fullPath.includes("/standard/")) {
          continue;
        }

        // Extract the /standard/... portion from the path (strips namespace prefix like "refface/")
        const standardMatch = fullPath.match(/(\/standard\/.+)$/);
        if (!standardMatch) {
          continue;
        }

        // Normalize the extracted standard path
        const normalizedPath = normalizeStandardRigInputPath(standardMatch[1]);

        // Skip if we've already processed this normalized path
        if (seenPaths.has(normalizedPath)) {
          continue;
        }
        seenPaths.add(normalizedPath);

        // Create a StandardRigInput from the path
        const input = createStandardRigInputFromPath(normalizedPath);

        // Override with constraint metadata if available
        if (constraint.min !== undefined || constraint.max !== undefined) {
          input.range = {
            min: constraint.min ?? input.range.min,
            max: constraint.max ?? input.range.max,
          };
        }
        if (constraint.defaultValue !== undefined) {
          input.defaultValue = constraint.defaultValue;
        }

        available.push(input);
        byId.set(input.id, input);
        byPath.set(input.path, input);
      }

      // Sort by group then by label for consistent ordering
      available.sort((a, b) => {
        const groupCompare = a.group.localeCompare(b.group);
        if (groupCompare !== 0) return groupCompare;
        return a.label.localeCompare(b.label);
      });

      return {
        standardInputs: available,
        standardInputsById: byId,
        standardInputsByPath: byPath,
      };
    }, [controllableReady, inputConstraints]);

  // Keep a ref of standardInputsByPath for use in callbacks
  const standardInputsByPathRef = useRef(standardInputsByPath);
  useEffect(() => {
    standardInputsByPathRef.current = standardInputsByPath;
  }, [standardInputsByPath]);

  const resolveReferenceRigPath = useCallback((inputPath: string) => {
    const currentFaceId = faceIdRef.current;
    return currentFaceId
      ? `rig/${currentFaceId}${inputPath}`
      : `rig/face${inputPath}`;
  }, []);

  const handleReferenceInputDispatched = useCallback(
    ({ rawPath, value }: RuntimeInputDispatchPayload) => {
      const input = standardInputsByPathRef.current.get(rawPath);
      if (input && onStandardInputChangeRef.current) {
        onStandardInputChangeRef.current(input.id, value);
      }
    },
    [],
  );

  const dispatchReferenceRuntimeInput = useRuntimeInputDispatcher({
    resolvePath: resolveReferenceRigPath,
    onDispatched: handleReferenceInputDispatched,
  });

  // Report loading state changes
  useEffect(() => {
    const isLoaded = controllableReady;
    const isLoading = loading || !firstFrameReady || !controllableReady;
    onLoadingStateChange?.(isLoading, isLoaded);
  }, [controllableReady, firstFrameReady, loading, onLoadingStateChange]);

  // Report bundle when ready (only once per bundle)
  const lastReportedBundleRef = useRef<typeof assetBundle.bundle | undefined>(
    undefined,
  );
  useEffect(() => {
    if (
      controllableReady &&
      assetBundle.bundle !== lastReportedBundleRef.current
    ) {
      lastReportedBundleRef.current = assetBundle.bundle;
      onBundleReady?.(assetBundle.bundle ?? null);
    }
  }, [controllableReady, assetBundle.bundle, onBundleReady]);

  // Report standard inputs when they change (and clear when none are available)
  useEffect(() => {
    if (!controllableReady) {
      onStandardInputsReady?.([], new Map());
      return;
    }
    onStandardInputsReady?.(standardInputs, standardInputsById);
  }, [
    controllableReady,
    standardInputs,
    standardInputsById,
    onStandardInputsReady,
  ]);

  // Create and report the animate function
  useEffect(() => {
    if (!controllableReady) {
      onAnimateValueReady?.(undefined);
      return;
    }

    const animateFn = (inputPath: string, value: number) => {
      // Runtime updates + propagation use the shared input bridge adapter.
      dispatchReferenceRuntimeInput(inputPath, value);
    };

    onAnimateValueReady?.(animateFn);
  }, [controllableReady, dispatchReferenceRuntimeInput, onAnimateValueReady]);

  const isLoading = loading || !firstFrameReady || !controllableReady;
  const statusText = isLoading
    ? firstFrameReady
      ? "Preparing controls…"
      : "Loading…"
    : "Ready";

  const formattedFps =
    stepHz !== undefined ? `${Math.round(stepHz)} fps` : "— fps";

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-bg-app/20">
      <header className="flex justify-between items-center px-3 py-2 border-b border-border-default/60 bg-bg-panel/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <p className="m-0 uppercase tracking-widest text-[10px] text-text-muted font-black">
            Reference Face
          </p>
          <div className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                controllableReady
                  ? "bg-green-500"
                  : isLoading
                    ? "bg-accent animate-pulse"
                    : "bg-text-muted"
              }`}
            />
            <p className="m-0 text-[10px] text-text-secondary font-bold">
              {statusText}
            </p>
          </div>
        </div>
        <div className="ref-face-viewer__controls">
          <span className="ref-face-viewer__fps">{formattedFps}</span>
          {onToggleSplit && (
            <button
              type="button"
              className="w-6 h-6 flex items-center justify-center border border-slate-700/50 rounded bg-slate-800/20 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-all text-xs cursor-pointer active:scale-90"
              title={
                splitVertical
                  ? "Switch to horizontal split"
                  : "Switch to vertical split"
              }
              onClick={onToggleSplit}
            >
              {splitVertical ? "⬌" : "⬍"}
            </button>
          )}
        </div>
      </header>
      <div className="ref-face-viewer__canvas">
        <RuntimeFaceFrame variant="fill" className="hero-face-card" />
      </div>
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
    <div className="flex flex-col w-full h-full overflow-hidden bg-bg-app/20">
      <header className="flex justify-between items-center px-3 py-2 border-b border-border-default/60 bg-bg-panel/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <p className="m-0 uppercase tracking-widest text-[10px] text-text-muted font-black">
            Reference Face
          </p>
          <p className="m-0 text-[10px] text-text-muted italic font-medium">
            No file loaded
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onToggleSplit && (
            <button
              type="button"
              className="w-6 h-6 flex items-center justify-center border border-slate-700/50 rounded bg-slate-800/20 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-all text-xs cursor-pointer active:scale-90"
              title={
                splitVertical
                  ? "Switch to horizontal split"
                  : "Switch to vertical split"
              }
              onClick={onToggleSplit}
            >
              {splitVertical ? "⬌" : "⬍"}
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 min-h-0 relative flex items-center justify-center bg-bg-app/40">
        <p className="text-text-muted text-[11px] text-center px-6 max-w-[240px] italic leading-relaxed">
          Load a reference face GLB using the sidebar to begin.
        </p>
      </div>
    </div>
  );
}
