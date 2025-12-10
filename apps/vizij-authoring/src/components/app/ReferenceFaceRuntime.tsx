import { useEffect, useMemo, type ReactNode } from "react";
import { VizijAssetBundle, VizijRuntimeProvider, useVizijRuntime } from "@vizij/runtime-react";
import { broadcastRuntimeStatus } from "../lib/runtimeDebug";
import { HeroPassiveBehavior } from "./HeroPassiveBehavior";
import { RuntimeFaceFrame } from "./RuntimeFaceFrame";
import { FACE_ROOT_BOUNDS } from "../config/runtimeFace";

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
};

const FACE_ASSET_GLB_BASE = {
  kind: "url" as const,
  aggressiveImport: true,
  rootBounds: FACE_ROOT_BOUNDS,
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
      <HeroPassiveBehavior enabled={false} />
      <RuntimeFaceFrame
        variant="sm"
        label={label}
        className="hero-face-card"
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
