import { useCallback, useState } from "react";
import { useAuthoringUiState } from "../state/AuthoringUiProvider";
import { prepareImport, type MorphTrianglesOutcome } from "./importPasses";

/**
 * The import passes the authoring UI has turned on, as one step every face
 * import runs before parsing, and the outcome of the latest run for the
 * import notice.
 */
export function useImportPasses() {
  const { optimizeMorphTriangles } = useAuthoringUiState();
  const [morphTriangles, setMorphTriangles] =
    useState<MorphTrianglesOutcome | null>(null);

  /** The file to load in place of `file`, once the passes have run. */
  const prepare = useCallback(
    async (file: File): Promise<File> => {
      const prepared = await prepareImport(file, { optimizeMorphTriangles });
      setMorphTriangles(prepared.morphTriangles);
      return prepared.file;
    },
    [optimizeMorphTriangles],
  );

  const dismissMorphTriangles = useCallback(() => setMorphTriangles(null), []);

  return { prepare, morphTriangles, dismissMorphTriangles };
}
