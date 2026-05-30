import { useEffect, useMemo } from "react";
import {
  VizijRuntimeFace,
  VizijRuntimeProvider,
  useVizijRuntime,
} from "@vizij/runtime-react";
import { buildAssetBundleForSource, getSampleDefinition } from "./data/samples";
import { summarizeAssetBundle } from "./lib/bundleSummary";
import { useAppState } from "./state/AppStateContext";
import { SourceLibrary } from "./components/SourceLibrary";
import { AssetOverviewPanel } from "./components/AssetOverviewPanel";
import { FaceControlsPanel } from "./components/FaceControlsPanel";
import { PosePanel } from "./components/PosePanel";
import { AnimationPanel } from "./components/AnimationPanel";
import { ProgramsPanel } from "./components/ProgramsPanel";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { IconButton } from "./components/IconButton";

const ORCHESTRATOR_BACKEND = "aroraWeb" as const;

function resolveOrchestratorModule() {
  if (typeof window === "undefined") {
    return "composed" as const;
  }
  const param = new URLSearchParams(window.location.search).get("orchestrator");
  return param === "compat" || param === "compatibility"
    ? ("compatibility" as const)
    : ("composed" as const);
}

const ORCHESTRATOR_MODULE = resolveOrchestratorModule();
const ORCHESTRATOR_BACKEND_LABEL =
  ORCHESTRATOR_MODULE === "composed"
    ? "Arora web engine (composed)"
    : "Arora web engine (compatibility)";

function ViewerPanel() {
  const { loading, ready, error } = useVizijRuntime();

  return (
    <section
      className="panel viewer-panel"
      aria-labelledby="viewer-panel-title"
    >
      <header className="panel-header">
        <div>
          <p className="eyebrow">Live runtime</p>
          <h2 id="viewer-panel-title">Face stage</h2>
        </div>
      </header>
      <div className="panel-body viewer-body">
        <div className="viewer-frame">
          <VizijRuntimeFace className="viewer-canvas" showSafeArea={false} />
          {loading ? (
            <div className="viewer-overlay">Loading bundle…</div>
          ) : null}
          {!loading && !ready && !error ? (
            <div className="viewer-overlay">Preparing runtime…</div>
          ) : null}
          {error ? (
            <div className="viewer-overlay is-error">{error.message}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function WorkspaceSurface({
  sourceLabel,
  sourceMeta,
}: {
  sourceLabel: string;
  sourceMeta: string;
}) {
  const { assetBundle, loading, ready, error, controllers } = useVizijRuntime();
  const {
    state: { panels, playbackSelection },
    setSelectedAnimation,
    setSelectedProgram,
    setSelectedPoseGroup,
  } = useAppState();
  const summary = useMemo(
    () => summarizeAssetBundle(assetBundle),
    [assetBundle],
  );

  useEffect(() => {
    const firstAnimation = assetBundle.animations?.[0]?.id ?? null;
    if (
      firstAnimation &&
      !assetBundle.animations?.some(
        (animation) => animation.id === playbackSelection.animationId,
      )
    ) {
      setSelectedAnimation(firstAnimation);
    }
    if (!firstAnimation && playbackSelection.animationId) {
      setSelectedAnimation(null);
    }
  }, [
    assetBundle.animations,
    playbackSelection.animationId,
    setSelectedAnimation,
  ]);

  useEffect(() => {
    const firstProgram = assetBundle.programs?.[0]?.id ?? null;
    if (
      firstProgram &&
      !assetBundle.programs?.some(
        (program) => program.id === playbackSelection.programId,
      )
    ) {
      setSelectedProgram(firstProgram);
    }
    if (!firstProgram && playbackSelection.programId) {
      setSelectedProgram(null);
    }
  }, [assetBundle.programs, playbackSelection.programId, setSelectedProgram]);

  useEffect(() => {
    const firstGroup =
      summary.poseGroups[0]?.id ??
      (summary.poses.length > 0 ? "ungrouped" : null);
    if (
      firstGroup &&
      !summary.poseGroups.some(
        (group) => group.id === playbackSelection.poseGroupId,
      ) &&
      playbackSelection.poseGroupId !== "ungrouped"
    ) {
      setSelectedPoseGroup(firstGroup);
    }
    if (!firstGroup && playbackSelection.poseGroupId) {
      setSelectedPoseGroup(null);
    }
  }, [
    playbackSelection.poseGroupId,
    setSelectedPoseGroup,
    summary.poseGroups,
    summary.poses.length,
  ]);

  return (
    <>
      <div className="workspace-column workspace-column-center">
        <ViewerPanel />
        <div className="transport-grid">
          {panels.poses ? <PosePanel /> : null}
          {panels.animations ? <AnimationPanel /> : null}
          {panels.programs ? <ProgramsPanel /> : null}
        </div>
        {panels.controls ? <FaceControlsPanel /> : null}
      </div>
      <div className="workspace-column workspace-column-right">
        {panels.overview ? (
          <AssetOverviewPanel
            sourceLabel={sourceLabel}
            sourceMeta={sourceMeta}
            summary={summary}
            status={{ loading, ready, error, controllers }}
          />
        ) : null}
        {panels.diagnostics ? (
          <DiagnosticsPanel
            summary={summary}
            backendLabel={ORCHESTRATOR_BACKEND_LABEL}
          />
        ) : null}
      </div>
    </>
  );
}

function LandingPanel() {
  return (
    <section className="panel landing-panel" aria-labelledby="landing-title">
      <header className="panel-header panel-header-stack">
        <div>
          <p className="eyebrow">Bundle showcase</p>
          <h2 id="landing-title">Load a face bundle to begin</h2>
        </div>
      </header>
      <div className="panel-body landing-body">
        <p>
          `demo-vizij-player` now orients around one GLB at a time. Each curated
          sample or uploaded export is treated as a self-describing bundle with
          embedded rigs, pose data, clips, and procedural programs when present.
        </p>
        <div className="landing-feature-grid">
          <article>
            <strong>Single-asset runtime</strong>
            <p>
              No separate graph or clip imports. The face declares its own
              structure.
            </p>
          </article>
          <article>
            <strong>Showcase panels</strong>
            <p>
              Controls, poses, animations, programs, and diagnostics stay
              aligned to the loaded bundle.
            </p>
          </article>
          <article>
            <strong>Curated sample</strong>
            <p>
              Quori covers the rich authored bundle we want to showcase right
              now.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const {
    state: { source, theme },
    selectSample,
    selectUpload,
    clearSource,
    toggleTheme,
  } = useAppState();

  const selectedSample =
    source?.kind === "sample" ? getSampleDefinition(source.id) : null;
  const sourceLabel =
    selectedSample?.label ??
    (source?.kind === "upload" ? source.label : "Uploaded bundle");
  const sourceMeta =
    selectedSample?.description ??
    (source?.kind === "upload" ? source.fileName : "Local GLB upload");
  const assetBundle = useMemo(
    () => (source ? buildAssetBundleForSource(source) : null),
    [source],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-row">
          <div className="header-copy">
            <p className="eyebrow">Vizij runtime demo</p>
            <h1>demo-vizij-player</h1>
            <p>
              A bundle-first showcase for the new face exports. Load one asset,
              inspect the structure it embeds, and drive its authored poses,
              clips, and procedural programs from one runtime surface.
            </p>
          </div>
          <div className="header-actions">
            <IconButton
              icon={theme === "dark" ? "moon" : "sun"}
              label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              className="theme-toggle"
              onClick={toggleTheme}
            />
          </div>
        </div>
      </header>

      <main className={`app-main ${assetBundle ? "app-main--workspace" : ""}`}>
        <SourceLibrary
          selectedSource={source}
          onSelectSample={selectSample}
          onUpload={selectUpload}
          onClearSource={clearSource}
        />
        {assetBundle ? (
          <VizijRuntimeProvider
            key={source!.id}
            assetBundle={assetBundle}
            autostart
            orchestratorScope="isolated"
            orchestratorBackend={ORCHESTRATOR_BACKEND}
            orchestratorInitInput={{ orchestratorModule: ORCHESTRATOR_MODULE }}
          >
            <WorkspaceSurface
              sourceLabel={sourceLabel}
              sourceMeta={sourceMeta}
            />
          </VizijRuntimeProvider>
        ) : (
          <LandingPanel />
        )}
      </main>
    </div>
  );
}
