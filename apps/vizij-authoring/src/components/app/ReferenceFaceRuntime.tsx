import { useEffect, useMemo, useRef, type ReactNode } from "react";
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
  label?: string;
  /** Called when standard inputs are detected from the loaded face */
  onStandardInputsReady?: (inputs: StandardRigInput[], byId: Map<string, StandardRigInput>) => void;
  /** Called when loading state changes */
  onLoadingStateChange?: (isLoading: boolean, isLoaded: boolean) => void;
  /** Called to get the animateValue function for controlling the face */
  onAnimateValueReady?: (animateValue: ReferenceFaceRuntimeProps["_animateValueFn"]) => void;
  /** Internal type for the animate function */
  _animateValueFn?: (path: string, value: number) => void;
};

const FACE_ASSET_GLB_BASE = {
  kind: "url" as const,
  aggressiveImport: true,
  // Note: rootBounds intentionally omitted to let each loaded face define its own bounds
};

function createBundleConfig(file: File | null): VizijAssetBundle {
  return {
    namespace: "refface",
  glb: {
    ...FACE_ASSET_GLB_BASE,
    src: file ? URL.createObjectURL(file) : "/assets/Hugo_Latest_Rigged.glb",
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
  label,
  onStandardInputsReady,
  onLoadingStateChange,
  onAnimateValueReady,
}: ReferenceFaceRuntimeProps) {
  const bundle = useMemo(
    () => {
      return createBundleConfig(file);
    },
    [file],
  );

  if (!active) {
    return <>{fallback}</>;
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
        label={label}
        visible={visible}
        driver={driveOrchestrator}
        autostart={shouldAutostart}
        hiddenStepHz={hiddenStepHz}
      />
      <ReferenceFaceBridge
        onStandardInputsReady={onStandardInputsReady}
        onLoadingStateChange={onLoadingStateChange}
        onAnimateValueReady={onAnimateValueReady}
      >
        <HeroPassiveBehavior enabled={true} />
        <RuntimeFaceFrame
          variant="fill"
          label={label}
          className="hero-face-card"
          skipBounds={true}
        />
      </ReferenceFaceBridge>
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
  label?: string;
  visible: boolean;
  driver: boolean;
  autostart: boolean;
  hiddenStepHz: number;
}) {
  const { namespace, label, visible, driver, autostart, hiddenStepHz } = props;
  const { stepHz } = useVizijRuntime();

  useEffect(() => {
    broadcastRuntimeStatus({
      namespace,
      label,
      visible,
      driver,
      autostart,
      hiddenStepHz,
      stepHz,
      timestamp: Date.now(),
    });
  }, [autostart, driver, hiddenStepHz, label, namespace, visible, stepHz]);

  return null;
}

type ReferenceFaceBridgeProps = {
  children: ReactNode;
  onStandardInputsReady?: (inputs: StandardRigInput[], byId: Map<string, StandardRigInput>) => void;
  onLoadingStateChange?: (isLoading: boolean, isLoaded: boolean) => void;
  onAnimateValueReady?: (animateValue: ((path: string, value: number) => void) | undefined) => void;
};

/**
 * Bridge component that connects the Vizij runtime to callbacks.
 * It extracts standard inputs from the runtime and reports them to the parent.
 */
function ReferenceFaceBridge({
  children,
  onStandardInputsReady,
  onLoadingStateChange,
  onAnimateValueReady,
}: ReferenceFaceBridgeProps) {
  const { ready, loading, animateValue, inputConstraints, faceId } = useVizijRuntime();
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

  return <>{children}</>;
}
