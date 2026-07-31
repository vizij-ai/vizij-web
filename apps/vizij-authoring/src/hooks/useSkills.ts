import { useCallback, useEffect, useMemo, useState } from "react";
import {
  skills as runtimeSkills,
  skillSource,
  type Skill,
} from "@vizij/runtime";
import type {
  VizijBundleExtension,
  VizijBundleGraphEntry,
} from "@vizij/render";
import { downloadJsonFile } from "../utils/fileIO";

/** The bundle graph kind under which a skill fragment embeds in a GLB. */
export const SKILL_KIND = "skill";

/**
 * The bundle graph id under which `skillId` embeds — stable, so re-import
 * replaces rather than duplicates (mirrors the runtime's `skill::<id>`).
 */
export function embeddedSkillGraphId(skillId: string): string {
  return `skill::${skillId}`;
}

/** The bare skill id of an embedded entry, `null` for other entries. */
export function embeddedSkillId(entry: VizijBundleGraphEntry): string | null {
  if (entry.kind !== SKILL_KIND) {
    return null;
  }
  const id = entry.id ?? "";
  return id.startsWith("skill::") ? id.slice("skill::".length) : id;
}

interface UseSkillsOptions {
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
 * The skills a face may pin (VIZ-96): the runtime's shipped registry — the
 * spawnable task-run behaviors behind the device's actions (e.g. the look_at
 * gaze skill on `/skill/look_at`) — and the toggle that embeds a skill's
 * fragment into the open GLB (under `skill::<id>`) or removes it. An embedded
 * copy is the face's pinned override of the deployed runtime's built-in
 * behavior. Unlike standard profiles, skill fragments are face-independent by
 * construction (their placeholder `task/*` paths are rewritten per run), so
 * there is no rig prefix to apply or strip and the embedded spec *is* the
 * canonical form.
 */
export function useSkills({ bundle, updateBundle }: UseSkillsOptions) {
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    let cancelled = false;
    runtimeSkills()
      .then((list) => {
        if (!cancelled) {
          setSkills(list);
        }
      })
      .catch((error) => {
        console.error("skills unavailable", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const embeddedSkillIds = useMemo(
    () =>
      (bundle?.graphs ?? [])
        .map(embeddedSkillId)
        .filter((id): id is string => id !== null),
    [bundle],
  );

  // Graft `spec` in as `skill::<skillId>` — replace-or-append, so re-import
  // updates in place.
  const embedSpec = useCallback(
    (skillId: string, spec: Record<string, unknown>) => {
      const entry: VizijBundleGraphEntry = {
        id: embeddedSkillGraphId(skillId),
        kind: SKILL_KIND,
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

  const toggleSkill = useCallback(
    async (skillId: string, enabled: boolean) => {
      if (!enabled) {
        updateBundle((prev) => {
          if (!prev?.graphs) {
            return prev;
          }
          return {
            ...prev,
            graphs: prev.graphs.filter(
              (graph) => embeddedSkillId(graph) !== skillId,
            ),
          };
        });
        return;
      }
      const spec = await skillSource(skillId);
      if (!spec) {
        console.error(`skill ${skillId} unavailable`);
        return;
      }
      embedSpec(skillId, spec as Record<string, unknown>);
    },
    [embedSpec, updateBundle],
  );

  /**
   * Download the embedded skill fragment as canonical JSON — the embedded
   * spec verbatim (fragments carry face-independent placeholder paths), so
   * the file is diffable against, and contributable to, the shipped
   * built-ins.
   */
  const exportSkillJson = useCallback(
    (skillId: string) => {
      const entry = (bundle?.graphs ?? []).find(
        (graph) => embeddedSkillId(graph) === skillId,
      );
      if (!entry?.spec) {
        console.error(`no embedded skill ${skillId} to export`);
        return;
      }
      downloadJsonFile(entry.spec, `${skillId}.json`);
    },
    [bundle],
  );

  /** Replace the embedded skill fragment from a canonical JSON file. */
  const importSkillJson = useCallback(
    async (skillId: string, file: File) => {
      let spec: { nodes?: unknown[]; edges?: unknown[] };
      try {
        spec = JSON.parse(await file.text());
      } catch (error) {
        console.error(`skill JSON ${file.name} does not parse`, error);
        return;
      }
      if (!Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) {
        console.error(`skill JSON ${file.name} is not a graph spec`);
        return;
      }
      embedSpec(skillId, spec as Record<string, unknown>);
    },
    [embedSpec],
  );

  return {
    skills,
    embeddedSkillIds,
    toggleSkill,
    exportSkillJson,
    importSkillJson,
    /** Replace an embedded skill's spec in place (the graph editor's
     * apply-back). */
    replaceSkillSpec: embedSpec,
  } as const;
}
