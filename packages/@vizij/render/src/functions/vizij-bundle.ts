import { Object3D } from "three";
import type { VizijBundleExtension } from "../types";

const BUNDLE_KEYS = ["VIZIJ_bundle"];

function cloneBundle<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readExtensionValue(extensionContainer: Record<string, unknown>) {
  for (const key of BUNDLE_KEYS) {
    if (
      extensionContainer &&
      Object.prototype.hasOwnProperty.call(extensionContainer, key)
    ) {
      const value = extensionContainer[key];
      if (value && typeof value === "object") {
        return { key, value };
      }
    }
  }
  return null;
}

function searchObjectForBundle(object: Object3D): VizijBundleExtension | null {
  const stack: Object3D[] = [object];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const extensions =
      (current as any)?.userData?.gltfExtensions ??
      (current as any)?.userData?.extensions ??
      null;
    if (extensions && typeof extensions === "object") {
      const match = readExtensionValue(extensions as Record<string, unknown>);
      if (match) {
        // console.info("[vizij-render] Extracted VIZIJ bundle from Object3D.", {
        //   key: match.key,
        //   objectName: current.name,
        // });
        return cloneBundle(match.value) as VizijBundleExtension;
      }
    }
    if (current.children && current.children.length > 0) {
      stack.push(...current.children);
    }
  }
  return null;
}

function searchParserJsonForBundle(
  parserJson: any,
): VizijBundleExtension | null {
  if (!parserJson || typeof parserJson !== "object") {
    return null;
  }

  const nodes = Array.isArray(parserJson.nodes) ? parserJson.nodes : [];
  for (const node of nodes) {
    const extensions =
      node && typeof node === "object" ? (node as any).extensions : null;
    if (extensions && typeof extensions === "object") {
      const match = readExtensionValue(extensions as Record<string, unknown>);
      if (match) {
        // console.info("[vizij-render] Extracted VIZIJ bundle from parser JSON node.", {
        //   key: match.key,
        //   nodeName: (node as any).name ?? null,
        // });
        return cloneBundle(match.value) as VizijBundleExtension;
      }
    }
  }

  const scenes = Array.isArray(parserJson.scenes) ? parserJson.scenes : [];
  for (const scene of scenes) {
    const extensions =
      scene && typeof scene === "object" ? (scene as any).extensions : null;
    if (extensions && typeof extensions === "object") {
      const match = readExtensionValue(extensions as Record<string, unknown>);
      if (match) {
        // console.info("[vizij-render] Extracted VIZIJ bundle from parser JSON scene.", {
        //   key: match.key,
        //   sceneName: (scene as any).name ?? null,
        // });
        return cloneBundle(match.value) as VizijBundleExtension;
      }
    }
  }

  return null;
}

export function extractVizijBundle(
  object: Object3D,
  parserJson?: unknown,
): VizijBundleExtension | null {
  const fromObject = searchObjectForBundle(object);
  if (fromObject) {
    return fromObject;
  }

  const fromParser = searchParserJsonForBundle(parserJson);
  if (fromParser) {
    return fromParser;
  }

  return null;
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
