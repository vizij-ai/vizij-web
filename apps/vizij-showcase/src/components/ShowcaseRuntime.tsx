import { useEffect, useMemo, type ReactNode } from "react";
import { VizijRuntimeProvider, useVizijRuntime } from "@vizij/runtime-react";
import {
  createShowcaseBundle,
  type ShowcaseFaceAssetKey,
} from "../lib/faceAssets";
import { broadcastRuntimeStatus } from "../lib/runtimeDebug";

type ShowcaseRuntimeProps = {
  namespace: string;
  asset?: ShowcaseFaceAssetKey;
  children: ReactNode;
  active?: boolean;
  fallback?: ReactNode;
  autostart?: boolean;
  driveOrchestrator?: boolean;
  visible?: boolean;
  hiddenStepHz?: number;
  label?: string;
};

export function ShowcaseRuntime({
  namespace,
  asset = "hugoLatest",
  children,
  active = true,
  fallback = null,
  autostart = true,
  driveOrchestrator = false,
  visible = true,
  hiddenStepHz = 1,
  label,
}: ShowcaseRuntimeProps) {
  const bundle = useMemo(
    () => createShowcaseBundle(namespace, asset),
    [namespace, asset],
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
      {children}
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
