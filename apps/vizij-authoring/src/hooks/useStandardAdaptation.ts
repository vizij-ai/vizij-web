import { useCallback, useMemo } from "react";
import type {
  VizijBundleExtension,
  VizijBundleGraphEntry,
  VizijBundleProfile,
} from "@vizij/render";
import { downloadJsonFile } from "../utils/fileIO";
import { buildEmptyAdaptationSpec } from "../utils/faceStandard";

/** The bundle graph kind a face's standard adaptation embeds under. */
export const STANDARD_ADAPTATION_KIND = "standard-adaptation";

/**
 * The bundle graph id the adaptation embeds under — stable per face, so
 * re-enabling replaces rather than duplicates. Mirrors the id the native
 * bundler grafts under (`vizij-bundle add-graph --kind standard-adaptation`).
 */
export function adaptationGraphId(faceId: string): string {
  return `${faceId}_standard_adaptation`;
}

/** Whether a bundle entry is a face's standard adaptation. */
export function isAdaptationEntry(entry: VizijBundleGraphEntry): boolean {
  return entry.kind === STANDARD_ADAPTATION_KIND;
}

interface UseStandardAdaptationOptions {
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
 * The face's standard adaptation: the graph that turns the Vizij face
 * standard's `standard/vizij/*` controls into this face's own pose weights.
 *
 * It is the last link in the chain a ROS4HRI command travels —
 * `standard/ros4hri/*` → the profile → `standard/vizij/*` → **here** → the
 * face's poses. A face without one still receives standard commands and does
 * nothing with them, which is why an export that omits it looks correct right
 * up until something tries to drive it.
 *
 * Unlike a standard *profile*, an adaptation has no canonical face-independent
 * form: it writes this face's own pose paths. It is stored and exported
 * verbatim, matching the shipped reference adaptation
 * (`fixtures/faces/quori/standard-adaptation.json` in vizij-rs), so an exported
 * file drops straight into `vizij-bundle add-graph`.
 */
export function useStandardAdaptation({
  bundle,
  updateBundle,
}: UseStandardAdaptationOptions) {
  // Bundle metadata is an open record, so the face id is narrowed here rather
  // than trusted — a bundle without one has no rig prefix and no stable id to
  // embed under, and the toggle refuses instead of writing a malformed entry.
  const faceId = useMemo(() => {
    const value = bundle?.metadata?.faceId;
    return typeof value === "string" && value ? value : null;
  }, [bundle]);

  const graphId = useMemo(
    () => (faceId ? adaptationGraphId(faceId) : null),
    [faceId],
  );

  const entry = useMemo(
    () => (bundle?.graphs ?? []).find(isAdaptationEntry) ?? null,
    [bundle],
  );

  const embedded = entry !== null;

  /** Graft `spec` in under the face's adaptation id — replace or append. */
  const embedSpec = useCallback(
    (spec: Record<string, unknown>) => {
      if (!graphId) {
        console.error("no faceId on the bundle, so no adaptation id to embed");
        return;
      }
      const next: VizijBundleGraphEntry = {
        id: graphId,
        kind: STANDARD_ADAPTATION_KIND,
        spec,
      };
      updateBundle((prev) => {
        if (!prev) {
          return prev;
        }
        const graphs = [...(prev.graphs ?? [])];
        const existing = graphs.findIndex(isAdaptationEntry);
        if (existing >= 0) {
          graphs[existing] = next;
        } else {
          graphs.push(next);
        }
        return { ...prev, graphs };
      });
    },
    [graphId, updateBundle],
  );

  /**
   * Add an adaptation for `profile` (every path it defines declared as an
   * input, nothing wired — the author binds them in the graph editor), or
   * remove the adaptation entirely.
   *
   * The profile is passed in rather than assumed: an adaptation maps *some*
   * profile onto this face, and which one is the author's choice. The profile
   * arrives already addressed to the face, so no prefixing happens here.
   */
  const toggleAdaptation = useCallback(
    (enabled: boolean, profile?: VizijBundleProfile) => {
      if (!enabled) {
        updateBundle((prev) => {
          if (!prev?.graphs) {
            return prev;
          }
          return {
            ...prev,
            graphs: prev.graphs.filter((graph) => !isAdaptationEntry(graph)),
          };
        });
        return;
      }
      if (!profile) {
        console.error("an adaptation needs a profile to map from");
        return;
      }
      embedSpec(
        buildEmptyAdaptationSpec(profile) as unknown as Record<string, unknown>,
      );
    },
    [embedSpec, updateBundle],
  );

  /**
   * Download the embedded adaptation as JSON, verbatim — the form
   * `vizij-bundle add-graph --kind standard-adaptation` reads back.
   */
  const exportAdaptationJson = useCallback(() => {
    if (!entry?.spec) {
      console.error("no embedded adaptation to export");
      return;
    }
    downloadJsonFile(entry.spec, `${graphId ?? "standard-adaptation"}.json`);
  }, [entry, graphId]);

  /** Replace the embedded adaptation from a JSON file, verbatim. */
  const importAdaptationJson = useCallback(
    async (file: File) => {
      let spec: { nodes?: unknown[]; edges?: unknown[] };
      try {
        spec = JSON.parse(await file.text());
      } catch (error) {
        console.error(`adaptation JSON ${file.name} does not parse`, error);
        return;
      }
      if (!Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) {
        console.error(`adaptation JSON ${file.name} is not a graph spec`);
        return;
      }
      embedSpec(spec as Record<string, unknown>);
    },
    [embedSpec],
  );

  return {
    /** Whether this face carries a standard adaptation. */
    embedded,
    /** The embedded entry, or `null`. */
    entry,
    /** The bundle graph id the adaptation embeds under, or `null`. */
    graphId,
    toggleAdaptation,
    exportAdaptationJson,
    importAdaptationJson,
    /** Replace the embedded spec in place (the graph editor's apply-back). */
    replaceAdaptationSpec: embedSpec,
  } as const;
}
