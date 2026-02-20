import { useCallback, useRef } from "react";
import type { ChangeEvent } from "react";
import {
  loadGLTFFromBlobWithBundle,
  type LoadedVizijAsset,
} from "@vizij/render";
import { DEFAULT_NAMESPACE } from "../utils/constants";

type LoadFromFile = (
  file: File,
  loader: () => Promise<LoadedVizijAsset>,
) => Promise<void>;

interface UseImportFileHandlersOptions {
  clearLoaderError: () => void;
  clearSampleLoadFailure: () => void;
  resetBundleSyncState: () => void;
  loadFromFile: LoadFromFile;
  setSkipDiscrepancyCheck: (value: boolean) => void;
  setReferenceFaceFile: (file: File) => void;
}

/**
 * Encapsulates hidden file-input and skip-check import flow wiring so app layout
 * components don't need to manage imperative input refs directly.
 */
export function useImportFileHandlers({
  clearLoaderError,
  clearSampleLoadFailure,
  resetBundleSyncState,
  loadFromFile,
  setSkipDiscrepancyCheck,
  setReferenceFaceFile,
}: UseImportFileHandlersOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceFaceFileInputRef = useRef<HTMLInputElement>(null);
  const skipNextDiscrepancyCheckRef = useRef(false);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      clearLoaderError();
      clearSampleLoadFailure();
      resetBundleSyncState();

      if (skipNextDiscrepancyCheckRef.current) {
        setSkipDiscrepancyCheck(true);
        skipNextDiscrepancyCheckRef.current = false;
      } else {
        setSkipDiscrepancyCheck(false);
      }

      await loadFromFile(file, () =>
        loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
      );
      event.target.value = "";
    },
    [
      clearLoaderError,
      clearSampleLoadFailure,
      loadFromFile,
      resetBundleSyncState,
      setSkipDiscrepancyCheck,
    ],
  );

  const handleImportClick = useCallback(() => {
    skipNextDiscrepancyCheckRef.current = false;
    fileInputRef.current?.click();
  }, []);

  const handleImportSkipChecksClick = useCallback(() => {
    skipNextDiscrepancyCheckRef.current = true;
    fileInputRef.current?.click();
  }, []);

  const handleReferenceFaceFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      setReferenceFaceFile(file);
      event.target.value = "";
    },
    [setReferenceFaceFile],
  );

  const handleImportReferenceFaceClick = useCallback(() => {
    referenceFaceFileInputRef.current?.click();
  }, []);

  return {
    fileInputRef,
    referenceFaceFileInputRef,
    handleFileChange,
    handleImportClick,
    handleImportSkipChecksClick,
    handleReferenceFaceFileChange,
    handleImportReferenceFaceClick,
  };
}
