import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { ActiveValuesPanel } from "./components/ActiveValuesPanel";
import { AnimatableInspector } from "./components/AnimatableInspector";
import { ControlsToolbar } from "./components/ControlsToolbar";
import { FaceViewer } from "./components/FaceViewer";
import { OrchestratorPanel } from "./components/OrchestratorPanel";
import { AnimationEditor } from "./components/AnimationEditor";
import { GraphEditor } from "./components/GraphEditor";
import { useFaceLoader } from "./hooks/useFaceLoader";
import { useAnimatableList } from "./hooks/useAnimatableList";
import { useNodeRegistry } from "./hooks/useNodeRegistry";
import { buildRigGraph } from "./rig/rigGraphGenerator";
import {
  DEFAULT_ANIMATION_STATE,
  DEFAULT_GRAPH_STATE,
} from "./orchestratorDefaults";
import {
  buildAnimatableOptions,
  updateTracksForSelectedAnim,
} from "./utils/animatableOptions";
import type {
  AnimationEditorState,
  GraphEditorState,
  OrchestratorAnimatableOption,
} from "./types";
import { FACES, DEFAULT_FACE_ID, getFaceById } from "./data/faces";

export default function App() {
  const [selectedFaceId, setSelectedFaceId] = useState(DEFAULT_FACE_ID);
  const [namespace, setNamespace] = useState("default");
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [animationState, setAnimationState] = useState<AnimationEditorState>(
    () => structuredClone(DEFAULT_ANIMATION_STATE),
  );
  const [graphState, setGraphState] = useState<GraphEditorState>(() =>
    structuredClone(DEFAULT_GRAPH_STATE),
  );
  const [rigOutputMap, setRigOutputMap] = useState<Record<string, string> | null>(
    null,
  );
  const animationImportRef = useRef<HTMLInputElement | null>(null);
  const graphImportRef = useRef<HTMLInputElement | null>(null);
  const lastRigSignatureRef = useRef<string | null>(null);

  const face = useMemo(
    () => getFaceById(selectedFaceId) ?? FACES[0],
    [selectedFaceId],
  );
  const loader = useFaceLoader(face, namespace);
  const animatableList = useAnimatableList(namespace, "");
  const {
    registry,
    loading: registryLoading,
    error: registryError,
  } = useNodeRegistry();

  const animatableOptions = useMemo<OrchestratorAnimatableOption[]>(
    () => buildAnimatableOptions(animatableList.groups),
    [animatableList.groups],
  );

  const rigGraph = useMemo(() => {
    if (!face?.rig || !loader.ready) {
      return null;
    }
    return buildRigGraph(face.id, face.rig, animatableList.groups);
  }, [face, loader.ready, animatableList.groups]);

  useEffect(() => {
    if (!face?.rig) {
      lastRigSignatureRef.current = null;
      setRigOutputMap(null);
      setGraphState(structuredClone(DEFAULT_GRAPH_STATE));
      return;
    }

    if (!rigGraph) {
      return;
    }

    const signature = JSON.stringify(rigGraph.outputNodeToAnimId);
    if (lastRigSignatureRef.current === signature) {
      return;
    }

    lastRigSignatureRef.current = signature;
    setRigOutputMap(rigGraph.outputNodeToAnimId);
    setGraphState(structuredClone(rigGraph.graph));
  }, [face, rigGraph]);

  useEffect(() => {
    setAnimationState((prev) =>
      updateTracksForSelectedAnim(prev, animatableOptions),
    );
  }, [animatableOptions]);

  const downloadJSON = (filename: string, payload: unknown) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAnimation = () => {
    downloadJSON("eye-roll-animation.json", animationState);
  };

  const handleExportGraph = () => {
    downloadJSON("eye-roll-graph.json", graphState);
  };

  const handleImportAnimation = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid animation file.");
      }
      const nextState = parsed as AnimationEditorState;
      setAnimationState(
        updateTracksForSelectedAnim(
          structuredClone(nextState),
          animatableOptions,
        ),
      );
    } catch (err) {
      console.error("demo-render-no-rig: failed to import animation", err);
      alert(`Failed to import animation: ${(err as Error).message}`);
    }
  };

  const handleImportGraph = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid graph file.");
      }
      const nextState = parsed as GraphEditorState;
      setGraphState(structuredClone(nextState));
    } catch (err) {
      console.error("demo-render-no-rig: failed to import graph", err);
      alert(`Failed to import graph: ${(err as Error).message}`);
    }
  };

  const onAnimationFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleImportAnimation(file);
    event.target.value = "";
  };

  const onGraphFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleImportGraph(file);
    event.target.value = "";
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-text">
          <h1>Vizij Renderer — No-Rig Demo</h1>
          <p>
            Choose a face, inspect the animatables generated by the Vizij render
            pipeline, and adjust values directly without a rig layer. This view
            now includes inline authoring for animations and node graphs that
            feed the orchestrator.
          </p>
        </div>
      </header>

      <ControlsToolbar
        faces={FACES}
        selectedFaceId={selectedFaceId}
        onSelectFace={setSelectedFaceId}
        namespace={namespace}
        onNamespaceChange={setNamespace}
        showSafeArea={showSafeArea}
        onToggleSafeArea={setShowSafeArea}
      />

      <main className="app-main">
        <FaceViewer
          rootId={loader.rootId}
          ready={loader.ready}
          loading={loader.loading}
          error={loader.error}
          namespace={namespace}
          showSafeArea={showSafeArea}
        />
        <AnimatableInspector namespace={namespace} />
      </main>
      <section className="diagnostics">
        <div className="panel">
          <div className="panel-header">
            <h2>Status</h2>
          </div>
          <div className="panel-body status-grid">
            <div>
              <span className="label">Face</span>
              <span>{face?.name ?? "Unknown"}</span>
            </div>
            <div>
              <span className="label">Loader</span>
              <span>
                {loader.loading
                  ? "Loading"
                  : loader.ready
                    ? "Ready"
                    : loader.error
                      ? "Error"
                      : "Idle"}
              </span>
            </div>
            <div>
              <span className="label">Root ID</span>
              <span>{loader.rootId ?? "–"}</span>
            </div>
            <div>
              <span className="label">Error</span>
              <span>{loader.error ?? "–"}</span>
            </div>
          </div>
        </div>
        <ActiveValuesPanel namespace={namespace} />
      </section>

      <OrchestratorPanel
        namespace={namespace}
        animatables={animatableOptions}
        animationState={animationState}
        graphState={graphState}
        initialOutputMap={rigOutputMap}
      />
      <input
        ref={animationImportRef}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={onAnimationFileChange}
      />
      <input
        ref={graphImportRef}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={onGraphFileChange}
      />
      <section className="authoring-grid">
        <AnimationEditor
          value={animationState}
          onChange={setAnimationState}
          animatableOptions={animatableOptions}
        />
        <GraphEditor
          value={graphState}
          onChange={setGraphState}
          registry={registry}
          loading={registryLoading}
          error={registryError}
        />
      </section>

      <section className="authoring-actions">
        <div className="export-actions">
          <h3>Animation</h3>
          <div className="action-row">
            <button
              type="button"
              className="btn btn-muted"
              onClick={handleExportAnimation}
            >
              Export animation JSON
            </button>
            <button
              type="button"
              className="btn btn-muted"
              onClick={() => animationImportRef.current?.click()}
            >
              Import animation JSON
            </button>
          </div>
        </div>
        <div className="export-actions">
          <h3>Graph</h3>
          <div className="action-row">
            <button
              type="button"
              className="btn btn-muted"
              onClick={handleExportGraph}
            >
              Export graph JSON
            </button>
            <button
              type="button"
              className="btn btn-muted"
              onClick={() => graphImportRef.current?.click()}
            >
              Import graph JSON
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
