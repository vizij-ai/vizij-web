import { useCallback, useRef, useState } from "react";
import { useAuthoringUiState } from "../state/AuthoringUiProvider";
import { prepareImport, type MorphTrianglesOutcome } from "./importPasses";

/**
 * The import passes the authoring UI has turned on, as one step every face
 * import runs before parsing, and the outcome of the latest import for the
 * import notice.
 */
export function useImportPasses() {
  const { optimizeMorphTriangles } = useAuthoringUiState();
  const [morphTriangles, setMorphTriangles] =
    useState<MorphTrianglesOutcome | null>(null);
  // Each import takes a ticket; only the latest one's result counts. The
  // passes run asynchronously (the first run fetches a wasm module), so an
  // earlier import can finish after a later one or after New.
  const latest = useRef(0);

  /**
   * The file to load in place of `file`, once the passes have run; `null`
   * when a later import or New superseded this one while the passes ran,
   * in which case the caller abandons the import.
   */
  const prepare = useCallback(
    async (file: File): Promise<File | null> => {
      const ticket = ++latest.current;
      const prepared = await prepareImport(file, { optimizeMorphTriangles });
      if (ticket !== latest.current) {
        return null;
      }
      setMorphTriangles(prepared.morphTriangles);
      return prepared.file;
    },
    [optimizeMorphTriangles],
  );

  /** Hides the notice; an import in progress is unaffected. */
  const dismissMorphTriangles = useCallback(() => setMorphTriangles(null), []);

  /** Abandons any import still in its passes and clears the notice (New). */
  const cancel = useCallback(() => {
    latest.current += 1;
    setMorphTriangles(null);
  }, []);

  return { prepare, morphTriangles, dismissMorphTriangles, cancel };
}
