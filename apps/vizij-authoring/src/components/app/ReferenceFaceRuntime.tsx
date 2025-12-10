import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { VizijAssetBundle, VizijRuntimeProvider, useVizijRuntime } from "@vizij/runtime-react";
import { broadcastRuntimeStatus } from "../lib/runtimeDebug";
import { HeroPassiveBehavior } from "./HeroPassiveBehavior";
import { RuntimeFaceFrame } from "./RuntimeFaceFrame";
import { STANDARD_RIG_INPUTS, type StandardRigInput } from "@vizij/utils";

type ReferenceFaceRuntimeProps = {
  namespace?: string;
  file?: File | null;
  active?: boolean;
  fallback?: ReactNode;
  autostart?: boolean;
  driveOrchestrator?: boolean;
  visible?: boolean;
  hiddenStepHz?: number;
  /** Called when standard inputs are detected from the loaded face */
  onStandardInputsReady?: (inputs: StandardRigInput[], byId: Map<string, StandardRigInput>) => void;
  /** Called when loading state changes */
  onLoadingStateChange?: (isLoading: boolean, isLoaded: boolean) => void;
  /** Called to get the animateValue function for controlling the face */
  onAnimateValueReady?: (animateValue: ReferenceFaceRuntimeProps["_animateValueFn"]) => void;
  /** Internal type for the animate function */
  _animateValueFn?: (path: string, value: number) => void;
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

function createBundleConfig(file: File): VizijAssetBundle {
  return {
    namespace: "refface",
    glb: {
      ...FACE_ASSET_GLB_BASE,
      src: URL.createObjectURL(file),
    },
    pose: {
      stageNeutralFilter: (_id, path) => !path.includes("/color/"),
    },
  };
}

export function ReferenceFaceRuntime({
  namespace = "refface",
  file = null,
  active = true,
  fallback = null,
  autostart = true,
  driveOrchestrator = false,
  visible = true,
  hiddenStepHz = 1,
  onStandardInputsReady,
  onLoadingStateChange,
  onAnimateValueReady,
  splitVertical,
  onToggleSplit,
}: ReferenceFaceRuntimeProps) {
  const bundle = useMemo(
    () => {
      if (!file) return null;
      return createBundleConfig(file);
    },
    [file],
  );

  if (!active) {
    return <>{fallback}</>;
  }

  // Show placeholder when no file is loaded
  if (!bundle) {
    return (
      <ReferenceFacePlaceholder
        splitVertical={splitVertical}
        onToggleSplit={onToggleSplit}
      />
    );
  }

  const shouldAutostart = autostart && visible;
  const shouldDriveVisible = driveOrchestrator && visible;
  const shouldDriveHidden = driveOrchestrator && !visible && hiddenStepHz > 0;

  return (
    <VizijRuntimeProvider
      assetBundle={bundle}
      autostart={shouldAutostart}
      driveOrchestrator={shouldDriveVisible}
      orchestratorScope="shared"
    >
      <HiddenStepController enabled={shouldDriveHidden} hz={hiddenStepHz} />
      <RuntimeDebugBeacon
        namespace={namespace}
        visible={visible}
        driver={driveOrchestrator}
        autostart={shouldAutostart}
        hiddenStepHz={hiddenStepHz}
      />
      <ReferenceFaceBridge
        onStandardInputsReady={onStandardInputsReady}
        onLoadingStateChange={onLoadingStateChange}
        onAnimateValueReady={onAnimateValueReady}
        splitVertical={splitVertical}
        onToggleSplit={onToggleSplit}
      />
    </VizijRuntimeProvider>
  );
}

function HiddenStepController({
  enabled,
  hz,
}: {
  enabled: boolean;
  hz: number;
}) {
  const { step, ready } = useVizijRuntime();

  useEffect(() => {
    if (!enabled || !ready || hz <= 0) {
      return;
    }
    const intervalMs = 1000 / hz;
    const id = window.setInterval(() => {
      step(1 / hz, { forceRuntime: true });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, hz, ready, step]);

  return null;
}

function RuntimeDebugBeacon(props: {
  namespace: string;
  visible: boolean;
  driver: boolean;
  autostart: boolean;
  hiddenStepHz: number;
}) {
  const { namespace, visible, driver, autostart, hiddenStepHz } = props;
  const { stepHz } = useVizijRuntime();

  useEffect(() => {
    broadcastRuntimeStatus({
      namespace,
      label: "Reference Face",
      visible,
      driver,
      autostart,
      hiddenStepHz,
      stepHz,
      timestamp: Date.now(),
    });
  }, [autostart, driver, hiddenStepHz, namespace, visible, stepHz]);

  return null;
}

type ReferenceFaceBridgeProps = {
  onStandardInputsReady?: (inputs: StandardRigInput[], byId: Map<string, StandardRigInput>) => void;
  onLoadingStateChange?: (isLoading: boolean, isLoaded: boolean) => void;
  onAnimateValueReady?: (animateValue: ((path: string, value: number) => void) | undefined) => void;
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
  onStandardInputsReady,
  onLoadingStateChange,
  onAnimateValueReady,
  splitVertical,
  onToggleSplit,
}: ReferenceFaceBridgeProps) {
  const { ready, loading, animateValue, inputConstraints, faceId, stepHz } = useVizijRuntime();
  const [idleBehaviorEnabled, setIdleBehaviorEnabled] = useState(true);
  const animateValueRef = useRef(animateValue);
  const faceIdRef = useRef(faceId);

  // Keep refs updated
  useEffect(() => {
    animateValueRef.current = animateValue;
    faceIdRef.current = faceId;
  }, [animateValue, faceId]);

  // Extract standard inputs that are available in the loaded face
  const { standardInputs, standardInputsById } = useMemo(() => {
    if (!ready || !inputConstraints) {
      return { standardInputs: [], standardInputsById: new Map<string, StandardRigInput>() };
    }

    // Build a set of available paths from inputConstraints
    const availablePaths = new Set(Object.keys(inputConstraints));

    // Filter STANDARD_RIG_INPUTS to only include those available in the runtime
    const available: StandardRigInput[] = [];
    const byId = new Map<string, StandardRigInput>();

    for (const input of STANDARD_RIG_INPUTS) {
      // The runtime paths are prefixed with rig/<faceId>/
      // Check if any path ends with the standard input path
      const matchingPath = Array.from(availablePaths).find(
        (path) => path.endsWith(input.path) || path.includes(`/${input.path.slice(1)}`)
      );

      if (matchingPath) {
        available.push(input);
        byId.set(input.id, input);
      }
    }

    return { standardInputs: available, standardInputsById: byId };
  }, [ready, inputConstraints]);

  // Report loading state changes
  useEffect(() => {
    onLoadingStateChange?.(loading, ready);
  }, [loading, ready, onLoadingStateChange]);

  // Report standard inputs when they change
  useEffect(() => {
    if (standardInputs.length > 0) {
      onStandardInputsReady?.(standardInputs, standardInputsById);
    }
  }, [standardInputs, standardInputsById, onStandardInputsReady]);

  // Create and report the animate function
  useEffect(() => {
    if (!ready) {
      onAnimateValueReady?.(undefined);
      return;
    }

    const animateFn = (inputPath: string, value: number) => {
      // Build the full rig path
      const currentFaceId = faceIdRef.current;
      const rigPath = currentFaceId ? `rig/${currentFaceId}${inputPath}` : `rig/face${inputPath}`;

      animateValueRef.current(rigPath, value, {
        duration: 100,
        easing: "easeOut",
      }).catch((err) => {
        console.error(`[ReferenceFaceBridge] Failed to animate ${rigPath}:`, err);
      });
    };

    onAnimateValueReady?.(animateFn);
  }, [ready, onAnimateValueReady]);

  const formattedFps = stepHz !== undefined ? `${Math.round(stepHz)} fps` : "— fps";

  return (
    <div className="ref-face-viewer">
      <header className="ref-face-viewer__header">
        <div className="ref-face-viewer__title-group">
          <p className="ref-face-viewer__eyebrow">Reference Face</p>
          <p className="ref-face-viewer__status">
            {loading ? "Loading…" : ready ? "Ready" : "Waiting…"}
          </p>
        </div>
        <div className="ref-face-viewer__controls">
          <span className="ref-face-viewer__fps">{formattedFps}</span>
          <button
            type="button"
            className={`ref-face-viewer__idle-btn ${idleBehaviorEnabled ? "ref-face-viewer__idle-btn--active" : ""}`}
            onClick={() => setIdleBehaviorEnabled((prev) => !prev)}
            title={idleBehaviorEnabled ? "Disable idle behaviors" : "Enable idle behaviors"}
          >
            {idleBehaviorEnabled ? "Idle: ON" : "Idle: OFF"}
          </button>
          {onToggleSplit && (
            <button
              type="button"
              className="ref-face-viewer__split-btn"
              title={splitVertical ? "Switch to horizontal split" : "Switch to vertical split"}
              onClick={onToggleSplit}
            >
              {splitVertical ? "⬌" : "⬍"}
            </button>
          )}
        </div>
      </header>
      <div className="ref-face-viewer__canvas">
        <HeroPassiveBehavior enabled={idleBehaviorEnabled} />
        <RuntimeFaceFrame
          variant="fill"
          className="hero-face-card"
          skipBounds={true}
        />
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
    <div className="ref-face-viewer">
      <header className="ref-face-viewer__header">
        <div className="ref-face-viewer__title-group">
          <p className="ref-face-viewer__eyebrow">Reference Face</p>
          <p className="ref-face-viewer__status">No file loaded</p>
        </div>
        <div className="ref-face-viewer__controls">
          {onToggleSplit && (
            <button
              type="button"
              className="ref-face-viewer__split-btn"
              title={splitVertical ? "Switch to horizontal split" : "Switch to vertical split"}
              onClick={onToggleSplit}
            >
              {splitVertical ? "⬌" : "⬍"}
            </button>
          )}
        </div>
      </header>
      <div className="ref-face-viewer__canvas ref-face-viewer__canvas--empty">
        <p className="ref-face-viewer__placeholder-text">
          Load a reference face GLB using the sidebar to begin.
        </p>
      </div>
    </div>
  );
}
