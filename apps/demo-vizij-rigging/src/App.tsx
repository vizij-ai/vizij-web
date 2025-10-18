import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadGLTF,
  loadGLTFFromBlob,
  useVizijStore,
  useVizijStoreSetter,
  type Group,
  type World,
} from "@vizij/render";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import {
  useGraphInstance,
  valueAsColorRgba,
  valueAsNumber,
  valueAsVector,
  type GraphSpec,
  type ValueJSON,
  type WriteOpJSON,
} from "@vizij/node-graph-react";

import { FACES, getFaceById } from "./data/faces";
import {
  STANDARD_RIG_INPUTS,
  STANDARD_RIG_INPUTS_BY_ID,
} from "./low-level/standardRigInputs";
import {
  clampToInputRange,
  computeAppliedInputs,
  computePoseDelta,
  createNeutralInputs,
  ensureNeutralDefaults,
  computeStandardInputsFromPaths,
} from "./rigging/utils";
import { buildEmotionGraphSpec } from "./rigging/graphBuilder";
import { buildRigConfig, parseRigConfig } from "./rigging/persistence";
import type {
  EmotionDefinition,
  EmotionWeightMap,
  GraphGenerationSummary,
  RigConfigFile,
  StandardInputId,
} from "./rigging/types";
import { FaceLoaderPanel } from "./components/FaceLoaderPanel";
import { FaceViewer } from "./components/FaceViewer";
import { LowLevelInputsPanel } from "./components/LowLevelInputsPanel";
import { EmotionList } from "./components/EmotionList";
import { EmotionEditor } from "./components/EmotionEditor";
import { EmotionMixer } from "./components/EmotionMixer";
import { GraphSummaryPanel } from "./components/GraphSummaryPanel";

const DEFAULT_NAMESPACE = "default";

interface LoaderStatus {
  loading: boolean;
  ready: boolean;
  error?: string | null;
  assetName?: string | null;
}

const INITIAL_LOADER_STATUS: LoaderStatus = {
  loading: false,
  ready: false,
  error: null,
  assetName: null,
};

const STANDARD_INPUTS_BY_PATH = new Map(
  STANDARD_RIG_INPUTS.map((input) => [input.path, input]),
);

function findRootId(world: World): string | undefined {
  const rootEntry = Object.values(world).find(
    (entry) => entry.type === "group" && (entry as Group).rootBounds,
  ) as Group | undefined;
  return rootEntry?.id;
}

function stripNamespaceValues(
  namespace: string,
  values: Map<string, RawValue | undefined>,
): Map<string, RawValue | undefined> {
  if (!values.size) {
    return new Map(values);
  }
  const next = new Map(values);
  for (const key of next.keys()) {
    if (key.startsWith(`${namespace}:`)) {
      next.delete(key);
    }
  }
  return next;
}

function sanitizeFaceId(value: string): string {
  const normalised = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalised || "face";
}

function normaliseAssetLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return "asset";
  }
  const withoutParams = trimmed.split(/[?#]/, 1)[0];
  const withForwardSlashes = withoutParams.replace(/\\/g, "/");
  const segments = withForwardSlashes.split("/");
  const last = segments[segments.length - 1] ?? trimmed;
  const withoutExtension = last.replace(/\.[^.]+$/, "");
  return withoutExtension || last;
}

function deriveFaceIdFromSource(
  sourceName: string | null,
  rootRenderable: Group | undefined,
): string {
  if (sourceName) {
    const normalised = normaliseAssetLabel(sourceName);
    if (normalised) {
      return sanitizeFaceId(normalised);
    }
  }
  if (rootRenderable?.name) {
    return sanitizeFaceId(rootRenderable.name);
  }
  if (rootRenderable?.id) {
    return sanitizeFaceId(rootRenderable.id);
  }
  return "face";
}

function createEmotion(name: string): EmotionDefinition {
  const now = new Date().toISOString();
  return {
    id: `emotion_${Math.random().toString(36).slice(2, 10)}`,
    name,
    description: "",
    values: {},
    createdAt: now,
    updatedAt: now,
  };
}

function updateEmotion(
  emotion: EmotionDefinition,
  updates: Partial<EmotionDefinition>,
): EmotionDefinition {
  return {
    ...emotion,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}

function downloadJSON(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function App(): JSX.Element {
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(
    FACES[0]?.id ?? null,
  );
  const [activeFaceId, setActiveFaceId] = useState<string | null>(
    FACES[0]?.id ?? null,
  );
  const [rootId, setRootId] = useState<string | null>(null);
  const [loaderStatus, setLoaderStatus] = useState<LoaderStatus>(
    INITIAL_LOADER_STATUS,
  );
  const [lowLevelGraphSpec, setLowLevelGraphSpec] = useState<GraphSpec | null>(
    null,
  );
  const [lowLevelGraphError, setLowLevelGraphError] = useState<string | null>(
    null,
  );
  const [graphLoaded, setGraphLoaded] = useState(false);
  const [neutralInputs, setNeutralInputs] =
    useState<Record<StandardInputId, number>>(createNeutralInputs);
  const [emotions, setEmotions] = useState<EmotionDefinition[]>([]);
  const [selectedEmotionId, setSelectedEmotionId] = useState<string | null>(
    null,
  );
  const [emotionWeights, setEmotionWeights] = useState<EmotionWeightMap>({});
  const [graphSummary, setGraphSummary] =
    useState<GraphGenerationSummary | null>(null);
  const [graphSpec, setGraphSpec] = useState<GraphSpec | null>(null);
  const [configFile, setConfigFile] = useState<RigConfigFile | null>(null);

  const setStoreState = useVizijStoreSetter();
  const addWorldElements = useVizijStore((state) => state.addWorldElements);
  const setValue = useVizijStore((state) => state.setValue);
  const animatables = useVizijStore((state) => state.animatables);

  const {
    loadGraph: loadLowLevelGraph,
    unloadGraph: unloadLowLevelGraph,
    evalAll: evalLowLevelGraph,
    stageInput: stageLowLevelInput,
    clearStaged: clearLowLevelStaged,
  } = useGraphInstance(undefined, { autoEval: false });

  const lowLevelInputNodes = useMemo(() => {
    if (
      !lowLevelGraphSpec ||
      !Array.isArray((lowLevelGraphSpec as any).nodes)
    ) {
      return [] as Array<{ path: string; defaultValue?: ValueJSON }>;
    }
    return ((lowLevelGraphSpec as any).nodes as Array<any>)
      .filter(
        (node) =>
          node &&
          node.type === "input" &&
          node.params &&
          typeof node.params.path === "string",
      )
      .map((node) => ({
        path: node.params.path as string,
        defaultValue: node.params?.value as ValueJSON | undefined,
      }));
  }, [lowLevelGraphSpec]);

  const lowLevelFaceId = useMemo(() => {
    for (const node of lowLevelInputNodes) {
      if (typeof node.path === "string" && node.path.startsWith("rig/")) {
        const segments = node.path.split("/");
        if (segments.length >= 3) {
          return segments[1];
        }
      }
    }
    return null;
  }, [lowLevelInputNodes]);

  const availableStandardInputs = useMemo(() => {
    const paths: string[] = [];
    lowLevelInputNodes.forEach((node) => {
      if (typeof node.path === "string" && node.path.startsWith("rig/")) {
        const segments = node.path.split("/");
        if (segments.length >= 3) {
          paths.push(`/${segments.slice(2).join("/")}`);
        }
      }
    });
    const recognized = computeStandardInputsFromPaths(paths);
    return recognized.length ? recognized : STANDARD_RIG_INPUTS;
  }, [lowLevelInputNodes]);

  const bindingCounts = useMemo(() => {
    const counts = new Map<StandardInputId, number>();
    availableStandardInputs.forEach((input) => {
      counts.set(input.id, 1);
    });
    return counts;
  }, [availableStandardInputs]);

  useEffect(() => {
    let cancelled = false;
    async function loadGraph(spec: GraphSpec | null) {
      if (!loadLowLevelGraph || !unloadLowLevelGraph) {
        return;
      }
      if (!spec) {
        unloadLowLevelGraph();
        if (!cancelled) {
          setGraphLoaded(false);
          setLowLevelGraphError(null);
        }
        return;
      }
      try {
        if (!cancelled) {
          setGraphLoaded(false);
          setLowLevelGraphError(null);
        }
        await loadLowLevelGraph(spec);
        if (!cancelled) {
          setGraphLoaded(true);
          setLowLevelGraphError(null);
        }
      } catch (err) {
        console.error(
          "demo-vizij-rigging: failed to load low-level graph",
          err,
        );
        unloadLowLevelGraph();
        if (!cancelled) {
          setGraphLoaded(false);
          setLowLevelGraphError(
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }
    void loadGraph(lowLevelGraphSpec);
    return () => {
      cancelled = true;
      if (clearLowLevelStaged) {
        clearLowLevelStaged();
      }
      if (unloadLowLevelGraph) {
        unloadLowLevelGraph();
      }
    };
  }, [
    clearLowLevelStaged,
    loadLowLevelGraph,
    lowLevelGraphSpec,
    unloadLowLevelGraph,
  ]);

  useEffect(() => {
    setNeutralInputs((prev) =>
      ensureNeutralDefaults(prev, availableStandardInputs),
    );
  }, [availableStandardInputs]);

  const appliedInputs = useMemo(
    () =>
      computeAppliedInputs(
        availableStandardInputs,
        neutralInputs,
        emotions,
        emotionWeights,
      ),
    [availableStandardInputs, neutralInputs, emotions, emotionWeights],
  );

  const convertValueJSONToRaw = useCallback(
    (
      animatable: AnimatableValue | undefined,
      value: ValueJSON | undefined,
    ): RawValue | undefined => {
      if (!animatable) {
        return undefined;
      }
      switch (animatable.type) {
        case "number": {
          const num = valueAsNumber(value);
          if (typeof num === "number" && Number.isFinite(num)) {
            return num;
          }
          break;
        }
        case "vector2": {
          const vec = valueAsVector(value);
          if (vec && vec.length >= 2) {
            return {
              x: Number(vec[0] ?? 0),
              y: Number(vec[1] ?? 0),
            };
          }
          break;
        }
        case "vector3":
        case "euler": {
          const vec = valueAsVector(value);
          if (vec && vec.length >= 3) {
            return {
              x: Number(vec[0] ?? 0),
              y: Number(vec[1] ?? 0),
              z: Number(vec[2] ?? 0),
            };
          }
          break;
        }
        case "rgb": {
          const color = valueAsColorRgba(value);
          if (Array.isArray(color)) {
            const [r = 0, g = 0, b = 0] = color;
            return {
              r: Number(r ?? 0),
              g: Number(g ?? 0),
              b: Number(b ?? 0),
            };
          }
          const vec = valueAsVector(value);
          if (vec && vec.length >= 3) {
            return {
              r: Number(vec[0] ?? 0),
              g: Number(vec[1] ?? 0),
              b: Number(vec[2] ?? 0),
            };
          }
          break;
        }
        default:
          break;
      }
      const fallback = animatable.default as RawValue;
      if (fallback && typeof fallback === "object") {
        return JSON.parse(JSON.stringify(fallback)) as RawValue;
      }
      return fallback;
    },
    [],
  );

  useEffect(() => {
    if (
      !loaderStatus.ready ||
      !graphLoaded ||
      !lowLevelGraphSpec ||
      !stageLowLevelInput ||
      !evalLowLevelGraph
    ) {
      return;
    }

    if (clearLowLevelStaged) {
      clearLowLevelStaged();
    }

    lowLevelInputNodes.forEach((node) => {
      const { path } = node;
      let stagedValue: ValueJSON | undefined = node.defaultValue;

      if (typeof path === "string" && path.startsWith("rig/")) {
        const segments = path.split("/");
        if (segments.length >= 3) {
          const standardPath = `/${segments.slice(2).join("/")}`;
          const standardInput = STANDARD_INPUTS_BY_PATH.get(standardPath);
          if (standardInput) {
            const nextValue =
              appliedInputs[standardInput.id] ??
              neutralInputs[standardInput.id] ??
              standardInput.defaultValue;
            stagedValue = { float: nextValue };
          }
        }
      }

      if (!stagedValue) {
        stagedValue = { float: 0 };
      }

      stageLowLevelInput(path, stagedValue);
    });

    const result = evalLowLevelGraph();
    if (!result) {
      return;
    }

    const writes: WriteOpJSON[] = Array.isArray((result as any)?.writes)
      ? ((result as any).writes as WriteOpJSON[])
      : [];

    writes.forEach((write) => {
      if (!write || typeof write.path !== "string") {
        return;
      }
      const animatable = animatables[write.path];
      if (!animatable) {
        return;
      }
      const rawValue = convertValueJSONToRaw(
        animatable,
        write.value as ValueJSON,
      );
      if (rawValue === undefined) {
        return;
      }
      setValue(write.path, DEFAULT_NAMESPACE, rawValue);
    });
  }, [
    animatables,
    appliedInputs,
    clearLowLevelStaged,
    convertValueJSONToRaw,
    evalLowLevelGraph,
    graphLoaded,
    lowLevelGraphSpec,
    lowLevelInputNodes,
    neutralInputs,
    setValue,
    stageLowLevelInput,
    loaderStatus.ready,
  ]);

  const handleAfterLoad = useCallback(
    (
      world: World,
      animatablesMap: Record<string, AnimatableValue>,
      sourceName: string | null,
    ) => {
      const root = findRootId(world);
      if (!root) {
        throw new Error("Unable to determine Vizij root for asset.");
      }
      addWorldElements(world, animatablesMap, true);
      setStoreState((prev) => ({
        ...prev,
        values: stripNamespaceValues(DEFAULT_NAMESPACE, prev.values),
        elementSelection: prev.elementSelection.filter(
          (selection) => selection.namespace !== DEFAULT_NAMESPACE,
        ),
      }));

      const rootRenderable = world[root] as Group | undefined;
      const faceId = deriveFaceIdFromSource(sourceName, rootRenderable);

      setRootId(root);
      setActiveFaceId(faceId);
    },
    [addWorldElements, setStoreState],
  );

  const loadAsset = useCallback(
    async (
      loader: () => Promise<[World, Record<string, AnimatableValue>]>,
      label: string | null,
    ) => {
      setLoaderStatus({
        loading: true,
        ready: false,
        error: null,
        assetName: label,
      });
      try {
        const [world, loadedAnimatables] = await loader();
        handleAfterLoad(world, loadedAnimatables, label);
        setLoaderStatus({
          loading: false,
          ready: true,
          error: null,
          assetName: label,
        });
      } catch (err) {
        console.error("demo-vizij-rigging: failed to load asset", err);
        setLoaderStatus({
          loading: false,
          ready: false,
          error: err instanceof Error ? err.message : String(err),
          assetName: label,
        });
      }
    },
    [handleAfterLoad],
  );

  const handleSelectFace = useCallback(
    (faceId: string) => {
      const face = getFaceById(faceId);
      setSelectedFaceId(face ? face.id : null);
      if (!face) {
        setLowLevelGraphSpec(null);
        setLowLevelGraphError(null);
        setGraphLoaded(false);
        return;
      }
      setLowLevelGraphSpec(null);
      setLowLevelGraphError(null);
      setGraphLoaded(false);
      void loadAsset(
        () =>
          loadGLTF(
            face.asset,
            [face.namespace ?? DEFAULT_NAMESPACE],
            face.aggressiveImport ?? true,
            face.bounds,
          ),
        face.name,
      );
    },
    [loadAsset],
  );

  const handleUploadGlb = useCallback(
    (file: File) => {
      setSelectedFaceId(null);
      setLowLevelGraphSpec(null);
      setLowLevelGraphError(null);
      setGraphLoaded(false);
      const label = file.name || "local.glb";
      void loadAsset(
        () => loadGLTFFromBlob(file, [DEFAULT_NAMESPACE], true),
        label,
      );
    },
    [loadAsset],
  );

  const handleImportLowLevelGraph = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as GraphSpec;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid graph file.");
      }
      setLowLevelGraphError(null);
      setGraphLoaded(false);
      setLowLevelGraphSpec(parsed);
    } catch (err) {
      console.error("demo-vizij-rigging: failed to import graph", err);
      window.alert(
        `Failed to import low-level graph: ${(err as Error).message ?? err}`,
      );
    }
  }, []);

  const handleNeutralInputChange = useCallback(
    (inputId: StandardInputId, value: number) => {
      setNeutralInputs((prev) => ({
        ...prev,
        [inputId]: clampToInputRange(inputId, value),
      }));
    },
    [],
  );

  const handleResetWeights = useCallback(() => {
    setEmotionWeights({});
  }, []);

  const handleWeightChange = useCallback(
    (emotionId: string, weight: number) => {
      setEmotionWeights((prev) => ({
        ...prev,
        [emotionId]: Math.max(0, Math.min(1, weight)),
      }));
    },
    [],
  );

  const handleAddEmotion = useCallback(() => {
    const next = createEmotion(`Emotion ${emotions.length + 1}`);
    setEmotions((prev) => [...prev, next]);
    setSelectedEmotionId(next.id);
  }, [emotions.length]);

  const handleDuplicateEmotion = useCallback(
    (emotionId: string) => {
      const existing = emotions.find((emotion) => emotion.id === emotionId);
      if (!existing) {
        return;
      }
      const copy = createEmotion(`${existing.name} Copy`);
      copy.values = { ...existing.values };
      setEmotions((prev) => [...prev, copy]);
      setSelectedEmotionId(copy.id);
    },
    [emotions],
  );

  const handleDeleteEmotion = useCallback((emotionId: string) => {
    setEmotions((prev) => prev.filter((emotion) => emotion.id !== emotionId));
    setEmotionWeights((prev) => {
      const next = { ...prev };
      delete next[emotionId];
      return next;
    });
    setSelectedEmotionId((current) => (current === emotionId ? null : current));
  }, []);

  const updateEmotionById = useCallback(
    (
      emotionId: string,
      updater: (emotion: EmotionDefinition) => EmotionDefinition,
    ) => {
      setEmotions((prev) =>
        prev.map((emotion) =>
          emotion.id === emotionId ? updater(emotion) : emotion,
        ),
      );
    },
    [],
  );

  const handleRenameEmotion = useCallback(
    (emotionId: string, name: string) => {
      updateEmotionById(emotionId, (emotion) =>
        updateEmotion(emotion, { name }),
      );
    },
    [updateEmotionById],
  );

  const handleEmotionDescriptionChange = useCallback(
    (emotionId: string, description: string) => {
      updateEmotionById(emotionId, (emotion) =>
        updateEmotion(emotion, { description }),
      );
    },
    [updateEmotionById],
  );

  const handleCaptureEmotion = useCallback(
    (emotionId: string) => {
      const snapshot = computePoseDelta(
        availableStandardInputs,
        appliedInputs,
        neutralInputs,
      );
      updateEmotionById(emotionId, (emotion) =>
        updateEmotion(emotion, { values: snapshot }),
      );
    },
    [appliedInputs, availableStandardInputs, neutralInputs, updateEmotionById],
  );

  const handleClearEmotionValues = useCallback(
    (emotionId: string) => {
      updateEmotionById(emotionId, (emotion) =>
        updateEmotion(emotion, { values: {} }),
      );
    },
    [updateEmotionById],
  );

  const handleEmotionInputValueChange = useCallback(
    (emotionId: string, inputId: string, value: number) => {
      updateEmotionById(emotionId, (emotion) => {
        const nextValues = {
          ...emotion.values,
          [inputId]: clampToInputRange(inputId, value),
        };
        return updateEmotion(emotion, { values: nextValues });
      });
    },
    [updateEmotionById],
  );

  const handleRemoveEmotionInput = useCallback(
    (emotionId: string, inputId: string) => {
      updateEmotionById(emotionId, (emotion) => {
        if (!(inputId in emotion.values)) {
          return emotion;
        }
        const nextValues = { ...emotion.values };
        delete nextValues[inputId];
        return updateEmotion(emotion, { values: nextValues });
      });
    },
    [updateEmotionById],
  );

  const handleAddEmotionInput = useCallback(
    (emotionId: string, inputId: string) => {
      const definition = STANDARD_RIG_INPUTS_BY_ID.get(inputId);
      if (!definition) {
        return;
      }
      const baseValue =
        appliedInputs[inputId] ??
        neutralInputs[inputId] ??
        definition.defaultValue;
      updateEmotionById(emotionId, (emotion) => {
        if (emotion.values[inputId] !== undefined) {
          return emotion;
        }
        const nextValues = {
          ...emotion.values,
          [inputId]: clampToInputRange(inputId, baseValue),
        };
        return updateEmotion(emotion, { values: nextValues });
      });
    },
    [appliedInputs, neutralInputs, updateEmotionById],
  );

  useEffect(() => {
    if (!graphLoaded || !lowLevelGraphSpec) {
      setGraphSummary(null);
      setGraphSpec(null);
      return;
    }
    const resolvedFaceId = activeFaceId ?? lowLevelFaceId ?? "face";
    const { spec, summary } = buildEmotionGraphSpec({
      faceId: resolvedFaceId,
      neutralInputs,
      emotions,
      standardInputs: availableStandardInputs,
    });
    setGraphSpec(spec);
    setGraphSummary(summary);
  }, [
    activeFaceId,
    availableStandardInputs,
    emotions,
    graphLoaded,
    lowLevelFaceId,
    lowLevelGraphSpec,
    neutralInputs,
  ]);

  const configValidationIssues: string[] = [];

  const handleExportRigConfig = useCallback(() => {
    const config = buildRigConfig({
      faceId: activeFaceId ?? lowLevelFaceId,
      neutralInputs,
      emotions,
      previous: configFile,
    });
    downloadJSON(`${config.faceId ?? "emotion"}-rig-config.json`, config);
    setConfigFile(config);
  }, [activeFaceId, configFile, emotions, lowLevelFaceId, neutralInputs]);

  const handleExportGraph = useCallback(() => {
    if (!graphSpec) {
      window.alert("Generate the graph before exporting.");
      return;
    }
    const exportFaceId = activeFaceId ?? lowLevelFaceId ?? "emotion";
    downloadJSON(`${exportFaceId}-graph.json`, graphSpec);
    if (graphSummary) {
      downloadJSON(`${exportFaceId}-graph.summary.json`, graphSummary);
    }
  }, [activeFaceId, graphSpec, graphSummary, lowLevelFaceId]);

  const handleImportRigConfig = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseRigConfig(JSON.parse(text));
      setConfigFile(parsed);
      setNeutralInputs({ ...parsed.neutralInputs });
      setEmotions(parsed.emotions.map((emotion) => ({ ...emotion })));
      setSelectedEmotionId(parsed.emotions[0]?.id ?? null);
      setEmotionWeights({});
      window.alert(
        "Rig config imported. Review validation warnings before exporting.",
      );
    } catch (err) {
      console.error("demo-vizij-rigging: failed to import config", err);
      window.alert(`Failed to import rig config: ${(err as Error).message}`);
    }
  }, []);

  const selectedEmotion = useMemo(
    () => emotions.find((emotion) => emotion.id === selectedEmotionId) ?? null,
    [emotions, selectedEmotionId],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Vizij Rigging Demo</h1>
          <p>
            Load Vizij assets, author high-level emotion rigs, and export the
            resulting blend graphs for downstream playback.
          </p>
        </div>
      </header>
      <main className="app-main">
        <section className="column column-left">
          <FaceLoaderPanel
            faces={FACES}
            selectedFaceId={selectedFaceId}
            onSelectFace={handleSelectFace}
            onUploadGlb={handleUploadGlb}
            onImportLowLevelGraph={handleImportLowLevelGraph}
            loaderStatus={loaderStatus}
            graphLoaded={graphLoaded}
            graphError={lowLevelGraphError}
          />
          <LowLevelInputsPanel
            inputs={availableStandardInputs}
            neutralValues={neutralInputs}
            appliedValues={appliedInputs}
            bindingsCount={bindingCounts}
            onChange={handleNeutralInputChange}
            disabled={!graphLoaded}
          />
        </section>
        <section className="column column-center">
          <FaceViewer
            rootId={rootId}
            loading={loaderStatus.loading}
            ready={loaderStatus.ready}
            error={loaderStatus.error}
            namespace={DEFAULT_NAMESPACE}
          />
          <EmotionMixer
            emotions={emotions}
            weights={emotionWeights}
            onWeightChange={handleWeightChange}
            onResetWeights={handleResetWeights}
          />
          <GraphSummaryPanel
            summary={graphSummary}
            faceId={lowLevelFaceId ?? activeFaceId}
            configIssues={configValidationIssues}
            onExportConfig={handleExportRigConfig}
            onExportGraph={handleExportGraph}
            onImportConfig={handleImportRigConfig}
            graphLoaded={graphLoaded}
            graphError={lowLevelGraphError}
          />
        </section>
        <section className="column column-right">
          <EmotionList
            emotions={emotions}
            selectedEmotionId={selectedEmotionId}
            onSelect={setSelectedEmotionId}
            onAdd={handleAddEmotion}
            onDuplicate={handleDuplicateEmotion}
            onDelete={handleDeleteEmotion}
          />
          <EmotionEditor
            emotion={selectedEmotion}
            neutralInputs={neutralInputs}
            inputs={availableStandardInputs}
            onRename={(name) =>
              selectedEmotionId
                ? handleRenameEmotion(selectedEmotionId, name)
                : undefined
            }
            onDescriptionChange={(description) =>
              selectedEmotionId
                ? handleEmotionDescriptionChange(selectedEmotionId, description)
                : undefined
            }
            onCapture={() =>
              selectedEmotionId
                ? handleCaptureEmotion(selectedEmotionId)
                : undefined
            }
            onClear={() =>
              selectedEmotionId
                ? handleClearEmotionValues(selectedEmotionId)
                : undefined
            }
            onInputValueChange={(inputId, value) =>
              selectedEmotionId
                ? handleEmotionInputValueChange(
                    selectedEmotionId,
                    inputId,
                    value,
                  )
                : undefined
            }
            onRemoveInput={(inputId) =>
              selectedEmotionId
                ? handleRemoveEmotionInput(selectedEmotionId, inputId)
                : undefined
            }
            onAddInput={(inputId) =>
              selectedEmotionId
                ? handleAddEmotionInput(selectedEmotionId, inputId)
                : undefined
            }
          />
        </section>
      </main>
    </div>
  );
}
