import { useCallback, useState } from "react";
import { loadGLTFFromBlobWithBundle } from "@vizij/render";
import { DEFAULT_NAMESPACE } from "../utils/constants";

export interface SampleLoadFailure {
  url: string;
  filename: string;
  message: string;
}

interface UseSampleAssetLoaderOptions {
  clearLoaderError: () => void;
  loadFromFile: (
    file: File,
    loader: () => ReturnType<typeof loadGLTFFromBlobWithBundle>,
  ) => Promise<void>;
}

const QUORI_SAMPLE = {
  url: "/assets/Quori_Latest_Rigged.glb",
  filename: "Quori_Latest_Rigged.glb",
} as const;

const HUGO_SAMPLE = {
  url: "/assets/Hugo_Latest_Rigged.glb",
  filename: "Hugo_Latest_Rigged.glb",
} as const;

const FACE_EMPTY_CONFIGURED_SAMPLE = {
  url: "/assets/Face_Empty_Configured.glb",
  filename: "Face_Empty_Configured.glb",
} as const;

const FACE_LEGACY_RIGGED_POSED_SAMPLE = {
  url: "/assets/Face_Legacy_RiggedPosed.glb",
  filename: "Face_Legacy_RiggedPosed.glb",
} as const;

const FACE_LATEST_RIGGED_POSED_SAMPLE = {
  url: "/assets/Face_Latest_RiggedPosed.glb",
  filename: "Face_Latest_RiggedPosed.glb",
} as const;

/**
 * Manages sample face loading and recoverable sample-load failure state.
 * Keeping this flow in a dedicated hook keeps `App.tsx` focused on layout wiring.
 */
export function useSampleAssetLoader({
  clearLoaderError,
  loadFromFile,
}: UseSampleAssetLoaderOptions) {
  const [sampleLoadFailure, setSampleLoadFailure] =
    useState<SampleLoadFailure | null>(null);

  const loadSampleAssetFromUrl = useCallback(
    async (url: string, filename: string) => {
      clearLoaderError();
      setSampleLoadFailure(null);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch sample "${filename}" (${response.status} ${response.statusText}).`,
          );
        }
        const blob = await response.blob();
        const file = new File([blob], filename, { type: "model/gltf-binary" });

        await loadFromFile(file, () =>
          loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSampleLoadFailure({ url, filename, message });
      }
    },
    [clearLoaderError, loadFromFile],
  );

  const loadQuoriSample = useCallback(() => {
    void loadSampleAssetFromUrl(QUORI_SAMPLE.url, QUORI_SAMPLE.filename);
  }, [loadSampleAssetFromUrl]);

  const loadHugoSample = useCallback(() => {
    void loadSampleAssetFromUrl(HUGO_SAMPLE.url, HUGO_SAMPLE.filename);
  }, [loadSampleAssetFromUrl]);

  const loadEmptyConfiguredSample = useCallback(() => {
    void loadSampleAssetFromUrl(
      FACE_EMPTY_CONFIGURED_SAMPLE.url,
      FACE_EMPTY_CONFIGURED_SAMPLE.filename,
    );
  }, [loadSampleAssetFromUrl]);

  const loadLegacyRiggedPosedSample = useCallback(() => {
    void loadSampleAssetFromUrl(
      FACE_LEGACY_RIGGED_POSED_SAMPLE.url,
      FACE_LEGACY_RIGGED_POSED_SAMPLE.filename,
    );
  }, [loadSampleAssetFromUrl]);

  const loadLatestRiggedPosedSample = useCallback(() => {
    void loadSampleAssetFromUrl(
      FACE_LATEST_RIGGED_POSED_SAMPLE.url,
      FACE_LATEST_RIGGED_POSED_SAMPLE.filename,
    );
  }, [loadSampleAssetFromUrl]);

  const clearSampleLoadFailure = useCallback(() => {
    setSampleLoadFailure(null);
  }, []);

  return {
    sampleLoadFailure,
    loadSampleAssetFromUrl,
    loadQuoriSample,
    loadHugoSample,
    loadEmptyConfiguredSample,
    loadLegacyRiggedPosedSample,
    loadLatestRiggedPosedSample,
    clearSampleLoadFailure,
  };
}
