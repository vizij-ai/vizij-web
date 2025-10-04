import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useVizijStore } from "@vizij/render";
import {
  useOrchestrator,
  useOrchTarget,
  type GraphRegistrationInput,
  type ValueJSON,
} from "@vizij/orchestrator-react";
import type { RawValue } from "@vizij/utils";

import type {
  AnimationEditorState,
  GraphEditorState,
  GraphNodeState,
  GraphParamState,
  OrchestratorAnimatableOption,
  ValueKind,
} from "../types";
import {
  animationStateToConfig,
  graphStateToSpec,
} from "../utils/orchestratorConverters";
import { defaultValueForKind, valueToJSON } from "../utils/valueHelpers";
import { ValueField } from "./ValueField";

const KIND_COMPONENT_LABELS: Partial<Record<ValueKind, string[]>> = {
  vec2: ["x", "y"],
  vec3: ["x", "y", "z"],
  vec4: ["x", "y", "z", "w"],
  quat: ["x", "y", "z", "w"],
  color: ["r", "g", "b", "a"],
  vector: ["0", "1", "2", "3"],
  transform: ["position", "rotation", "scale"],
};

function componentsForKind(kind?: ValueKind): string[] {
  if (!kind) return [];
  const normalized = kind.toLowerCase() as ValueKind;
  return KIND_COMPONENT_LABELS[normalized] ?? [];
}

function isGraphInputNode(node: GraphNodeState): boolean {
  return node.type.toLowerCase() === "input";
}

function findParam(
  node: GraphNodeState,
  paramId: string,
): GraphParamState | undefined {
  return node.params.find((param) => param.id === paramId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numericArrayToRaw(arr: number[]): RawValue {
  const normalized = arr.map((entry) => Number(entry ?? 0));
  switch (normalized.length) {
    case 2:
      return { x: normalized[0], y: normalized[1] } as unknown as RawValue;
    case 3:
      return {
        x: normalized[0],
        y: normalized[1],
        z: normalized[2],
      } as unknown as RawValue;
    case 4:
      return {
        x: normalized[0],
        y: normalized[1],
        z: normalized[2],
        w: normalized[3],
      } as unknown as RawValue;
    default:
      return normalized as unknown as RawValue;
  }
}

function valueJSONToRaw(value?: ValueJSON): RawValue | undefined {
  if (value == null) return undefined;
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value as unknown as RawValue;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if ("float" in value && typeof value.float === "number") {
    return value.float;
  }
  if ("bool" in value && typeof value.bool === "boolean") {
    return value.bool;
  }
  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }
  if ("vec3" in value && Array.isArray(value.vec3)) {
    const [x = 0, y = 0, z = 0] = value.vec3 as number[];
    return { x, y, z } as unknown as RawValue;
  }
  if ("vec2" in value && Array.isArray(value.vec2)) {
    const [x = 0, y = 0] = value.vec2 as number[];
    return { x, y } as unknown as RawValue;
  }
  if ("color" in value && Array.isArray(value.color)) {
    const [r = 0, g = 0, b = 0, a = 1] = value.color as number[];
    return { r, g, b, a } as unknown as RawValue;
  }
  if ("vector" in value && Array.isArray(value.vector)) {
    return numericArrayToRaw(value.vector as number[]);
  }
  if ("record" in value && isRecord(value.record)) {
    const result: Record<string, RawValue | undefined> = {};
    Object.entries(value.record).forEach(([key, entry]) => {
      result[key] = valueJSONToRaw(entry);
    });
    return result as unknown as RawValue;
  }
  if ("array" in value && Array.isArray(value.array)) {
    return value.array.map((entry) =>
      valueJSONToRaw(entry),
    ) as unknown as RawValue;
  }
  if ("list" in value && Array.isArray(value.list)) {
    return value.list.map((entry) =>
      valueJSONToRaw(entry),
    ) as unknown as RawValue;
  }
  if ("tuple" in value && Array.isArray(value.tuple)) {
    return value.tuple.map((entry) =>
      valueJSONToRaw(entry),
    ) as unknown as RawValue;
  }
  if ("enum" in value && isRecord(value.enum)) {
    const tag = value.enum.tag as string;
    const enumValue = valueJSONToRaw(value.enum.value as ValueJSON);
    return { tag, value: enumValue } as unknown as RawValue;
  }
  if ("transform" in value && isRecord(value.transform)) {
    const translationRaw = numericArrayToRaw(
      (value.transform.translation ?? [0, 0, 0]) as number[],
    );
    const rotationRaw = numericArrayToRaw(
      (value.transform.rotation ?? [0, 0, 0, 1]) as number[],
    );
    const scaleRaw = numericArrayToRaw(
      (value.transform.scale ?? [1, 1, 1]) as number[],
    );
    return {
      translation: translationRaw,
      rotation: rotationRaw,
      scale: scaleRaw,
      // Back-compat aliases
      pos: translationRaw,
      rot: rotationRaw,
    } as unknown as RawValue;
  }
  if ("type" in value && "data" in value) {
    const typeName = String(value.type).toLowerCase();
    const data = value.data as unknown;
    switch (typeName) {
      case "float":
        return typeof data === "number" ? (data as RawValue) : undefined;
      case "bool":
        return typeof data === "boolean" ? (data as RawValue) : undefined;
      case "text":
        return typeof data === "string" ? (data as RawValue) : undefined;
      case "vec2":
        if (Array.isArray(data)) {
          const [x = 0, y = 0] = data as number[];
          return { x, y } as unknown as RawValue;
        }
        break;
      case "vec3":
        if (Array.isArray(data)) {
          const [x = 0, y = 0, z = 0] = data as number[];
          return { x, y, z } as unknown as RawValue;
        }
        break;
      case "vec4":
        if (Array.isArray(data)) {
          const [x = 0, y = 0, z = 0, w = 0] = data as number[];
          return { x, y, z, w } as unknown as RawValue;
        }
        break;
      case "colorrgba":
        if (Array.isArray(data)) {
          const [r = 0, g = 0, b = 0, a = 1] = data as number[];
          return { r, g, b, a } as unknown as RawValue;
        }
        break;
      case "vector":
        if (Array.isArray(data)) {
          return numericArrayToRaw(data as number[]);
        }
        break;
      default:
        break;
    }
  }
  return value as unknown as RawValue;
}

function ensureGraphOutputs(
  config: GraphRegistrationInput,
  outputPath: string,
): GraphRegistrationInput {
  const next = structuredClone(config) as any;
  const nodes = Array.isArray(next?.spec?.nodes) ? next.spec.nodes : [];
  const outputNodes = nodes.filter(
    (node: any) => String(node?.type ?? "").toLowerCase() === "output",
  );
  next.spec = next.spec ?? { nodes: [] };
  if (outputNodes.length <= 1) {
    let outputFound = false;
    next.spec.nodes = nodes.map((node: any) => {
      if (String(node?.type ?? "").toLowerCase() === "output") {
        outputFound = true;
        return {
          ...node,
          params: {
            ...(typeof node?.params === "object" && node?.params
              ? node.params
              : {}),
            path:
              typeof node?.params?.path === "string" &&
              node.params.path.length > 0
                ? node.params.path
                : outputPath,
          },
        };
      }
      return node;
    });
    if (!outputFound) {
      next.spec.nodes.push({
        id: `out-${Date.now()}`,
        type: "output",
        params: { path: outputPath },
        inputs: {},
      });
    }
  } else {
    next.spec.nodes = nodes.map((node: any) => {
      if (String(node?.type ?? "").toLowerCase() === "output") {
        const params =
          typeof node?.params === "object" && node?.params ? node.params : {};
        if (!params.path) {
          return {
            ...node,
            params: {
              ...params,
              path: outputPath,
            },
          };
        }
      }
      return node;
    });
  }

  if (outputNodes.length === 0) {
    next.spec.nodes.push({
      id: `out-${Date.now()}`,
      type: "output",
      params: { path: outputPath },
      inputs: {},
    });
  }
  const inputSubs = Array.isArray(next?.subs?.inputs) ? next.subs.inputs : [];
  const outputSubs = Array.isArray(next?.subs?.outputs)
    ? next.subs.outputs
    : [];
  const discoveredOutputPaths = next.spec.nodes
    .filter((node: any) => String(node?.type ?? "").toLowerCase() === "output")
    .map((node: any) => {
      const params =
        typeof node?.params === "object" && node?.params ? node.params : {};
      return params.path;
    })
    .filter(
      (path: unknown): path is string =>
        typeof path === "string" && path.length > 0,
    );
  next.subs = {
    inputs: Array.from(new Set(inputSubs)),
    outputs: Array.from(
      new Set([...outputSubs, ...discoveredOutputPaths, outputPath]),
    ),
  };
  return next as GraphRegistrationInput;
}

function extractOutputPathFromState(
  state: GraphEditorState,
  fallback: string,
): string {
  for (const node of state.nodes) {
    if (node.type.toLowerCase() !== "output") {
      continue;
    }
    const pathParam = findParam(node, "path");
    if (typeof pathParam?.value === "string" && pathParam.value.length > 0) {
      return pathParam.value;
    }
  }
  if (state.outputs && state.outputs.length > 0) {
    return state.outputs[0] ?? fallback;
  }
  return fallback;
}

function OutputBridge({
  namespace,
  path,
  connected,
  setVizijValue,
}: {
  namespace: string;
  path: string | null;
  connected: boolean;
  setVizijValue: (
    id: string,
    namespace: string,
    value: RawValue | ((current: RawValue | undefined) => RawValue),
  ) => void;
}) {
  const orchValue = useOrchTarget(connected && path ? path : null);

  useEffect(() => {
    if (!connected || !path) {
      return;
    }
    if (orchValue == null) {
      return;
    }
    const raw = valueJSONToRaw(orchValue);
    if (raw === undefined) {
      return;
    }
    // console.log("setVizijValue", path, namespace, orchValue)
    setVizijValue(path, namespace, raw as RawValue);
  }, [connected, orchValue, namespace, path, setVizijValue]);

  return null;
}

type InputRow = {
  node: GraphNodeState;
  path: string | null;
  kind: ValueKind;
  defaultValue: any;
  meta?: GraphParamState["meta"];
};

type OutputRow = {
  node: GraphNodeState;
  option: OrchestratorAnimatableOption | null;
  optionId: string | null;
  graphPath: string | null;
  targetPath: string | null;
  components: string[];
  invalid: boolean;
};

interface OrchestratorBridgeContextValue {
  ready: boolean;
  connected: boolean;
  status: string | null;
  animatables: OrchestratorAnimatableOption[];
  outputRows: OutputRow[];
  missingMappings: boolean;
  invalidMappings: boolean;
  buttonsDisabled: boolean;
  currentMappingsSummary: string;
  outputComponentsSummary: string;
  handleConnect: () => void;
  handleUpdateControllers: () => void;
  handleDisconnect: () => void;
  setOutputOption: (nodeId: string, optionId: string | null) => void;
  inputRows: InputRow[];
  inputValues: Record<string, any>;
  updateInputValue: (path: string, kind: ValueKind, value: any) => void;
  namespace: string;
  graphToggles: Array<{
    id: string;
    label: string;
    enabled: boolean;
    isPrimary: boolean;
  }>;
  setGraphEnabled: (graphId: string, enabled: boolean) => void;
  logCurrentInputs: () => void;
}

const OrchestratorBridgeContext =
  createContext<OrchestratorBridgeContextValue | null>(null);

export function useOrchestratorBridge() {
  const context = useContext(OrchestratorBridgeContext);
  if (!context) {
    throw new Error(
      "useOrchestratorBridge must be used within an OrchestratorBridgeProvider",
    );
  }
  return context;
}

type AdditionalGraphState = {
  label: string;
  state: GraphEditorState;
};

interface OrchestratorPanelProps {
  namespace: string;
  animatables: OrchestratorAnimatableOption[];
  animationState: AnimationEditorState;
  graphState: GraphEditorState;
  extraGraphs?: AdditionalGraphState[];
  initialOutputMap?: Record<string, string> | null;
}

function applyOutputMappings(
  spec: GraphRegistrationInput,
  rows: OutputRow[],
  fallbackPath: string,
): GraphRegistrationInput {
  const next = structuredClone(spec) as any;
  const mapping = new Map<string, string>();
  rows.forEach((row) => {
    if (row.targetPath) {
      mapping.set(row.node.id, row.targetPath);
    }
  });
  next.spec.nodes = next.spec.nodes.map((node: any) => {
    if (String(node?.type ?? "").toLowerCase() === "output") {
      const mappedPath = mapping.get(node.id);
      const params =
        typeof node?.params === "object" && node?.params ? node.params : {};
      const path =
        mappedPath ??
        (typeof params.path === "string" ? params.path : fallbackPath);
      return {
        ...node,
        params: {
          ...params,
          path,
        },
      };
    }
    return node;
  });
  return next as GraphRegistrationInput;
}

interface OrchestratorBridgeProviderProps extends OrchestratorPanelProps {
  children: ReactNode;
}

export function OrchestratorBridgeProvider({
  namespace,
  animatables,
  animationState,
  graphState,
  extraGraphs,
  initialOutputMap,
  children,
}: OrchestratorBridgeProviderProps) {
  const {
    ready,
    createOrchestrator,
    registerGraph,
    registerAnimation,
    removeGraph,
    removeAnimation,
    setInput,
  } = useOrchestrator();
  const setVizijValue = useVizijStore((state) => state.setValue);

  const graphDescriptors = useMemo(() => {
    const descriptors: Array<{
      id: string;
      label: string;
      state: GraphEditorState;
      isPrimary: boolean;
    }> = [
      { id: "primary", label: "Rig Graph", state: graphState, isPrimary: true },
    ];
    (extraGraphs ?? []).forEach((entry, index) => {
      descriptors.push({
        id: `extra-${index}`,
        label: entry.label || `Graph ${index + 2}`,
        state: entry.state,
        isPrimary: false,
      });
    });
    return descriptors;
  }, [graphState, extraGraphs]);

  const [animationId, setAnimationId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, any>>({});
  const [outputOptionMap, setOutputOptionMap] = useState<
    Record<string, string>
  >({});
  const [graphIds, setGraphIds] = useState<string[]>([]);
  const [graphEnabledMap, setGraphEnabledMap] = useState<
    Record<string, boolean>
  >(() => {
    const initial: Record<string, boolean> = {};
    graphDescriptors.forEach((descriptor) => {
      initial[descriptor.id] = true;
    });
    return initial;
  });

  useEffect(() => {
    setGraphEnabledMap((prev) => {
      const next: Record<string, boolean> = {};
      graphDescriptors.forEach((descriptor) => {
        next[descriptor.id] = prev[descriptor.id] ?? true;
      });
      return next;
    });
  }, [graphDescriptors]);

  const clearRegisteredGraphs = useCallback(() => {
    if (!graphIds.length) {
      return;
    }
    graphIds.forEach((id) => removeGraph(id));
    setGraphIds([]);
  }, [graphIds, removeGraph]);

  const combinedGraphStates = useMemo(
    () => graphDescriptors.map((descriptor) => descriptor.state),
    [graphDescriptors],
  );

  const graphInputNodes = useMemo(
    () =>
      combinedGraphStates.flatMap((state) =>
        state.nodes.filter((node) => {
          if (!isGraphInputNode(node)) return false;
          const path = findParam(node, "path");
          return typeof path?.value === "string" && path.value.length > 0;
        }),
      ),
    [combinedGraphStates],
  );

  const inputRows: InputRow[] = useMemo(() => {
    return graphInputNodes.map((node) => {
      const valueParam = findParam(node, "value");
      const kind = (valueParam?.type as ValueKind) ?? "float";
      const defaultValue = valueParam?.value ?? defaultValueForKind(kind);
      const pathParam = findParam(node, "path");
      const path =
        typeof pathParam?.value === "string" && pathParam.value.length > 0
          ? pathParam.value
          : null;
      return {
        node,
        path,
        kind,
        defaultValue,
        meta: valueParam?.meta,
      };
    });
  }, [graphInputNodes]);

  const graphToggles = useMemo(
    () =>
      graphDescriptors.map((descriptor) => ({
        id: descriptor.id,
        label: descriptor.label,
        enabled: graphEnabledMap[descriptor.id] !== false,
        isPrimary: descriptor.isPrimary,
      })),
    [graphDescriptors, graphEnabledMap],
  );

  const setGraphEnabled = useCallback((graphId: string, enabled: boolean) => {
    setGraphEnabledMap((prev) => {
      if ((prev[graphId] ?? true) === enabled) {
        return prev;
      }
      return {
        ...prev,
        [graphId]: enabled,
      };
    });
  }, []);

  const outputNodes = useMemo(
    () =>
      graphState.nodes.filter((node) => node.type.toLowerCase() === "output"),
    [graphState.nodes],
  );

  useEffect(() => {
    setOutputOptionMap((prev) => {
      const validOptionIds = new Set(animatables.map((opt) => opt.optionId));
      const next: Record<string, string> = {};
      let changed = false;

      outputNodes.forEach((node) => {
        const existing = prev[node.id];
        if (existing && validOptionIds.has(existing)) {
          next[node.id] = existing;
          return;
        }
        const pathParam = findParam(node, "path");
        const graphPath =
          typeof pathParam?.value === "string" ? pathParam.value : null;
        if (graphPath) {
          const defaultOption = animatables.find(
            (opt) => opt.animId === graphPath,
          );
          if (defaultOption) {
            next[node.id] = defaultOption.optionId;
            if (defaultOption.optionId !== existing) {
              changed = true;
            }
            return;
          }
        }
        if (existing) {
          changed = true;
        }
      });

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [outputNodes, animatables]);

  useEffect(() => {
    if (!initialOutputMap) {
      return;
    }
    setOutputOptionMap((prev) => {
      const next: Record<string, string> = { ...prev };
      let mutated = false;
      Object.entries(initialOutputMap).forEach(([nodeId, animId]) => {
        if (!animId) {
          return;
        }
        const option =
          animatables.find(
            (candidate) => candidate.animId === animId && !candidate.component,
          ) || animatables.find((candidate) => candidate.animId === animId);
        if (!option) {
          return;
        }
        if (next[nodeId] !== option.optionId) {
          next[nodeId] = option.optionId;
          mutated = true;
        }
      });
      return mutated ? next : prev;
    });
  }, [initialOutputMap, animatables]);

  const outputRows: OutputRow[] = useMemo(() => {
    return outputNodes.map((node) => {
      const optionId = outputOptionMap[node.id] ?? null;
      const option = optionId
        ? (animatables.find((candidate) => candidate.optionId === optionId) ??
          null)
        : null;
      const pathParam = findParam(node, "path");
      const graphPath =
        typeof pathParam?.value === "string" ? pathParam.value : null;
      const components = componentsForKind(node.outputValueKind);
      const invalid = components.length > 1 && option?.component != null;
      const targetPath = option?.animId ?? graphPath ?? null;
      return {
        node,
        option,
        optionId,
        graphPath,
        targetPath,
        components,
        invalid,
      };
    });
  }, [animatables, outputNodes, outputOptionMap]);

  const primaryDescriptor = graphDescriptors[0];
  const primaryEnabled = primaryDescriptor
    ? graphEnabledMap[primaryDescriptor.id] !== false
    : false;
  const activeOutputRows = primaryEnabled ? outputRows : [];

  const enabledAdditionalDescriptors = graphDescriptors
    .slice(1)
    .filter(
      (descriptor) =>
        (graphEnabledMap[descriptor.id] ?? true) &&
        descriptor.state.nodes.length > 0,
    );

  const missingMappings = activeOutputRows.some((row) => !row.option);
  const invalidMappings = activeOutputRows.some((row) => row.invalid);
  const hasEnabledGraphs =
    (primaryEnabled && activeOutputRows.length > 0) ||
    enabledAdditionalDescriptors.length > 0;
  const buttonsDisabled =
    !hasEnabledGraphs ||
    (primaryEnabled && (missingMappings || invalidMappings));

  const targetPaths = useMemo(
    () =>
      Array.from(
        new Set(
          activeOutputRows
            .map((row) => row.targetPath)
            .filter(
              (path): path is string =>
                typeof path === "string" && path.length > 0,
            ),
        ),
      ),
    [activeOutputRows],
  );

  useEffect(() => {
    setInputValues((prev) => {
      let changed = false;
      const next: Record<string, any> = {};
      inputRows.forEach((row) => {
        if (!row.path) return;
        if (row.path in prev) {
          next[row.path] = prev[row.path];
        } else {
          next[row.path] = structuredClone(row.defaultValue);
          changed = true;
        }
      });
      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [inputRows]);

  const applyInputsToRuntime = useCallback(
    (rows: InputRow[], values: Record<string, any>) => {
      const visited = new Set<string>();
      rows.forEach((row) => {
        if (!row.path || visited.has(row.path)) return;
        const value = row.path in values ? values[row.path] : row.defaultValue;
        setInput(row.path, valueToJSON(row.kind, value));
        visited.add(row.path);
      });
    },
    [setInput],
  );

  useEffect(() => {
    if (primaryEnabled && activeOutputRows.length) {
      setStatus(null);
    }
  }, [activeOutputRows.length, primaryEnabled]);

  const summarizeOutputs = useCallback(
    () =>
      activeOutputRows
        .map(
          (row) =>
            row.option?.label ??
            row.option?.animId ??
            row.graphPath ??
            row.node.id,
        )
        .join(", "),
    [activeOutputRows],
  );

  const handleConnect = useCallback(async () => {
    if (!hasEnabledGraphs) {
      setStatus("Enable at least one graph before connecting.");
      return;
    }
    if (primaryEnabled) {
      if (!activeOutputRows.length) {
        setStatus(
          "Add at least one output node to the graph to connect controllers.",
        );
        return;
      }
      if (missingMappings) {
        setStatus(
          "Assign animatable targets to every graph output before connecting.",
        );
        return;
      }
      if (invalidMappings) {
        setStatus(
          "Vector outputs require the base animatable (not individual component slices).",
        );
        return;
      }
    }
    const registeredIds: string[] = [];
    try {
      await createOrchestrator();
      clearRegisteredGraphs();
      if (animationId) {
        removeAnimation(animationId);
        setAnimationId(null);
      }
      console.log("Registering animation", animationState);
      const animationConfig = animationStateToConfig(animationState);
      console.log("Registering animation config", animationConfig);
      const newAnimationId = registerAnimation(animationConfig);
      setAnimationId(newAnimationId);

      let primaryOutputPath =
        activeOutputRows[0]?.targetPath ??
        activeOutputRows[0]?.graphPath ??
        extractOutputPathFromState(graphState, "");

      if (!primaryOutputPath) {
        for (const descriptor of enabledAdditionalDescriptors) {
          const candidate = extractOutputPathFromState(descriptor.state, "");
          if (candidate) {
            primaryOutputPath = candidate;
            break;
          }
        }
      }

      if (primaryEnabled) {
        if (!primaryOutputPath) {
          setStatus("Primary graph requires at least one output path.");
          return;
        }
        const mappedGraph = applyOutputMappings(
          graphStateToSpec(graphState, primaryOutputPath),
          activeOutputRows,
          primaryOutputPath,
        );
        const preparedGraph = ensureGraphOutputs(
          mappedGraph,
          primaryOutputPath,
        );
        const primaryGraphId = registerGraph(preparedGraph);
        registeredIds.push(primaryGraphId);
      }

      enabledAdditionalDescriptors.forEach((descriptor) => {
        const fallbackPath = extractOutputPathFromState(
          descriptor.state,
          primaryOutputPath,
        );
        if (!fallbackPath) {
          return;
        }
        const prepared = ensureGraphOutputs(
          graphStateToSpec(descriptor.state, fallbackPath),
          fallbackPath,
        );
        const graphIdentifier = registerGraph(prepared);
        registeredIds.push(graphIdentifier);
      });

      setGraphIds(registeredIds);

      applyInputsToRuntime(inputRows, inputValues);
      setConnected(true);
      const enabledExtrasSummary = graphToggles
        .filter((toggle) => !toggle.isPrimary && toggle.enabled)
        .map((toggle) => toggle.label)
        .join(", ");
      if (primaryEnabled && activeOutputRows.length) {
        setStatus(`Connected outputs: ${summarizeOutputs()}`);
      } else {
        setStatus(
          enabledExtrasSummary
            ? `Connected graphs: ${enabledExtrasSummary}`
            : "Graphs connected",
        );
      }
    } catch (err) {
      if (registeredIds.length) {
        registeredIds.forEach((id) => removeGraph(id));
        setGraphIds([]);
      }
      console.error("demo-render-no-rig: orchestrator connect failed", err);
      setStatus(`Connect failed: ${(err as Error).message}`);
    }
  }, [
    animationState,
    animationId,
    applyInputsToRuntime,
    clearRegisteredGraphs,
    inputRows,
    createOrchestrator,
    graphState,
    inputValues,
    missingMappings,
    invalidMappings,
    hasEnabledGraphs,
    primaryEnabled,
    activeOutputRows,
    enabledAdditionalDescriptors,
    removeAnimation,
    registerAnimation,
    registerGraph,
    removeGraph,
    graphToggles,
    summarizeOutputs,
  ]);

  const handleUpdateControllers = useCallback(async () => {
    if (!connected) {
      handleConnect();
      return;
    }
    if (!hasEnabledGraphs) {
      setStatus("Enable at least one graph before updating.");
      return;
    }
    if (primaryEnabled) {
      if (!activeOutputRows.length) {
        setStatus(
          "Add at least one output node to the graph to connect controllers.",
        );
        return;
      }
      if (missingMappings) {
        setStatus(
          "Assign animatable targets to every graph output before updating.",
        );
        return;
      }
      if (invalidMappings) {
        setStatus(
          "Vector outputs require the base animatable (not component slices).",
        );
        return;
      }
    }
    const registeredIds: string[] = [];
    try {
      clearRegisteredGraphs();
      if (animationId) {
        removeAnimation(animationId);
      }
      const animationConfig = animationStateToConfig(animationState);
      const newAnimationId = registerAnimation(animationConfig);
      setAnimationId(newAnimationId);

      let primaryOutputPath =
        activeOutputRows[0]?.targetPath ??
        activeOutputRows[0]?.graphPath ??
        extractOutputPathFromState(graphState, "");

      if (!primaryOutputPath) {
        for (const descriptor of enabledAdditionalDescriptors) {
          const candidate = extractOutputPathFromState(descriptor.state, "");
          if (candidate) {
            primaryOutputPath = candidate;
            break;
          }
        }
      }

      if (primaryEnabled) {
        if (!primaryOutputPath) {
          setStatus("Primary graph requires at least one output path.");
          return;
        }
        const mappedGraph = applyOutputMappings(
          graphStateToSpec(graphState, primaryOutputPath),
          activeOutputRows,
          primaryOutputPath,
        );
        const preparedGraph = ensureGraphOutputs(
          mappedGraph,
          primaryOutputPath,
        );
        const primaryGraphId = registerGraph(preparedGraph);
        registeredIds.push(primaryGraphId);
      }

      enabledAdditionalDescriptors.forEach((descriptor) => {
        const fallbackPath = extractOutputPathFromState(
          descriptor.state,
          primaryOutputPath,
        );
        if (!fallbackPath) {
          return;
        }
        const prepared = ensureGraphOutputs(
          graphStateToSpec(descriptor.state, fallbackPath),
          fallbackPath,
        );
        const graphIdentifier = registerGraph(prepared);
        registeredIds.push(graphIdentifier);
      });

      setGraphIds(registeredIds);
      applyInputsToRuntime(inputRows, inputValues);
      setConnected(true);
      setStatus("Controllers updated");
    } catch (err) {
      if (registeredIds.length) {
        registeredIds.forEach((id) => removeGraph(id));
        setGraphIds([]);
      }
      console.error("demo-render-no-rig: orchestrator update failed", err);
      setStatus(`Update failed: ${(err as Error).message}`);
    }
  }, [
    animationState,
    animationId,
    applyInputsToRuntime,
    inputRows,
    connected,
    graphState,
    handleConnect,
    inputValues,
    invalidMappings,
    hasEnabledGraphs,
    primaryEnabled,
    activeOutputRows,
    enabledAdditionalDescriptors,
    clearRegisteredGraphs,
    missingMappings,
    registerAnimation,
    registerGraph,
    removeAnimation,
    removeGraph,
  ]);

  const handleDisconnect = useCallback(() => {
    clearRegisteredGraphs();
    if (animationId) {
      removeAnimation(animationId);
    }
    setAnimationId(null);
    setConnected(false);
    setStatus("Disconnected");
  }, [animationId, removeAnimation, clearRegisteredGraphs]);

  const currentMappingsSummary = outputRows
    .map((row) => row.option?.animId ?? row.graphPath ?? "–")
    .join(", ");

  const outputComponentsSummary = outputRows
    .map(
      (row) =>
        `${row.node.name ?? row.node.id}: ${row.components.join("/") || row.node.outputValueKind || "scalar"}`,
    )
    .join(" | ");

  const setOutputOption = useCallback(
    (nodeId: string, optionId: string | null) => {
      setOutputOptionMap((prev) => {
        const next = { ...prev };
        if (!optionId) {
          delete next[nodeId];
        } else {
          next[nodeId] = optionId;
        }
        return next;
      });
    },
    [],
  );

  const updateInputValue = useCallback(
    (path: string, kind: ValueKind, value: any) => {
      setInputValues((prev) => ({
        ...prev,
        [path]: value,
      }));
      if (connected) {
        setInput(path, valueToJSON(kind, value));
      }
    },
    [connected, setInput],
  );

  const logCurrentInputs = useCallback(() => {
    const entries = inputRows
      .filter((row) => row.path)
      .map((row) => {
        const path = row.path as string;
        const value =
          path in inputValues ? inputValues[path] : row.defaultValue;
        return { path, value };
      });

    if (!entries.length) {
      console.log("poses: [];");
      return;
    }

    const lines = entries.map(({ path, value }) => {
      let formatted: string;
      if (typeof value === "number") {
        formatted = Number(value).toString();
      } else if (typeof value === "string") {
        formatted = JSON.stringify(value);
      } else if (typeof value === "boolean") {
        formatted = value ? "true" : "false";
      } else {
        formatted = JSON.stringify(value);
      }
      return `  { path: "${path}", value: ${formatted} }`;
    });
    const payload = `poses: [\n${lines.join(",\n")}\n];`;
    console.log(payload);
  }, [inputRows, inputValues]);

  const contextValue = useMemo<OrchestratorBridgeContextValue>(
    () => ({
      ready,
      connected,
      status,
      animatables,
      outputRows,
      missingMappings,
      invalidMappings,
      buttonsDisabled,
      currentMappingsSummary,
      outputComponentsSummary,
      handleConnect,
      handleUpdateControllers,
      handleDisconnect,
      setOutputOption,
      inputRows,
      inputValues,
      updateInputValue,
      namespace,
      graphToggles,
      setGraphEnabled,
      logCurrentInputs,
    }),
    [
      animatables,
      buttonsDisabled,
      connected,
      currentMappingsSummary,
      handleConnect,
      handleDisconnect,
      handleUpdateControllers,
      inputRows,
      inputValues,
      invalidMappings,
      logCurrentInputs,
      missingMappings,
      namespace,
      outputComponentsSummary,
      outputRows,
      ready,
      graphToggles,
      setGraphEnabled,
      setOutputOption,
      status,
      updateInputValue,
    ],
  );

  return (
    <OrchestratorBridgeContext.Provider value={contextValue}>
      {children}
      {targetPaths.map((path) => (
        <OutputBridge
          key={path}
          namespace={namespace}
          path={path}
          connected={connected}
          setVizijValue={setVizijValue}
        />
      ))}
    </OrchestratorBridgeContext.Provider>
  );
}

export function OrchestratorPanel() {
  const {
    connected,
    status,
    animatables,
    outputRows,
    missingMappings,
    invalidMappings,
    buttonsDisabled,
    currentMappingsSummary,
    outputComponentsSummary,
    handleConnect,
    handleUpdateControllers,
    handleDisconnect,
    setOutputOption,
    graphToggles,
    setGraphEnabled,
    logCurrentInputs,
  } = useOrchestratorBridge();

  return (
    <>
      {graphToggles.length ? (
        <div className="graph-toggle-bar">
          <div className="graph-toggle-list">
            {graphToggles.map((toggle) => (
              <label key={toggle.id} className="graph-toggle-item">
                <input
                  type="checkbox"
                  checked={toggle.enabled}
                  onChange={(event) =>
                    setGraphEnabled(toggle.id, event.target.checked)
                  }
                />
                <span>{toggle.label}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-muted"
            onClick={logCurrentInputs}
          >
            Log rig inputs
          </button>
        </div>
      ) : null}
      <div className="graph-output-table">
        {missingMappings ? (
          <p className="bridge-note">
            Assign animatable targets to every output before connecting.
          </p>
        ) : null}

        <div className="bridge-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={buttonsDisabled}
          >
            Connect controllers
          </button>
          <button
            type="button"
            className="btn btn-muted"
            onClick={handleUpdateControllers}
            disabled={buttonsDisabled}
          >
            Apply changes
          </button>
          <button
            type="button"
            className="btn btn-muted"
            onClick={handleDisconnect}
            disabled={!connected}
          >
            Disconnect
          </button>
        </div>

        <div className="status-grid">
          <div>
            <span className="label">Outputs</span>
            <span>{outputRows.length}</span>
          </div>
          <div>
            <span className="label">Targets</span>
            <span>{currentMappingsSummary || "–"}</span>
          </div>
          <div>
            <span className="label">Shapes</span>
            <span>{outputComponentsSummary || "–"}</span>
          </div>
          <div>
            <span className="label">Status</span>
            <span>{status ?? "Waiting"}</span>
          </div>
        </div>

        {outputRows.map((row) => (
          <div key={row.node.id} className="graph-output-row">
            <div className="graph-output-row-header">
              <div>
                <strong>{row.node.name || row.node.id}</strong>
                <span className="graph-output-path">
                  Target:{" "}
                  {row.option?.animId ?? row.graphPath ?? "(select animatable)"}
                </span>
              </div>
              <div className="graph-output-tags">
                <span className="tag">
                  {row.node.outputValueKind ?? "scalar"}
                </span>
                {row.components.map((component) => (
                  <span key={component} className="tag tag-muted">
                    {component}
                  </span>
                ))}
              </div>
            </div>
            <select
              className="select-input"
              value={row.optionId ?? ""}
              onChange={(event) =>
                setOutputOption(row.node.id, event.target.value || null)
              }
            >
              <option value="">Select animatable…</option>
              {animatables.map((option) => (
                <option key={option.optionId} value={option.optionId}>
                  {option.group
                    ? `${option.group} • ${option.label}`
                    : option.label}
                </option>
              ))}
            </select>
            {row.invalid ? (
              <p className="bridge-warning">
                This output produces {row.components.join(", ")} – choose the
                base animatable instead of a component slice.
              </p>
            ) : null}
          </div>
        ))}
        {!outputRows.length ? (
          <p className="bridge-note">
            Add output nodes in the graph to expose controllable values.
          </p>
        ) : null}
      </div>
    </>
  );
}

export function OrchestratorInputsPanel() {
  const { inputRows, inputValues, updateInputValue } = useOrchestratorBridge();

  const hasInputs = inputRows.some((row) => row.path);

  if (!hasInputs) {
    return (
      <p className="bridge-note">
        Add input nodes to the graph to expose bridge controls.
      </p>
    );
  }

  return (
    <div className="orchestrator-inputs">
      {inputRows.map((row) => {
        if (!row.path) return null;
        const value =
          row.path in inputValues ? inputValues[row.path] : row.defaultValue;
        return (
          <label key={row.node.id}>
            <span>{row.path}</span>
            <ValueField
              kind={row.kind}
              value={value}
              onChange={(newValue) =>
                updateInputValue(row.path!, row.kind, newValue)
              }
              allowDynamicLength={row.kind === "vector"}
              options={
                row.meta &&
                typeof row.meta.min === "number" &&
                typeof row.meta.max === "number"
                  ? {
                      initialBounds: [row.meta.min, row.meta.max],
                      step: row.meta.step,
                    }
                  : row.meta?.step
                    ? { step: row.meta.step }
                    : undefined
              }
            />
          </label>
        );
      })}
    </div>
  );
}
