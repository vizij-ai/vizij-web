import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useOrchestrator,
  type GraphRegistrationConfig,
} from "@vizij/orchestrator-react";

import {
  poseRigGraphSpec,
  rigGraphSpec,
  type PoseRigConfig,
  poseRigConfiguration,
} from "../assets";

type GraphLike = {
  nodes?: Array<{
    id?: string;
    type?: string;
    params?: {
      path?: string;
    };
  }>;
};

function collectOutputPaths(spec: GraphLike): string[] {
  const paths = new Set<string>();
  (spec.nodes ?? []).forEach((node) => {
    if (typeof node !== "object" || !node) {
      return;
    }
    if (String(node.type ?? "").toLowerCase() !== "output") {
      return;
    }
    const path = node.params?.path;
    if (typeof path === "string" && path.trim().length > 0) {
      paths.add(path.trim());
    }
  });
  return Array.from(paths);
}

function collectInputPaths(spec: GraphLike): string[] {
  const paths = new Set<string>();
  (spec.nodes ?? []).forEach((node) => {
    if (typeof node !== "object" || !node) {
      return;
    }
    if (String(node.type ?? "").toLowerCase() !== "input") {
      return;
    }
    const path = node.params?.path;
    if (typeof path === "string" && path.trim().length > 0) {
      paths.add(path.trim());
    }
  });
  return Array.from(paths);
}

function collectInputPathMap(spec: GraphLike): Record<string, string> {
  const map: Record<string, string> = {};
  (spec.nodes ?? []).forEach((node) => {
    if (typeof node !== "object" || !node) {
      return;
    }
    if (String(node.type ?? "").toLowerCase() !== "input") {
      return;
    }
    const path = node.params?.path;
    if (typeof path !== "string" || path.trim().length === 0) {
      return;
    }
    const id = String(node.id ?? "");
    if (id.startsWith("input_")) {
      map[id.slice("input_".length)] = path.trim();
    } else {
      map[id] = path.trim();
    }
  });
  return map;
}

export function useRigBootstrap(faceId: string) {
  const {
    ready,
    createOrchestrator,
    registerMergedGraph,
    removeGraph,
    listControllers,
    setInput,
    normalizeGraphSpec,
  } = useOrchestrator();
  const [error, setError] = useState<string | null>(null);
  const registeredRef = useRef<{ merged?: string }>({});
  const stagedNeutralRef = useRef(false);

  useEffect(() => {
    if (ready) {
      return;
    }
    let cancelled = false;
    console.log("[fullscreen-face] orchestrator: requesting create");
    createOrchestrator({ schedule: "SinglePass" }).catch((err) => {
      if (!cancelled) {
        const message =
          err instanceof Error ? err.message : "Failed to create orchestrator.";
        setError(message);
        console.error("[fullscreen-face] orchestrator: create failed", err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, createOrchestrator]);

  const rigOutputs = useMemo(
    () => collectOutputPaths(rigGraphSpec as GraphLike),
    [],
  );
  const poseOutputs = useMemo(
    () => collectOutputPaths(poseRigGraphSpec as GraphLike),
    [],
  );
  const poseInputs = useMemo(
    () => collectInputPaths(poseRigGraphSpec as GraphLike),
    [],
  );
  const rigInputMap = useMemo(
    () => collectInputPathMap(rigGraphSpec as GraphLike),
    [],
  );

  const stageNeutralInputs = useCallback((force = false) => {
    if (stagedNeutralRef.current && !force) {
      return;
    }
    const staged = new Set<string>();
    // console.log("[fullscreen-face] orchestrator: staging neutral inputs");
    Object.entries(poseRigConfiguration.neutralInputs ?? {}).forEach(
      ([id, rawValue]) => {
        const path = rigInputMap[id];
        if (!path) {
          console.warn(
            "[fullscreen-face] orchestrator: neutral input missing path",
            id,
          );
          return;
        }
        const numeric =
          typeof rawValue === "number" && Number.isFinite(rawValue)
            ? rawValue
            : 0;
        setInput(path, { float: numeric });
        staged.add(path);
        // console.log(
        //   "[fullscreen-face] orchestrator: staged neutral",
        //   // id,
        //   // path,
        //   // numeric,
        // );
      },
    );
    Object.values(rigInputMap).forEach((path) => {
      if (!staged.has(path)) {
        console.log("[fullscreen-face] orchestrator: defaulting");
        setInput(path, { float: 0 });
      }
    });
    stagedNeutralRef.current = true;
    // console.log(
    //   "[fullscreen-face] orchestrator: staged neutral inputs",
    //   staged.size,
    //   "paths",
    // );
  }, [rigInputMap, setInput]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (registeredRef.current.merged) {
      return;
    }

    let cancelled = false;

    const register = async () => {
      try {
        const resolvedRigSpec =
          typeof normalizeGraphSpec === "function"
            ? await normalizeGraphSpec(rigGraphSpec as Record<string, unknown>)
            : rigGraphSpec;
        const resolvedPoseSpec =
          typeof normalizeGraphSpec === "function"
            ? await normalizeGraphSpec(
                poseRigGraphSpec as Record<string, unknown>,
              )
            : poseRigGraphSpec;

        console.log(
          "[fullscreen-face] orchestrator: registering merged rig graph",
        );
        const mergedId = await registerMergedGraph({
          id: `merged:${faceId}`,
          graphs: [
            {
              id: `rig:${faceId}`,
              spec: resolvedRigSpec as GraphRegistrationConfig["spec"],
              subs: {
                outputs: rigOutputs,
              },
            },
            {
              id: `pose:${faceId}`,
              spec: resolvedPoseSpec as GraphRegistrationConfig["spec"],
              subs: {
                inputs: poseInputs,
                outputs: poseOutputs,
              },
            },
          ],
          strategy: {
            outputs: "add",
            intermediate: "add",
          },
        });

        if (cancelled) {
          removeGraph(mergedId);
          return;
        }

        registeredRef.current.merged = mergedId;
        stagedNeutralRef.current = false;
        stageNeutralInputs();
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : "Failed to register rig graphs.";
        setError(message);
        console.error(
          "[fullscreen-face] orchestrator: registration failed",
          err,
        );
      }
    };

    register();

    return () => {
      cancelled = true;
      const { merged } = registeredRef.current;
      if (merged) {
        removeGraph(merged);
        registeredRef.current.merged = undefined;
      }
      console.log("[fullscreen-face] orchestrator: graphs removed");
      stagedNeutralRef.current = false;
    };
  }, [
    ready,
    faceId,
    poseInputs,
    poseOutputs,
    rigOutputs,
    registerMergedGraph,
    removeGraph,
    stageNeutralInputs,
    normalizeGraphSpec,
  ]);

  useEffect(() => {
    if (!ready || !registeredRef.current.merged) {
      return;
    }
    stageNeutralInputs();
  }, [ready, stageNeutralInputs]);

  const controllerSummary = useMemo(() => {
    try {
      const controllers = listControllers?.();
      if (!controllers) {
        return { graphs: 0, anims: 0 };
      }
      return {
        graphs: controllers.graphs.length,
        anims: controllers.anims.length,
      };
    } catch {
      return { graphs: 0, anims: 0 };
    }
  }, [listControllers, ready]);

  return {
    ready,
    error,
    outputPaths: rigOutputs,
    poseInputs,
    poseOutputs,
    controllers: controllerSummary,
    poseConfig: poseRigConfiguration as PoseRigConfig,
    stageNeutralInputs,
  };
}
