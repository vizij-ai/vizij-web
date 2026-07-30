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
      // The profile writes the face's namespaced standard controls, so it
      // takes the bundle's rig prefix — the same prefixing the deployed
      // runtime applies when composing the built-in.
      const faceId = bundle?.metadata?.faceId;
      const rigPrefix = faceId ? `rig/${faceId}/` : "";
      const spec = await standardProfile(profileId, rigPrefix);
      if (!spec) {
        console.error(`standard profile ${profileId} unavailable`);
        return;
      }
      // Mirrors the runtime bundler's graft: `{kind, id, spec}`, replacing
      // the entry with the same id if present, appending otherwise.
      const entry: VizijBundleGraphEntry = {
        id: embeddedProfileGraphId(profileId),
        kind: STANDARD_PROFILE_KIND,
        spec: spec as Record<string, unknown>,
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
    [bundle, updateBundle],
  );

  return { profiles, embeddedProfileIds, toggleProfile } as const;
}
