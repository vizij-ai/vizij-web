import { useCallback, useRef, useState } from "react";
import {
  useAuthoringUiState,
  type MorphTriangleCleanup,
} from "../state/AuthoringUiProvider";
import { prepareImport, type MorphTrianglesOutcome } from "./importPasses";

/** What the import notice shows about the latest import. */
export interface ImportNotice {
  /** The cleanup the import ran with. */
  cleanup: MorphTriangleCleanup;
  /** What the cleanup did; `null` when it was off. */
  outcome: MorphTrianglesOutcome | null;
}

/**
 * The import passes every face import runs before parsing, with the
 * cleanup the authoring UI has chosen, and what the import notice shows.
 * It keeps the file the latest import started from, before any pass
 * rewrote it, so that file can be imported again with another cleanup.
 */
export function useImportPasses() {
  const { morphTriangleCleanup } = useAuthoringUiState();
  const [notice, setNotice] = useState<ImportNotice | null>(null);
  const [original, setOriginal] = useState<File | null>(null);
  // Each import takes a ticket when it starts, before fetching or reading
  // anything; only the latest ticket's passes count. The passes run
  // asynchronously (the first run fetches a wasm module), so an earlier
  // import can finish after a later one has started.
  const latest = useRef(0);

  /**
   * Starts an import: its ticket, which supersedes every earlier one. The
   * previous import's notice goes at once, so its re-import buttons cannot
   * be used while this import is still fetching or running its passes.
   */
  const begin = useCallback(() => {
    setNotice(null);
    return ++latest.current;
  }, []);

  /**
   * The file to load in place of `file`, once the passes have run with
   * `cleanup` (the UI's choice when omitted); `null` when a later import
   * started while the passes ran, in which case the caller abandons this
   * one. A notice is shown when the cleanup ran, or when the cleanup was
   * chosen for this import (a re-import) even if off.
   */
  const prepare = useCallback(
    async (
      ticket: number,
      file: File,
      cleanup?: MorphTriangleCleanup,
    ): Promise<File | null> => {
      const chosen = cleanup ?? morphTriangleCleanup;
      const prepared = await prepareImport(file, { cleanup: chosen });
      if (ticket !== latest.current) {
        return null;
      }
      setOriginal(file);
      setNotice(
        chosen !== "off" || cleanup !== undefined
          ? { cleanup: chosen, outcome: prepared.morphTriangles }
          : null,
      );
      return prepared.file;
    },
    [morphTriangleCleanup],
  );

  /**
   * Hides the notice; an import in progress is unaffected. New needs no
   * call of its own: it remounts the session, this hook's state included.
   */
  const dismissMorphTriangles = useCallback(() => setNotice(null), []);

  return { begin, prepare, notice, original, dismissMorphTriangles };
}
