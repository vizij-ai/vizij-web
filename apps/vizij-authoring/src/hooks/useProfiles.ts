import { useCallback, useEffect, useMemo, useState } from "react";
import { profile, profiles, type ProfileSummary } from "@vizij/runtime";
import type { VizijBundleExtension, VizijBundleProfile } from "@vizij/render";
import { downloadJsonFile } from "../utils/fileIO";

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
 * Address a profile to one face.
 *
 * A profile file is portable — `vizij-bundle export-profile` writes the paths
 * unprefixed, because the vocabulary is the same for every face. The store is
 * not: a face's keys live under `rig/<faceId>/`. So an imported path picks up
 * this face's prefix unless it already carries one, which leaves a file that
 * was exported from a face alone.
 */
function addressToFace(
  profile: VizijBundleProfile,
  rigPrefix: string,
): VizijBundleProfile {
  if (!rigPrefix) {
    return profile;
  }
  return {
    ...profile,
    keys: profile.keys.map((key) =>
      key.path.startsWith("rig/")
        ? key
        : { ...key, path: `${rigPrefix}${key.path}` },
    ),
  };
}

/**
 * The profiles a face declares it speaks — the vocabularies its graphs are
 * authored against.
 *
 * A *profile* is a set of paths and their types; a *mapping* is the graph that
 * carries one profile's values onto another's. This hook owns the first.
 * Declaring one writes it into the bundle, so the vocabulary travels with the
 * asset exactly like any other authored input.
 *
 * Profiles arrive two ways, and the app treats them identically once declared:
 * from the shipped registry, or from a JSON file (`vizij-bundle export-profile
 * <id> -o <file>.json` writes one, but so can anyone). Both land in
 * `bundle.profiles`.
 *
 * The registry is compiled into `@vizij/runtime`'s wasm, so it grows by adding
 * an entry there and publishing — it is not fetched at runtime. `available` is
 * a plain list either way, so a remote registry would slot in behind it without
 * the callers changing.
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

  // The face's keys live under `rig/<faceId>/`, and an imported profile is
  // addressed to them.
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
   * Declare a profile from the shipped registry, addressed to this face.
   * Resolves to `null` for an unknown id.
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

  /**
   * Declare a profile from a JSON file, addressed to this face. Resolves to the
   * declared profile, or `null` when the file is not one.
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
          `${file.name} is not a profile — expected { id, version, keys: [{ path }] }`,
        );
        return null;
      }
      const entry = addressToFace(parsed, rigPrefix);
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

  /** Download a declared profile, verbatim — paths included, so it round-trips. */
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
    /** The profiles the registry offers, for the import picker. */
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
