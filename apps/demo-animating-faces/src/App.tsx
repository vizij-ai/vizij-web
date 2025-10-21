import { useMemo, useState } from "react";
import { useOrchestrator } from "@vizij/orchestrator-react";

import { AssetLoaderPanel } from "./components/AssetLoaderPanel";
import { RigControlsPanel } from "./components/RigControlsPanel";
import { AnimationPanel } from "./components/AnimationPanel";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { useGlbLoader } from "./hooks/useGlbLoader";
import { useOrchestratorAutostep } from "./orchestrator/useOrchestratorAutostep";
import { useOrchestratorBootstrap } from "./orchestrator/useOrchestratorBootstrap";
import { useOrchestratorMerging } from "./orchestrator/useOrchestratorMerging";
import { FaceViewport } from "./renderer/FaceViewport";
import { RenderOrchestratorBridge } from "./renderer/RenderOrchestratorBridge";
import { useAppState } from "./state/AppStateContext";

const DEFAULT_NAMESPACE = "animating-faces";

export default function App() {
  const { listControllers } = useOrchestrator();
  const { state } = useAppState();
  const [namespace] = useState(DEFAULT_NAMESPACE);
  const { ready, initializing, error, start } = useOrchestratorBootstrap();
  useOrchestratorAutostep(ready);

  const glbStatus = useGlbLoader(state.glb, namespace);
  const {
    rigDefinitions,
    lowLevelDefinition,
    uiInputPaths,
    animationInputPaths,
    mergedGraphSummary,
    orchestratorError,
    warnings,
    graphConfigs,
    renderOutputPaths,
  } = useOrchestratorMerging(namespace);

  const orchestratorStatus = useMemo(() => {
    if (error) {
      return { label: "Error", description: error } as const;
    }
    if (ready) {
      return { label: "Ready", description: "Orchestrator running." } as const;
    }
    if (initializing) {
      return {
        label: "Initialising",
        description: "Creating orchestrator…",
      } as const;
    }
    return {
      label: "Idle",
      description: "Waiting to create orchestrator.",
    } as const;
  }, [error, ready, initializing]);

  const canStartOrchestrator =
    Boolean(state.glb && state.lowLevel) && !ready && !initializing;
  const startDisabledReason = !state.glb
    ? "Load a GLB file to continue."
    : !state.lowLevel
      ? "Load a low-level rig graph to continue."
      : undefined;

  const controllerCounts = useMemo(() => {
    if (!ready) {
      return null;
    }
    try {
      const controllers = listControllers?.();
      if (!controllers) {
        return null;
      }
      return {
        graphs: controllers.graphs.length,
        animations: controllers.anims.length,
      };
    } catch (err) {
      console.warn(
        "demo-animating-faces: failed to list controllers during bootstrap",
        err,
      );
      return null;
    }
  }, [ready, listControllers]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-stack">
          <h1>Animating Faces</h1>
          <p>
            Load Vizij face assets, blend high-level rigs, author animation
            clips, and inspect merged outputs in a single diagnostic workspace.
          </p>
        </div>
        <div className="status-chip">
          <span
            className={`bullet bullet-${orchestratorStatus.label.toLowerCase()}`}
          />
          <div>
            <strong>{orchestratorStatus.label}</strong>
            <div>{orchestratorStatus.description}</div>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="panel" aria-labelledby="bootstrap-panel-title">
          <header className="panel-header">
            <h2 id="bootstrap-panel-title">Bootstrap Checklist</h2>
            {!ready ? (
              <button
                type="button"
                onClick={start}
                disabled={!canStartOrchestrator}
                title={!canStartOrchestrator ? startDisabledReason : undefined}
              >
                {initializing ? "Starting…" : "Start Orchestrator"}
              </button>
            ) : null}
          </header>
          <div className="panel-body list-body">
            <ul>
              <li>
                <span className="item-label">GLB loader</span>
                <span className="item-value">
                  {glbStatus.loading
                    ? "Loading"
                    : glbStatus.ready
                      ? "Ready"
                      : "Pending"}
                </span>
              </li>
              <li>
                <span className="item-label">Orchestrator runtime</span>
                <span className="item-value">
                  {ready ? "Ready" : initializing ? "Starting" : "Idle"}
                </span>
              </li>
              <li>
                <span className="item-label">Registered controllers</span>
                <span className="item-value">
                  {controllerCounts
                    ? `${controllerCounts.graphs} graphs, ${controllerCounts.animations} animations`
                    : "None"}
                </span>
              </li>
              <li>
                <span className="item-label">Active high-level rigs</span>
                <span className="item-value">
                  {state.selectedRigIds.length}
                </span>
              </li>
            </ul>
            {error ? (
              <div className="panel-error">
                Failed to initialise orchestrator: {error}
              </div>
            ) : null}
            {!error && orchestratorError ? (
              <div className="panel-error">
                Failed to merge graphs: {orchestratorError}
              </div>
            ) : null}
          </div>
        </section>

        <FaceViewport
          namespace={namespace}
          rootId={glbStatus.rootId}
          loading={glbStatus.loading}
          error={glbStatus.error}
        />

        <AssetLoaderPanel />
        <RigControlsPanel
          rigDefinitions={rigDefinitions}
          lowLevelDefinition={lowLevelDefinition}
          orchestratorReady={ready}
        />
        <AnimationPanel
          animationInputPaths={animationInputPaths}
          rigDefinitions={rigDefinitions}
          lowLevelDefinition={lowLevelDefinition}
          orchestratorReady={ready}
        />
        <DiagnosticsPanel
          rigDefinitions={rigDefinitions}
          mergedGraphSummary={mergedGraphSummary}
          uiInputPaths={uiInputPaths}
          animationInputPaths={animationInputPaths}
          warnings={warnings}
          graphConfigs={graphConfigs}
          renderOutputPaths={renderOutputPaths}
        />
        <RenderOrchestratorBridge
          namespace={namespace}
          outputPaths={renderOutputPaths}
          enabled={ready}
        />
      </main>
    </div>
  );
}
