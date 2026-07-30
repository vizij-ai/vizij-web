import { useCallback, useEffect, useMemo, useState } from "react";
import {
  standardProfile,
  standardProfiles,
  type StandardProfile,
} from "@vizij/runtime";
import type {
  VizijBundleExtension,
  VizijBundleGraphEntry,
} from "@vizij/render";
import { downloadJsonFile } from "../utils/fileIO";

/** The bundle graph kind under which a standard profile embeds in a GLB. */
export const STANDARD_PROFILE_KIND = "standard-profile";

/**
 * The bundle graph id under which `profileId` embeds — stable, so re-import
 * replaces rather than duplicates (mirrors the runtime's `standard::<id>`).
 */
export function embeddedProfileGraphId(profileId: string): string {
  return `standard::${profileId}`;
}

/** The bare profile id of an embedded entry, `null` for other entries. */
export function embeddedProfileId(entry: VizijBundleGraphEntry): string | null {
  if (entry.kind !== STANDARD_PROFILE_KIND) {
    return null;
  }
  const id = entry.id ?? "";
  return id.startsWith("standard::") ? id.slice("standard::".length) : id;
}

/** A graph spec's nodes, loosely typed for the prefix transforms. */
interface SpecNode {
  type?: string;
  params?: { path?: string };
}

/**
 * The rig prefix applied to a profile spec's written control paths — the same
 * transform the runtime applies when composing or embedding (it prefixes only
 * `output` nodes' `params.path`). Returns a transformed copy.
 */
export function applyRigPrefix<T extends { nodes?: unknown[] }>(
  spec: T,
  rigPrefix: string,
): T {
  if (!rigPrefix) {
    return spec;
  }
  const clone = structuredClone(spec);
  for (const node of (clone.nodes ?? []) as SpecNode[]) {
    if (node.type === "output" && typeof node.params?.path === "string") {
      node.params.path = `${rigPrefix}${node.params.path}`;
    }
  }
  return clone;
}

/**
 * The inverse of {@link applyRigPrefix}: strips `rigPrefix` from `output`
 * nodes' written paths, restoring the canonical, face-independent profile
 * JSON — the form the built-ins ship in and a re-exported profile must be
 * contributed back in. Returns a transformed copy.
 */
export function stripRigPrefix<T extends { nodes?: unknown[] }>(
  spec: T,
  rigPrefix: string,
): T {
  if (!rigPrefix) {
    return spec;
  }
  const clone = structuredClone(spec);
  for (const node of (clone.nodes ?? []) as SpecNode[]) {
    if (
      node.type === "output" &&
      typeof node.params?.path === "string" &&
      node.params.path.startsWith(rigPrefix)
    ) {
      node.params.path = node.params.path.slice(rigPrefix.length);
    }
  }
  return clone;
}

interface UseStandardProfilesOptions {
  /** The open document's bundle — `null` while no face is loaded. */
  bundle: VizijBundleExtension | null;
  /** The loader's bundle updater (value or functional form). */
  updateBundle: (
    updater:
      | VizijBundleExtension
      | null
      | ((prev: VizijBundleExtension | null) => VizijBundleExtension | null),
  ) => void;
}

/**
 * The standard profiles a face may opt into (VIZ-92): the runtime's shipped
 * registry, and the toggle that imports a profile's graph into the open GLB
 * (embedded under `standard::<id>`, control paths rig-prefixed) or removes it.
 * An embedded copy overrides the deployed runtime's built-in mapping of the
 * same id; the authoring preview does not run it.
 */
export function useStandardProfiles({
  bundle,
  updateBundle,
}: UseStandardProfilesOptions) {
  const [profiles, setProfiles] = useState<StandardProfile[]>([]);

  useEffect(() => {
    let cancelled = false;
    standardProfiles()
      .then((list) => {
        if (!cancelled) {
          setProfiles(list);
        }
      })
      .catch((error) => {
        console.error("standard profiles unavailable", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const embeddedProfileIds = useMemo(
    () =>
      (bundle?.graphs ?? [])
        .map(embeddedProfileId)
        .filter((id): id is string => id !== null),
    [bundle],
  );

  // The profile writes the face's namespaced standard controls, so its
  // embedded copy takes the bundle's rig prefix — the same prefixing the
  // deployed runtime applies when composing the built-in.
  const rigPrefix = useMemo(() => {
    const faceId = bundle?.metadata?.faceId;
    return faceId ? `rig/${faceId}/` : "";
  }, [bundle]);

  // Graft `spec` in as `standard::<profileId>` — the runtime bundler's
  // replace-or-append, so re-import updates in place.
  const embedSpec = useCallback(
    (profileId: string, spec: Record<string, unknown>) => {
      const entry: VizijBundleGraphEntry = {
        id: embeddedProfileGraphId(profileId),
        kind: STANDARD_PROFILE_KIND,
        spec,
      };
      updateBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const graphs = [...(prev.graphs ?? [])];
        const existing = graphs.findIndex((graph) => graph.id === entry.id);
        if (existing >= 0) {
          graphs[existing] = entry;
        } else {
          graphs.push(entry);
        }
        return { ...prev, graphs };
      });
    },
    [updateBundle],
  );

  const toggleProfile = useCallback(
    async (profileId: string, enabled: boolean) => {
      if (!enabled) {
        updateBundle((prev) => {
          if (!prev?.graphs) {
            return prev;
          }
          return {
            ...prev,
            graphs: prev.graphs.filter(
              (graph) => embeddedProfileId(graph) !== profileId,
            ),
          };
        });
        return;
      }
      const spec = await standardProfile(profileId, rigPrefix);
      if (!spec) {
        console.error(`standard profile ${profileId} unavailable`);
        return;
      }
      embedSpec(profileId, spec as Record<string, unknown>);
    },
    [embedSpec, rigPrefix, updateBundle],
  );

  /**
   * Download the embedded profile as canonical JSON: the rig prefix applied
   * at import is stripped back out, so the file is face-independent —
   * diffable against, and contributable to, the shipped built-ins.
   */
  const exportProfileJson = useCallback(
    (profileId: string) => {
      const entry = (bundle?.graphs ?? []).find(
        (graph) => embeddedProfileId(graph) === profileId,
      );
      if (!entry?.spec) {
        console.error(`no embedded profile ${profileId} to export`);
        return;
      }
      const canonical = stripRigPrefix(
        entry.spec as { nodes?: unknown[] },
        rigPrefix,
      );
      downloadJsonFile(canonical, `${profileId}.json`);
    },
    [bundle, rigPrefix],
  );

  /**
   * Replace the embedded profile from a canonical (unprefixed) JSON file:
   * the rig prefix is applied on the way in, mirroring import-from-registry.
   */
  const importProfileJson = useCallback(
    async (profileId: string, file: File) => {
      let spec: { nodes?: unknown[]; edges?: unknown[] };
      try {
        spec = JSON.parse(await file.text());
      } catch (error) {
        console.error(`profile JSON ${file.name} does not parse`, error);
        return;
      }
      if (!Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) {
        console.error(`profile JSON ${file.name} is not a graph spec`);
        return;
      }
      embedSpec(
        profileId,
        applyRigPrefix(spec, rigPrefix) as Record<string, unknown>,
      );
    },
    [embedSpec, rigPrefix],
  );

  return {
    profiles,
    embeddedProfileIds,
    toggleProfile,
    exportProfileJson,
    importProfileJson,
    /** Replace an embedded profile's spec in place (e.g. from the graph
     * editor's apply-back). The spec is stored as given — already
     * rig-prefixed, like the embedded copy it replaces. */
    replaceProfileSpec: embedSpec,
  } as const;
}
