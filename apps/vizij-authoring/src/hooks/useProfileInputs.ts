import { useCallback } from "react";
import { normalizeStandardRigInputPath } from "@vizij/utils";
import type { VizijBundleProfile } from "@vizij/render";
import { useBindingAuthoring } from "../state/RigControllerProvider";

/**
 * Turn a declared profile's paths into standard rig inputs.
 *
 * A profile is a set of paths and their types, and the rig's standard inputs
 * are exactly that — so importing one creates ordinary standard inputs rather
 * than a parallel structure. They then appear in Input Controls and group by
 * namespace in Std Feature Spaces because they *are* inputs, not because those
 * panels learned about profiles.
 *
 * They arrive unconnected. That is the point: an author needs to see a control
 * before binding it to a pose, and a profile's whole job is to say which
 * controls exist.
 */
export function useProfileInputs() {
  const createStandardInput = useBindingAuthoring(
    (state) => state.handleCreateCustomStandardInput,
  );
  const standardInputsByPath = useBindingAuthoring(
    (state) => state.standardInputsByPath,
  );

  /**
   * Create a standard input for each of `profile`'s paths that the rig does not
   * already carry, and report how many were added.
   *
   * Existing paths are skipped rather than re-created: the underlying entry
   * point de-duplicates by *id* and would otherwise mint `happy_2` on a
   * re-import, quietly doubling the control surface.
   */
  return useCallback(
    (profile: VizijBundleProfile): { added: number; existing: number } => {
      let added = 0;
      let existing = 0;
      for (const key of profile.keys) {
        // Standard inputs are keyed by the rig-relative path, so the face
        // prefix a declared profile carries is normalized away here.
        const normalized = normalizeStandardRigInputPath(key.path);
        if (standardInputsByPath.has(normalized)) {
          existing += 1;
          continue;
        }
        if (createStandardInput(normalized)) {
          added += 1;
        }
      }
      return { added, existing };
    },
    [createStandardInput, standardInputsByPath],
  );
}
