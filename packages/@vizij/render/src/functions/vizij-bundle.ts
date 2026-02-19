import type { Object3D } from "three";
import { cloneDeepSafe } from "@vizij/utils";
import type {
  VizijBundleExtension,
  VizijBundleExtractionResult,
} from "../types";
// @ts-ignore TS5097: node test loader resolves only explicit .ts specifiers.
import {
  collectVizijBundleCandidates,
  resolveVizijBundleCandidates,
} from "./gltf-loading/import-compat.ts";

function cloneBundle<T>(value: T): T {
  return cloneDeepSafe(value);
}

function collectObjectCandidates(object: Object3D) {
  const candidates: ReturnType<typeof collectVizijBundleCandidates> = [];
  const queue: Object3D[] = [object];
  let sourceIndex = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const userData =
      (current as any).userData && typeof (current as any).userData === "object"
        ? ((current as any).userData as Record<string, unknown>)
        : null;

    const gltfExtensions = userData?.gltfExtensions;
    if (gltfExtensions && typeof gltfExtensions === "object") {
      candidates.push(
        ...collectVizijBundleCandidates(
          gltfExtensions as Record<string, unknown>,
          "object",
          sourceIndex,
        ),
      );
      sourceIndex += 1;
    }

    const extensions = userData?.extensions;
    if (extensions && typeof extensions === "object") {
      candidates.push(
        ...collectVizijBundleCandidates(
          extensions as Record<string, unknown>,
          "object",
          sourceIndex,
        ),
      );
      sourceIndex += 1;
    }

    if (current.children && current.children.length > 0) {
      queue.push(...current.children);
    }
  }

  return candidates;
}

function collectParserCandidates(parserJson: unknown) {
  const candidates: ReturnType<typeof collectVizijBundleCandidates> = [];
  if (!parserJson || typeof parserJson !== "object") {
    return candidates;
  }

  const parser = parserJson as {
    nodes?: unknown[];
    scenes?: unknown[];
  };

  const nodes = Array.isArray(parser.nodes) ? parser.nodes : [];
  nodes.forEach((node, nodeIndex) => {
    const extensions =
      node && typeof node === "object" ? (node as any).extensions : null;
    if (extensions && typeof extensions === "object") {
      candidates.push(
        ...collectVizijBundleCandidates(
          extensions as Record<string, unknown>,
          "parser-node",
          nodeIndex,
        ),
      );
    }
  });

  const scenes = Array.isArray(parser.scenes) ? parser.scenes : [];
  scenes.forEach((scene, sceneIndex) => {
    const extensions =
      scene && typeof scene === "object" ? (scene as any).extensions : null;
    if (extensions && typeof extensions === "object") {
      candidates.push(
        ...collectVizijBundleCandidates(
          extensions as Record<string, unknown>,
          "parser-scene",
          sceneIndex,
        ),
      );
    }
  });

  return candidates;
}

export function extractVizijBundleResult(
  object: Object3D,
  parserJson?: unknown,
): VizijBundleExtractionResult {
  const candidates = [
    ...collectObjectCandidates(object),
    ...collectParserCandidates(parserJson),
  ];
  const result = resolveVizijBundleCandidates(candidates);

  return {
    ...result,
    bundle: result.bundle ? cloneBundle(result.bundle) : null,
  };
}

export function extractVizijBundle(
  object: Object3D,
  parserJson?: unknown,
): VizijBundleExtension | null {
  return extractVizijBundleResult(object, parserJson).bundle;
}

export function applyVizijBundle(
  object: Object3D,
  bundle: VizijBundleExtension | null,
): () => void {
  const userData =
    (object as any).userData && typeof (object as any).userData === "object"
      ? ((object as any).userData as Record<string, unknown>)
      : {};
  const originalExtensions = userData.gltfExtensions;
  let applied = false;

  if (bundle) {
    userData.gltfExtensions = {
      ...(originalExtensions ?? {}),
      VIZIJ_bundle: bundle,
    };
    (object as any).userData = userData;
    applied = true;
  }

  return () => {
    if (!applied) {
      return;
    }
    if (originalExtensions) {
      userData.gltfExtensions = originalExtensions;
    } else {
      if (userData.gltfExtensions) {
        delete userData.gltfExtensions;
      }
      if (Object.keys(userData).length === 0) {
        delete (object as any).userData;
      }
    }
    applied = false;
  };
}
