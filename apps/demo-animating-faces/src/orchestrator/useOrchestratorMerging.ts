import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrchestrator } from "@vizij/orchestrator-react";
import type { GraphRegistrationConfig } from "@vizij/orchestrator-react";

import { useAppState } from "../state/AppStateContext";
import type { GraphAsset, SimpleAnimationClip } from "../state/types";

export type RigInputDefinition = {
  path: string;
  uiPath: string;
  label: string;
  groupKey: string;
  groupLabel: string;
  defaultValue: unknown;
};

export type RigDefinition = {
  id: string;
  label: string;
  inputs: RigInputDefinition[];
  source: GraphAsset;
};

export type MergeWarnings = {
  namespaceViolations: Array<{ rigId: string; rigLabel: string; path: string }>;
  outputCollisions: Array<{
    path: string;
    sources: Array<{ rigId: string; rigLabel: string }>;
  }>;
  missingUiInputs: string[];
};

type MergeResult = {
  rigDefinitions: RigDefinition[];
  lowLevelDefinition: RigDefinition | null;
  uiInputPaths: string[];
  animationInputPaths: string[];
  mergedGraphSummary: { mergedId: string | null; graphIds: string[] };
  orchestratorError: string | null;
  warnings: MergeWarnings;
  graphConfigs: GraphRegistrationConfig[];
  renderOutputPaths: string[];
};

const INITIAL_WARNINGS: MergeWarnings = {
  namespaceViolations: [],
  outputCollisions: [],
  missingUiInputs: [],
};

function toLabel(path: string): string {
  const cleaned = path.replace(/_/g, " ");
  const parts = cleaned.split("/").filter(Boolean);
  if (!parts.length) {
    return path;
  }
  const last = parts[parts.length - 1] ?? path;
  return last
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveUiPath(rigId: string, path: string): string {
  const trimmed = path.startsWith("rig/")
    ? path.split("/").slice(2).join("/")
    : path;
  const normalised = trimmed.replace(/^\/+/, "");
  return `ui/${rigId}/${normalised}`;
}

function deriveGroup(path: string): { key: string; label: string } {
  const segments = path.split("/").filter(Boolean);
  let segment = segments[0] ?? "misc";
  if (segment === "rig" && segments.length >= 3) {
    segment = segments[2] ?? "misc";
  }
  const key = segment || "misc";
  return {
    key,
    label: toLabel(segment || "misc"),
  };
}

function normaliseGraphAsset(asset: GraphAsset): {
  nodes: any[];
  edges: any[];
} {
  const spec = asset.spec ?? {};
  const nodes = Array.isArray((spec as any).nodes)
    ? ((spec as any).nodes as any[])
    : [];
  const edges = Array.isArray((spec as any).edges)
    ? ((spec as any).edges as any[])
    : [];
  return { nodes, edges };
}

export function extractRigInputs(asset: GraphAsset): RigInputDefinition[] {
  const { nodes } = normaliseGraphAsset(asset);
  const inputs: RigInputDefinition[] = [];
  nodes.forEach((node: any) => {
    if (typeof node !== "object" || !node) {
      return;
    }
    const type = String(node.type ?? "").toLowerCase();
    if (type !== "input") {
      return;
    }
    const params = node.params ?? {};
    const path = typeof params.path === "string" ? params.path : null;
    if (!path) {
      return;
    }
    const defaultValue = params.value ?? null;
    const uiPath = deriveUiPath(asset.id, path);
    const group = deriveGroup(path);
    inputs.push({
      path,
      uiPath,
      label: toLabel(path),
      groupKey: group.key,
      groupLabel: group.label,
      defaultValue,
    });
  });
  const seen = new Set<string>();
  return inputs.filter((input) => {
    if (seen.has(input.path)) {
      return false;
    }
    seen.add(input.path);
    return true;
  });
}

function buildRigDefinitions(graphs: GraphAsset[]): RigDefinition[] {
  return graphs.map((graph) => ({
    id: graph.id,
    label: graph.label ?? graph.fileName ?? graph.id,
    inputs: extractRigInputs(graph),
    source: graph,
  }));
}

export function buildUiBridgeGraph(
  rig: RigDefinition,
): GraphRegistrationConfig | null {
  if (rig.inputs.length === 0) {
    return null;
  }
  const nodes: any[] = [];

  rig.inputs.forEach((input, index) => {
    const inputNodeId = `ui_${index}`;
    const outputNodeId = `out_${index}`;
    nodes.push({
      id: inputNodeId,
      type: "input",
      params: {
        path: input.uiPath,
        value: input.defaultValue ?? { float: 0 },
      },
    });
    nodes.push({
      id: outputNodeId,
      type: "output",
      params: { path: input.path },
      inputs: { in: inputNodeId },
    });
  });

  return {
    id: `graph:ui:${rig.id}`,
    spec: {
      nodes,
      edges: [],
    },
    subs: {
      inputs: rig.inputs.map((input) => input.uiPath),
      outputs: rig.inputs.map((input) => input.path),
    },
  } satisfies GraphRegistrationConfig;
}

export function buildAnimationBridgeGraph(
  clip: SimpleAnimationClip,
): GraphRegistrationConfig | null {
  if (!clip.tracks.length) {
    return null;
  }
  const nodes: any[] = [];

  clip.tracks.forEach((track, index) => {
    const inputNodeId = `anim_${index}`;
    const outputNodeId = `anim_out_${index}`;
    const inputPath = `animation/${clip.id}/${track.channel}`;
    const outputPath = track.channel;
    nodes.push({
      id: inputNodeId,
      type: "input",
      params: {
        path: inputPath,
        value: { float: 0 },
      },
    });
    nodes.push({
      id: outputNodeId,
      type: "output",
      params: { path: outputPath },
      inputs: { in: inputNodeId },
    });
  });

  return {
    id: `graph:anim:${clip.id}`,
    spec: {
      nodes,
      edges: [],
    },
    subs: {
      inputs: clip.tracks.map(
        (track) => `animation/${clip.id}/${track.channel}`,
      ),
      outputs: clip.tracks.map((track) => track.channel),
    },
  } satisfies GraphRegistrationConfig;
}

export function collectOutputPaths(asset: GraphAsset): string[] {
  const { nodes } = normaliseGraphAsset(asset);
  const outputs: string[] = [];
  nodes.forEach((node: any) => {
    if (typeof node !== "object" || !node) {
      return;
    }
    if (String(node.type ?? "").toLowerCase() !== "output") {
      return;
    }
    const params = node.params ?? {};
    const path = typeof params.path === "string" ? params.path : null;
    if (path) {
      outputs.push(path);
    }
  });
  return outputs;
}

function buildDebugGraph(paths: string[]): GraphRegistrationConfig | null {
  if (!paths.length) {
    return null;
  }
  const nodes: any[] = [];

  paths.forEach((path, index) => {
    const inputNodeId = `debug_in_${index}`;
    const outputNodeId = `debug_out_${index}`;
    nodes.push({
      id: inputNodeId,
      type: "input",
      params: { path },
    });
    nodes.push({
      id: outputNodeId,
      type: "output",
      params: { path: `debug/${path}` },
      inputs: { in: inputNodeId },
    });
  });

  return {
    id: "graph:debug",
    spec: { nodes, edges: [] },
    subs: {
      inputs: paths,
      outputs: paths.map((path) => `debug/${path}`),
    },
  };
}

function isRigNamespace(path: string): boolean {
  return path.startsWith("rig/");
}

export function useOrchestratorMerging(namespace: string): MergeResult {
  const { state } = useAppState();
  const { ready, normalizeGraphSpec, registerMergedGraph, removeGraph } =
    useOrchestrator();
  const [error, setError] = useState<string | null>(null);
  const [uiInputs, setUiInputs] = useState<string[]>([]);
  const [animationInputs, setAnimationInputs] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<MergeWarnings>(INITIAL_WARNINGS);
  const [graphConfigs, setGraphConfigs] = useState<GraphRegistrationConfig[]>(
    [],
  );
  const [mergedSummary, setMergedSummary] = useState<{
    mergedId: string | null;
    graphIds: string[];
  }>({
    mergedId: null,
    graphIds: [],
  });
  const [renderOutputs, setRenderOutputs] = useState<string[]>([]);
  const mergedIdRef = useRef<string | null>(null);

  const rigDefinitions = useMemo(
    () => buildRigDefinitions(state.highLevel),
    [state.highLevel],
  );
  const lowLevelDefinition = useMemo(() => {
    if (!state.lowLevel) {
      return null;
    }
    const [definition] = buildRigDefinitions([state.lowLevel]);
    return definition ?? null;
  }, [state.lowLevel]);

  const cleanup = useCallback(() => {
    if (mergedIdRef.current && removeGraph) {
      removeGraph(mergedIdRef.current);
      mergedIdRef.current = null;
    }
  }, [removeGraph]);

  useEffect(() => {
    if (!ready) {
      cleanup();
      return undefined;
    }
    let cancelled = false;

    const rebuild = async () => {
      cleanup();
      setError(null);
      setUiInputs([]);
      setAnimationInputs([]);
      setWarnings(INITIAL_WARNINGS);
      setGraphConfigs([]);
      setMergedSummary({ mergedId: null, graphIds: [] });
      setRenderOutputs([]);

      const lowLevel = state.lowLevel;
      if (!lowLevel) {
        return;
      }

      const selectedSet = new Set(state.selectedRigIds);
      const selectedRigs = rigDefinitions.filter((rig) =>
        selectedSet.has(rig.id),
      );

      const rigOutputs = new Map<string, string[]>();
      const namespaceViolations: MergeWarnings["namespaceViolations"] = [];
      const collisionAccumulator: Array<{
        path: string;
        rigId: string;
        rigLabel: string;
      }> = [];

      selectedRigs.forEach((rig) => {
        const outputs = collectOutputPaths(rig.source);
        rigOutputs.set(rig.id, outputs);
        outputs.forEach((path) => {
          collisionAccumulator.push({
            path,
            rigId: rig.id,
            rigLabel: rig.label,
          });
          if (!isRigNamespace(path)) {
            namespaceViolations.push({
              rigId: rig.id,
              rigLabel: rig.label,
              path,
            });
          }
        });
      });

      const collisionMap = new Map<
        string,
        Array<{ rigId: string; rigLabel: string }>
      >();
      collisionAccumulator.forEach(({ path, rigId, rigLabel }) => {
        if (!isRigNamespace(path)) {
          return;
        }
        const list = collisionMap.get(path) ?? [];
        if (!list.some((entry) => entry.rigId === rigId)) {
          list.push({ rigId, rigLabel });
        }
        collisionMap.set(path, list);
      });

      const outputCollisions = Array.from(collisionMap.entries())
        .filter(([, list]) => list.length > 1)
        .map(([path, sources]) => ({ path, sources }));

      const missingUiInputs = Array.from(
        new Set(
          [
            ...selectedRigs.flatMap((rig) =>
              rig.inputs.map((input) => input.uiPath),
            ),
            ...(lowLevelDefinition
              ? lowLevelDefinition.inputs.map((input) => input.uiPath)
              : []),
          ].filter((uiPath) => state.sliderValues[uiPath] === undefined),
        ),
      );

      try {
        const debugPathSet = new Set<string>();
        const lowLevelOutputs = Array.from(
          new Set(collectOutputPaths(lowLevel)),
        );
        lowLevelOutputs.forEach((path) => debugPathSet.add(path));
        setRenderOutputs(lowLevelOutputs);

        const graphs: GraphRegistrationConfig[] = [];

        const baseSpec = (await (normalizeGraphSpec
          ? normalizeGraphSpec(lowLevel.spec)
          : Promise.resolve(lowLevel.spec))) as Record<string, unknown>;
        graphs.push({ id: "graph:low-level", spec: baseSpec });

        const stagedUiInputs: string[] = [];
        const stagedAnimationInputs: string[] = [];

        if (lowLevelDefinition) {
          const lowLevelBridge = buildUiBridgeGraph(lowLevelDefinition);
          if (lowLevelBridge) {
            graphs.push(lowLevelBridge);
            stagedUiInputs.push(...(lowLevelBridge.subs?.inputs ?? []));
          }
        }

        for (const rig of selectedRigs) {
          const normalised = (await (normalizeGraphSpec
            ? normalizeGraphSpec(rig.source.spec)
            : Promise.resolve(rig.source.spec))) as Record<string, unknown>;
          graphs.push({ id: `graph:high:${rig.id}`, spec: normalised });
          const outputs = rigOutputs.get(rig.id) ?? [];
          outputs.forEach((path) => debugPathSet.add(path));
          const bridge = buildUiBridgeGraph(rig);
          if (bridge) {
            graphs.push(bridge);
            stagedUiInputs.push(...(bridge.subs?.inputs ?? []));
          }
        }

        state.animations.forEach((animation) => {
          const clipBridge = buildAnimationBridgeGraph(animation.clip);
          if (clipBridge) {
            graphs.push(clipBridge);
            stagedAnimationInputs.push(...(clipBridge.subs?.inputs ?? []));
          }
          animation.clip.tracks.forEach((track) => {
            if (isRigNamespace(track.channel)) {
              debugPathSet.add(track.channel);
            }
          });
        });

        const debugGraph = buildDebugGraph(Array.from(debugPathSet));
        if (debugGraph) {
          graphs.push(debugGraph);
        }

        if (graphs.length === 0) {
          return;
        }

        setGraphConfigs(graphs);

        const mergedId = await registerMergedGraph({
          id: `graph:${namespace}:merged`,
          graphs,
          strategy: {
            outputs: "blend",
            intermediate: "blend",
          },
        });

        if (cancelled) {
          if (removeGraph) {
            removeGraph(mergedId);
          }
          return;
        }

        mergedIdRef.current = mergedId;
        setUiInputs(stagedUiInputs);
        setAnimationInputs(stagedAnimationInputs);
        setMergedSummary({
          mergedId,
          graphIds: graphs.map((graph) => graph.id ?? "graph"),
        });
        setWarnings({
          namespaceViolations,
          outputCollisions,
          missingUiInputs,
        });
        setError(null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        console.error(
          "demo-animating-faces: failed to rebuild orchestrator",
          err,
        );
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    rebuild();

    return () => {
      cancelled = true;
      cleanup();
      setMergedSummary({ mergedId: null, graphIds: [] });
      setUiInputs([]);
      setAnimationInputs([]);
      setWarnings(INITIAL_WARNINGS);
      setGraphConfigs([]);
      setRenderOutputs([]);
    };
  }, [
    ready,
    state.lowLevel,
    state.selectedRigIds,
    state.animations,
    state.sliderValues,
    rigDefinitions,
    lowLevelDefinition,
    normalizeGraphSpec,
    registerMergedGraph,
    removeGraph,
    namespace,
    cleanup,
  ]);

  return {
    rigDefinitions,
    lowLevelDefinition,
    uiInputPaths: uiInputs,
    animationInputPaths: animationInputs,
    mergedGraphSummary: mergedSummary,
    orchestratorError: error,
    warnings,
    graphConfigs,
    renderOutputPaths: renderOutputs,
  };
}
