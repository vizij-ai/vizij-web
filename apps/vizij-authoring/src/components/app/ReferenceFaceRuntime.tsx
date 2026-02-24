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
import { isPoseControlInputPath } from "../../poseRig/utils";
import { Button } from "../ui";
import { RuntimeFaceControlsOverlay } from "./RuntimeFaceControlsOverlay";
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
  const { ready, loading, setInput, inputConstraints, faceId, assetBundle } =
    useVizijRuntime();
  const setInputRef = useRef(setInput);
  const faceIdRef = useRef(faceId);
  const onStandardInputChangeRef = useRef(onStandardInputChange);

  // Keep refs updated
  useEffect(() => {
    setInputRef.current = setInput;
    faceIdRef.current = faceId;
    onStandardInputChangeRef.current = onStandardInputChange;
  }, [setInput, faceId, onStandardInputChange]);

  // Discover standard inputs from inputConstraints (paths containing /standard/)
  const { standardInputs, standardInputsById, standardInputsByPath } =
    useMemo(() => {
      if (!ready || !inputConstraints) {
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
    }, [ready, inputConstraints]);

  // Keep a ref of standardInputsByPath for use in callbacks
  const standardInputsByPathRef = useRef(standardInputsByPath);
  useEffect(() => {
    standardInputsByPathRef.current = standardInputsByPath;
  }, [standardInputsByPath]);

  const stageStandardInputPath = useCallback(
    (inputPath: string, value: number) => {
      const currentFaceId = faceIdRef.current;
      const rigPath = currentFaceId
        ? `rig/${currentFaceId}${inputPath}`
        : `rig/face${inputPath}`;

      setInputRef.current(rigPath, { float: value });

      const input = standardInputsByPathRef.current.get(inputPath);
      if (input && onStandardInputChangeRef.current) {
        onStandardInputChangeRef.current(input.id, value);
      }
    },
    [],
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
          !isPoseControlInputPath(input.path) && input.id.trim().length > 0,
      ),
    [standardInputs],
  );

  const handleResetInputs = useCallback(() => {
    resettableStandardInputs.forEach((input) => {
      const resetValue = Number.isFinite(input.defaultValue)
        ? input.defaultValue
        : 0;
      stageStandardInputPath(input.path, resetValue);
    });
  }, [resettableStandardInputs, stageStandardInputPath]);

  return (
    <div className="h-full w-full bg-bg-panel overflow-hidden">
      <RuntimeFaceFrame
        variant="fill"
        className="h-full w-full"
        overlay={
          <RuntimeFaceControlsOverlay
            onResetInputs={handleResetInputs}
            onToggleSplit={onToggleSplit}
            splitVertical={splitVertical}
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
