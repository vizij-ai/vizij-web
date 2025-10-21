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
import type { StandardRigInput } from "./low-level/standardRigInputs";
import {
  createNeutralInputs,
  ensureNeutralDefaults,
  captureEmotionPoseSnapshot,
} from "./rigging/utils";
import { buildRigConfig, parseRigConfig } from "./rigging/persistence";
import { buildPoseGraphSpec } from "./rigging/graphBuilder";
import type {
  EmotionDefinition,
  GraphGenerationSummary,
  RigConfigFile,
  StandardInputId,
} from "./rigging/types";
import { FaceLoaderPanel } from "./components/FaceLoaderPanel";
import { FaceViewer } from "./components/FaceViewer";
import { LowLevelInputsPanel } from "./components/LowLevelInputsPanel";
import { EmotionList } from "./components/EmotionList";
import { EmotionEditor } from "./components/EmotionEditor";
import { GraphSummaryPanel } from "./components/GraphSummaryPanel";
import { NeutralPoseEditor } from "./components/NeutralPoseEditor";
import { VISEME_DEFINITIONS } from "./data/visemes";

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

const NEUTRAL_POSE_ID = "__neutral_pose__";

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

function sanitizeSlug(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
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
  const [visemeEnabled, setVisemeEnabled] = useState(false);
  const [emotions, setEmotions] = useState<EmotionDefinition[]>([]);
  const [selectedEmotionId, setSelectedEmotionId] = useState<string | null>(
    NEUTRAL_POSE_ID,
  );
  const [graphSummary, setGraphSummary] =
    useState<GraphGenerationSummary | null>(null);
  const [graphSpec, setGraphSpec] = useState<GraphSpec | null>(null);
  const [configFile, setConfigFile] = useState<RigConfigFile | null>(null);
  const [rigName, setRigName] = useState<string>("emotion");
  const [savedNeutral, setSavedNeutral] = useState<
    Record<StandardInputId, number>
  >({});

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

  type GraphInputNode = {
    path: string;
    remap?: {
      in_low: number;
      in_high: number;
      in_anchor: number;
    };
    defaultValue?: number;
  };

  const lowLevelInputNodes = useMemo((): GraphInputNode[] => {
    if (!lowLevelGraphSpec) {
      return [];
    }

    const nodes = (lowLevelGraphSpec.nodes ?? []) as Array<any>;
    const edges = (lowLevelGraphSpec.edges ?? []) as Array<any>;

    const nodeById = new Map<string, any>();
    nodes.forEach((node) => {
      if (node && typeof node.id === "string") {
        nodeById.set(node.id, node);
      }
    });

    const incomingEdges = new Map<string, any[]>();
    edges.forEach((edge) => {
      if (!edge || !edge.to?.node_id) {
        return;
      }
      const list = incomingEdges.get(edge.to.node_id) ?? [];
      list.push(edge);
      incomingEdges.set(edge.to.node_id, list);
    });

    const descriptors: GraphInputNode[] = nodes
      .filter((node) => {
        return (
          node &&
          node.type === "input" &&
          node.params &&
          typeof node.params.path === "string"
        );
      })
      .map((node) => {
        const path = node.params.path as string;
        const edgesFromNode = edges.filter(
          (edge) => edge?.from?.node_id === node.id,
        );
        const defaultValue = node.params?.value as ValueJSON | undefined;

        let remap: {
          in_low: number;
          in_high: number;
          in_anchor: number;
        } | null = null;

        for (const edge of edgesFromNode) {
          const targetId = edge.to?.node_id;
          if (!targetId) {
            continue;
          }
          const parentEdges = incomingEdges.get(targetId) ?? [];
          if (parentEdges.length === 0) {
            const targetNode = nodeById.get(targetId);
            if (targetNode?.input_defaults) {
              const { in_low, in_high, in_anchor } = targetNode.input_defaults;
              if (
                typeof in_low === "number" &&
                typeof in_high === "number" &&
                typeof in_anchor === "number"
              ) {
                remap = { in_low, in_high, in_anchor };
                break;
              }
            }
            continue;
          }

          for (const parentEdge of parentEdges) {
            const parentNode = nodeById.get(parentEdge.from?.node_id);
            if (parentNode?.input_defaults) {
              const { in_low, in_high, in_anchor } = parentNode.input_defaults;
              if (
                typeof in_low === "number" &&
                typeof in_high === "number" &&
                typeof in_anchor === "number"
              ) {
                remap = { in_low, in_high, in_anchor };
                break;
              }
            }
          }
        if (remap) {
          break;
        }
      }

        let defaultNumeric: number | undefined;
        if (defaultValue && typeof defaultValue === "object") {
          const floatValue = (defaultValue as { float?: number }).float;
          if (typeof floatValue === "number" && Number.isFinite(floatValue)) {
            defaultNumeric = floatValue;
          }
        }

        return {
          path,
          remap: remap ?? undefined,
          defaultValue: defaultNumeric,
        };
      });

    return descriptors;
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
    const seen = new Map<string, StandardRigInput>();

    const deriveGroupFromPath = (fullPath: string): string => {
      const segments = fullPath.split("/").filter(Boolean);
      if (segments.length <= 1) {
        return "/";
      }
      return `/${segments.slice(0, -1).join("/")}`;
    };

    const createLabelFromPath = (fullPath: string): string => {
      const segments = fullPath
        .split("/")
        .filter(Boolean)
        .map((segment) =>
          segment.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
        );
      return segments.join(" · ") || fullPath;
    };

    lowLevelInputNodes.forEach(({ path, remap, defaultValue: nodeDefault }) => {
      if (typeof path !== "string" || !path.startsWith("rig/")) {
        return;
      }
      const segments = path.split("/");
      if (segments.length < 3) {
        return;
      }
      const rest = segments.slice(2).join("/");
      if (!rest) {
        return;
      }

      const normalizedPath = rest.startsWith("/") ? rest : `/${rest}`;
      const id = normalizedPath.replace(/\//g, "_").replace(/^_+/, "");
      const defaultValue = remap?.in_anchor ?? nodeDefault ?? 0;
      const fallbackSpan = Number.isFinite(nodeDefault)
        ? Math.max(Math.abs(nodeDefault as number), 1)
        : 1;
      const descriptor: StandardRigInput = {
        id: id.length > 0 ? id : `input_${seen.size + 1}`,
        path: normalizedPath,
        label: createLabelFromPath(normalizedPath),
        group: deriveGroupFromPath(normalizedPath),
        defaultValue,
        range: {
          min: remap?.in_low ?? defaultValue - fallbackSpan,
          max: remap?.in_high ?? defaultValue + fallbackSpan,
        },
      };

      if (!seen.has(descriptor.id)) {
        seen.set(descriptor.id, descriptor);
      }
    });

    return Array.from(seen.values());
  }, [lowLevelInputNodes]);

  const standardInputsByPath = useMemo(() => {
    return new Map(availableStandardInputs.map((input) => [input.path, input]));
  }, [availableStandardInputs]);

  const standardInputsById = useMemo(() => {
    return new Map(availableStandardInputs.map((input) => [input.id, input]));
  }, [availableStandardInputs]);

  const handleCreateVisemePoses = useCallback(() => {
    if (!availableStandardInputs.length) {
      return;
    }

    const mouthScaleXPath = "/mouth/scale/x";
    const mouthScaleYPath = "/mouth/scale/y";
    const mouthMorphPath = "/mouth/morph";

    const additions: EmotionDefinition[] = [];

    setEmotions((previous) => {
      const existingNames = new Set(previous.map((emotion) => emotion.name));
      const next = [...previous];

      VISEME_DEFINITIONS.forEach((viseme) => {
        const name = `Viseme: ${viseme.label}`;
        if (existingNames.has(name)) {
          return;
        }

        const values: Record<string, number> = {};
        const xInput = standardInputsByPath.get(mouthScaleXPath);
        const yInput = standardInputsByPath.get(mouthScaleYPath);
        const morphInput = standardInputsByPath.get(mouthMorphPath);

        if (xInput) {
          values[xInput.id] = viseme.xScale;
        }
        if (yInput) {
          values[yInput.id] = viseme.yScale;
        }
        if (morphInput) {
          values[morphInput.id] = viseme.morph;
        }

        if (Object.keys(values).length === 0) {
          return;
        }

        const now = new Date().toISOString();
        const emotion: EmotionDefinition = {
          id: `viseme_${viseme.id}_${Math.random().toString(36).slice(2, 10)}`,
          name,
          description: `Auto-generated viseme pose (${viseme.id})`,
          values,
          createdAt: now,
          updatedAt: now,
        };

        additions.push(emotion);
        next.push(emotion);
      });

      return next;
    });

    if (additions.length > 0) {
      setSelectedEmotionId(additions[0].id);
    }
  }, [
    availableStandardInputs,
    setEmotions,
    setSelectedEmotionId,
    standardInputsByPath,
  ]);

  useEffect(() => {
    setSavedNeutral((prev) => {
      const next = { ...prev };
      let changed = false;
      availableStandardInputs.forEach((input) => {
        if (next[input.id] === undefined) {
          next[input.id] = neutralInputs[input.id] ?? input.defaultValue ?? 0;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [availableStandardInputs, neutralInputs]);

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
      const { path, defaultValue: nodeDefault } = node;
      let stagedValue: ValueJSON | undefined =
        typeof nodeDefault === "number" && Number.isFinite(nodeDefault)
          ? { float: nodeDefault }
          : undefined;

      if (typeof path === "string" && path.startsWith("rig/")) {
        const segments = path.split("/");
        if (segments.length >= 3) {
          const standardPath = `/${segments.slice(2).join("/")}`;
          const standardInput = standardInputsByPath.get(standardPath);
          if (standardInput) {
            const nextValue =
              neutralInputs[standardInput.id] ??
              standardInput.defaultValue ??
              0;
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
    clearLowLevelStaged,
    convertValueJSONToRaw,
    evalLowLevelGraph,
    graphLoaded,
    lowLevelGraphSpec,
    lowLevelInputNodes,
    neutralInputs,
    setValue,
    stageLowLevelInput,
    standardInputsByPath,
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
        [inputId]: value,
      }));
    },
    [],
  );

  const handleAddEmotion = useCallback(() => {
    const next = createEmotion(`Pose ${emotions.length + 1}`);
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
    setEmotions((prev) => {
      const next = prev.filter((emotion) => emotion.id !== emotionId);
      if (next.length !== prev.length) {
        setSelectedEmotionId((current) =>
          current === emotionId ? (next[0]?.id ?? NEUTRAL_POSE_ID) : current,
        );
      }
      return next;
    });
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
      if (!availableStandardInputs.length) {
        return;
      }
      const snapshot = captureEmotionPoseSnapshot({
        inputs: availableStandardInputs,
        currentValues: neutralInputs,
      });
      updateEmotionById(emotionId, (emotion) => {
        const nextValues = { ...emotion.values };
        availableStandardInputs.forEach((input) => {
          const captured = snapshot[input.id];
          if (captured !== undefined) {
            nextValues[input.id] = captured;
          } else if (nextValues[input.id] !== undefined) {
            delete nextValues[input.id];
          }
        });
        return updateEmotion(emotion, { values: nextValues });
      });
    },
    [availableStandardInputs, neutralInputs, updateEmotionById],
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
          [inputId]: value,
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
      const definition = standardInputsById.get(inputId);
      if (!definition) {
        return;
      }
      const baseValue = neutralInputs[inputId] ?? definition.defaultValue ?? 0;
      updateEmotionById(emotionId, (emotion) => {
        if (emotion.values[inputId] !== undefined) {
          return emotion;
        }
        const nextValues = {
          ...emotion.values,
          [inputId]: baseValue,
        };
        return updateEmotion(emotion, { values: nextValues });
      });
    },
    [neutralInputs, standardInputsById, updateEmotionById],
  );

  const poseLibrary = useMemo(() => {
    const neutralPose: Record<string, number> = {};
    availableStandardInputs.forEach((input) => {
      neutralPose[input.id] = savedNeutral[input.id] ?? input.defaultValue ?? 0;
    });

    const poseEntries = emotions.map((emotion) => ({
      id: emotion.id,
      name: emotion.name || emotion.id,
    }));

    return {
      neutral: neutralPose,
      poses: poseEntries,
    };
  }, [availableStandardInputs, emotions, savedNeutral]);

  useEffect(() => {
    if (!graphLoaded || !availableStandardInputs.length) {
      setGraphSpec(null);
      setGraphSummary(null);
      return;
    }
    const resolvedFaceId = lowLevelFaceId ?? activeFaceId ?? null;
    const { spec, summary } = buildPoseGraphSpec({
      faceId: resolvedFaceId,
      neutralInputs: savedNeutral,
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
    savedNeutral,
  ]);

  const configValidationIssues: string[] = [];

  const handleCaptureNeutral = useCallback(() => {
    if (!availableStandardInputs.length) {
      return;
    }
    const snapshot = captureEmotionPoseSnapshot({
      inputs: availableStandardInputs,
      currentValues: neutralInputs,
    });
    setSavedNeutral(snapshot);
  }, [availableStandardInputs, neutralInputs]);

  const handleApplyNeutral = useCallback(() => {
    if (!availableStandardInputs.length) {
      return;
    }
    setNeutralInputs(() => {
      const next: Record<StandardInputId, number> = {};
      availableStandardInputs.forEach((input) => {
        const value = savedNeutral[input.id] ?? input.defaultValue ?? 0;
        next[input.id] = value;
      });
      return next;
    });
    setSelectedEmotionId(NEUTRAL_POSE_ID);
  }, [availableStandardInputs, savedNeutral]);

  const handleApplyPose = useCallback(
    (emotionId: string) => {
      const emotion = emotions.find((entry) => entry.id === emotionId);
      if (!emotion || !availableStandardInputs.length) {
        return;
      }
      setNeutralInputs(() => {
        const next: Record<StandardInputId, number> = {};
        availableStandardInputs.forEach((input) => {
          const value = emotion.values[input.id] ?? savedNeutral[input.id] ?? 0;
          next[input.id] = value;
        });
        return next;
      });
      setSelectedEmotionId(emotionId);
    },
    [availableStandardInputs, emotions, savedNeutral],
  );

  const handleExportRigConfig = useCallback(() => {
    const config = buildRigConfig({
      faceId: activeFaceId ?? lowLevelFaceId,
      neutralInputs: savedNeutral,
      emotions,
      previous: configFile,
      title: rigName,
    });
    const faceSlug = sanitizeSlug(config.faceId ?? "face", "face");
    const rigSlug = sanitizeSlug(rigName, "rig");
    downloadJSON(`${faceSlug}_${rigSlug}_rig_config.json`, config);
    setConfigFile(config);
  }, [
    activeFaceId,
    configFile,
    emotions,
    lowLevelFaceId,
    rigName,
    savedNeutral,
  ]);

  const handleExportGraph = useCallback(() => {
    if (!graphSpec) {
      window.alert("Generate the graph before exporting.");
      return;
    }
    const exportFaceId = activeFaceId ?? lowLevelFaceId ?? "face";
    const faceSlug = sanitizeSlug(exportFaceId, "face");
    const rigSlug = sanitizeSlug(rigName, "rig");
    downloadJSON(`${faceSlug}_${rigSlug}_rig.json`, graphSpec);
    if (graphSummary) {
      downloadJSON(`${faceSlug}_${rigSlug}_rig.summary.json`, graphSummary);
    }
  }, [activeFaceId, graphSpec, graphSummary, lowLevelFaceId, rigName]);

  const handleImportRigConfig = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseRigConfig(JSON.parse(text));
      setConfigFile(parsed);
      setNeutralInputs({ ...parsed.neutralInputs });
      setSavedNeutral({ ...parsed.neutralInputs });
      setRigName(parsed.title ?? "emotion");
      setEmotions(parsed.emotions.map((emotion) => ({ ...emotion })));
      setSelectedEmotionId(parsed.emotions[0]?.id ?? NEUTRAL_POSE_ID);
      window.alert(
        "Rig config imported. Review validation warnings before exporting.",
      );
    } catch (err) {
      console.error("demo-vizij-rigging: failed to import config", err);
      window.alert(`Failed to import rig config: ${(err as Error).message}`);
    }
  }, []);

  const handleLogEmotionPoses = useCallback(() => {
    const neutralPose: Record<string, number> = {};
    availableStandardInputs.forEach((input) => {
      neutralPose[input.id] = savedNeutral[input.id] ?? input.defaultValue ?? 0;
    });

    const poseData: Record<string, Record<string, number>> = {};
    emotions.forEach((emotion) => {
      const poseValues: Record<string, number> = {};
      availableStandardInputs.forEach((input) => {
        const value = emotion.values[input.id] ?? savedNeutral[input.id] ?? 0;
        poseValues[input.id] = value;
      });
      poseData[emotion.name || emotion.id] = poseValues;
    });

    console.log("Rigging demo • captured poses", {
      neutral: neutralPose,
      poses: poseData,
    });
  }, [availableStandardInputs, emotions, savedNeutral]);

  const selectedEmotion = useMemo(() => {
    if (!selectedEmotionId || selectedEmotionId === NEUTRAL_POSE_ID) {
      return null;
    }
    return emotions.find((emotion) => emotion.id === selectedEmotionId) ?? null;
  }, [emotions, selectedEmotionId]);

  const isNeutralSelected = selectedEmotionId === NEUTRAL_POSE_ID;
  const activeEmotionId = selectedEmotion?.id ?? null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Vizij Rigging Demo</h1>
          <p>
            Load Vizij assets, author high-level pose rigs, and export the
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
            appliedValues={neutralInputs}
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
          <GraphSummaryPanel
            summary={graphSummary}
            faceId={lowLevelFaceId ?? activeFaceId}
            configIssues={configValidationIssues}
            onExportConfig={handleExportRigConfig}
            onExportGraph={handleExportGraph}
            onLogEmotionPoses={handleLogEmotionPoses}
            onCaptureNeutral={handleCaptureNeutral}
            onApplyNeutral={handleApplyNeutral}
            onApplyPose={handleApplyPose}
            poseLibrary={poseLibrary}
            rigName={rigName}
            onRigNameChange={setRigName}
            onImportConfig={handleImportRigConfig}
            graphLoaded={graphLoaded}
            graphError={lowLevelGraphError}
          />
        </section>
        <section className="column column-right">
          <EmotionList
            emotions={emotions}
            selectedEmotionId={activeEmotionId}
            neutralSelected={isNeutralSelected}
            onSelectNeutral={() => setSelectedEmotionId(NEUTRAL_POSE_ID)}
            onSelect={setSelectedEmotionId}
            onAdd={handleAddEmotion}
            onCreateVisemes={handleCreateVisemePoses}
            onDuplicate={handleDuplicateEmotion}
            onDelete={handleDeleteEmotion}
          />
          {isNeutralSelected ? (
            <NeutralPoseEditor
              inputs={availableStandardInputs}
              neutralInputs={neutralInputs}
              onChange={handleNeutralInputChange}
            />
          ) : (
            <EmotionEditor
              emotion={selectedEmotion}
              neutralInputs={neutralInputs}
              inputs={availableStandardInputs}
              onRename={(name) =>
                activeEmotionId
                  ? handleRenameEmotion(activeEmotionId, name)
                  : undefined
              }
              onDescriptionChange={(description) =>
                activeEmotionId
                  ? handleEmotionDescriptionChange(activeEmotionId, description)
                  : undefined
              }
              onCapture={() =>
                activeEmotionId
                  ? handleCaptureEmotion(activeEmotionId)
                  : undefined
              }
              onClear={() =>
                activeEmotionId
                  ? handleClearEmotionValues(activeEmotionId)
                  : undefined
              }
              onInputValueChange={(inputId, value) =>
                activeEmotionId
                  ? handleEmotionInputValueChange(
                      activeEmotionId,
                      inputId,
                      value,
                    )
                  : undefined
              }
              onRemoveInput={(inputId) =>
                activeEmotionId
                  ? handleRemoveEmotionInput(activeEmotionId, inputId)
                  : undefined
              }
              onAddInput={(inputId) =>
                activeEmotionId
                  ? handleAddEmotionInput(activeEmotionId, inputId)
                  : undefined
              }
            />
          )}
        </section>
      </main>
    </div>
  );
}
