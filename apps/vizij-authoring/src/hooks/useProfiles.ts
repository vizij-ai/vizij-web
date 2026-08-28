import { useCallback, useEffect, useMemo, useState } from "react";
import { profile, profiles, type ProfileSummary } from "@vizij/runtime";
import type { VizijBundleExtension, VizijBundleProfile } from "@vizij/render";
import { downloadJsonFile } from "../utils/fileIO";

/**
 * The registry id of the Vizij face standard — the profile a face adaptation
 * maps from. Named here so the app has one place that knows it, rather than
 * the string appearing wherever an adaptation is created.
 */
export const FACE_PROFILE_ID = "vizij-face";

interface UseProfilesOptions {
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

/** Whether `value` has the shape of a profile, for JSON arriving from disk. */
function isProfile(value: unknown): value is VizijBundleProfile {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<VizijBundleProfile>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.version === "string" &&
    Array.isArray(candidate.keys) &&
    candidate.keys.every(
      (key) => key && typeof (key as { path?: unknown }).path === "string",
    )
  );
}

/**
 * The profiles a face declares it speaks — the vocabularies its graphs are
 * authored against.
 *
 * A *profile* is a set of paths and their types; a *mapping* is the graph that
 * carries one profile's values onto another's. This hook owns the first.
 * Importing one writes it into the bundle, so the vocabulary travels with the
 * asset exactly like any other authored input, and returns it so the caller can
 * put its paths in front of the author.
 *
 * The registry comes from `@vizij/runtime`, which serves the same assets the
 * native bundler embeds — no second copy of the vocabulary lives here.
 */
export function useProfiles({ bundle, updateBundle }: UseProfilesOptions) {
  const [available, setAvailable] = useState<ProfileSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    profiles()
      .then((list) => {
        if (!cancelled) {
          setAvailable(list);
        }
      })
      .catch((error) => {
        console.error("profile registry unavailable", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A profile's paths address this face's store, so they take the bundle's rig
  // prefix — the same prefix the runtime gives the controls a mapping writes.
  const rigPrefix = useMemo(() => {
    const faceId = bundle?.metadata?.faceId;
    return typeof faceId === "string" && faceId ? `rig/${faceId}/` : "";
  }, [bundle]);

  const declared = useMemo(() => bundle?.profiles ?? [], [bundle]);
  const declaredIds = useMemo(() => declared.map((p) => p.id), [declared]);

  /** Write `entry` into the bundle, replacing the profile of the same id. */
  const declare = useCallback(
    (entry: VizijBundleProfile) => {
      updateBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const next = [...(prev.profiles ?? [])];
        const existing = next.findIndex((p) => p.id === entry.id);
        if (existing >= 0) {
          next[existing] = entry;
        } else {
          next.push(entry);
        }
        return { ...prev, profiles: next };
      });
    },
    [updateBundle],
  );

  /**
   * Import a shipped profile: fetch it with this face's rig prefix applied,
   * declare it on the bundle, and hand it back so its paths can be offered to
   * the author. Resolves to `null` for an unknown id.
   */
  const importProfile = useCallback(
    async (id: string): Promise<VizijBundleProfile | null> => {
      const fetched = await profile(id, rigPrefix);
      if (!fetched) {
        console.error(`profile ${id} unavailable`);
        return null;
      }
      const entry = fetched as unknown as VizijBundleProfile;
      declare(entry);
      return entry;
    },
    [declare, rigPrefix],
  );

  /** Drop a declared profile from the face. Its authored graphs are untouched. */
  const removeProfile = useCallback(
    (id: string) => {
      updateBundle((prev) => {
        if (!prev?.profiles) {
          return prev;
        }
        return { ...prev, profiles: prev.profiles.filter((p) => p.id !== id) };
      });
    },
    [updateBundle],
  );

  /**
   * Declare a profile from a JSON file — a vocabulary that is not in the
   * shipped registry (a lab's own, or one pinned to a version). Stored
   * verbatim: a profile is face-specific once its paths carry a rig prefix, so
   * there is no canonical form to restore.
   */
  const importProfileJson = useCallback(
    async (file: File): Promise<VizijBundleProfile | null> => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch (error) {
        console.error(`profile JSON ${file.name} does not parse`, error);
        return null;
      }
      if (!isProfile(parsed)) {
        console.error(
          `profile JSON ${file.name} is not a profile ({ id, version, keys })`,
        );
        return null;
      }
      declare(parsed);
      return parsed;
    },
    [declare],
  );

  /** Download a declared profile, verbatim. */
  const exportProfileJson = useCallback(
    (id: string) => {
      const entry = declared.find((p) => p.id === id);
      if (!entry) {
        console.error(`no declared profile ${id} to export`);
        return;
      }
      downloadJsonFile(entry, `${id}.profile.json`);
    },
    [declared],
  );

  /** Every path a declared profile defines, or `[]` when it is not declared. */
  const profilePaths = useCallback(
    (id: string): string[] =>
      declared.find((p) => p.id === id)?.keys.map((key) => key.path) ?? [],
    [declared],
  );

  return {
    /** The profiles the registry ships, for the import picker. */
    available,
    /** The profiles this face declares. */
    declared,
    declaredIds,
    importProfile,
    importProfileJson,
    exportProfileJson,
    removeProfile,
    profilePaths,
  } as const;
}
