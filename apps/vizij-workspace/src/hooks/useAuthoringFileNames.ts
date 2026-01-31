import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_GRAPH_FILE_NAME = "rig.graph.json";
const DEFAULT_EXPORT_FILE_NAME = "face.glb";

interface UseAuthoringFileNamesOptions {
  faceId: string | null;
  defaults?: {
    graph?: string;
    glb?: string;
  };
}

/**
 * Centralizes state for the graph/GLB file names so we can keep the UX
 * responsive while resetting to sensible defaults whenever the active face
 * changes.
 */
export function useAuthoringFileNames({
  faceId,
  defaults,
}: UseAuthoringFileNamesOptions) {
  const defaultGraphName = defaults?.graph ?? DEFAULT_GRAPH_FILE_NAME;
  const defaultExportName = defaults?.glb ?? DEFAULT_EXPORT_FILE_NAME;

  const [graphFileName, setGraphFileName] = useState(defaultGraphName);
  const [exportFileName, setExportFileName] = useState(defaultExportName);

  const prevFaceIdRef = useRef<string | null>(null);
  const graphTouchedRef = useRef(false);
  const exportTouchedRef = useRef(false);

  useEffect(() => {
    const didFaceChange = prevFaceIdRef.current !== faceId;
    if (didFaceChange) {
      prevFaceIdRef.current = faceId;
      graphTouchedRef.current = false;
      exportTouchedRef.current = false;
    }

    if (!graphTouchedRef.current && graphFileName !== defaultGraphName) {
      setGraphFileName(defaultGraphName);
    }
    if (!exportTouchedRef.current && exportFileName !== defaultExportName) {
      setExportFileName(defaultExportName);
    }
  }, [
    faceId,
    graphFileName,
    exportFileName,
    defaultGraphName,
    defaultExportName,
  ]);

  const handleGraphFileNameChange = useCallback((value: string) => {
    graphTouchedRef.current = true;
    setGraphFileName(value);
  }, []);

  const handleExportFileNameChange = useCallback((value: string) => {
    exportTouchedRef.current = true;
    setExportFileName(value);
  }, []);

  return {
    graphFileName,
    exportFileName,
    handleGraphFileNameChange,
    handleExportFileNameChange,
  } as const;
}
