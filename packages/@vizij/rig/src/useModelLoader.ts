import { useEffect, useState, useRef, useCallback } from "react";
import { RawValue, RawVector2 } from "@vizij/utils";
import {
  Group,
  loadGLTF,
  useVizijStore,
  type VizijActions,
  type VizijData,
} from "@vizij/render";
import {
  VizijMouthRigDeprecated as VizijOldRigDeprecated,
  LowLevelRigDefinition,
  VizijLowRig,
} from "@vizij/config";

type VizijStore = VizijData & VizijActions;

const DEBUG = process.env.NODE_ENV !== "production";

export const useModelLoader = (
  glb: string,
  bounds: {
    center: RawVector2;
    size: RawVector2;
  },
  initialValues: { name: string; value: RawValue }[],
  rigDef: LowLevelRigDefinition,
) => {
  const [rigMapping, setRigMapping] = useState<VizijOldRigDeprecated>({
    rootId: "",
    scaleId: "",
    morphId: "",
    loadedAnimatables: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const loadedModelRef = useRef<string | null>(null);

  const addWorldElements = useVizijStore(
    (state: VizijStore) => state.addWorldElements,
  );
  const setVal = useVizijStore((state: VizijStore) => state.setValue);

  // Create stable references for the parameters
  const rigKey = JSON.stringify(rigDef);
  const modelKey = `${glb}-${rigKey}`;

  const loadVizij = useCallback(async () => {
    if (DEBUG) {
      console.log("useModelLoader - Loading model with key:", modelKey);
    }
    // Prevent loading if already loading or if this exact model configuration is already loaded
    if (isLoading || loadedModelRef.current === modelKey) {
      if (DEBUG) {
        console.log("useModelLoader - Skipping load:", {
          isLoading,
          loadedModel: loadedModelRef.current,
          modelKey,
        });
      }
      return;
    }

    if (DEBUG) {
      console.log("useModelLoader - Starting to load model...");
    }
    setIsLoading(true);

    try {
      const [loadedWorld, loadedAnimatables] = await loadGLTF(
        glb,
        ["default"],
        true,
        bounds,
      );
      const root = Object.values(loadedWorld).find(
        (e) => e.type === "group" && e.rootBounds,
      );
      addWorldElements(loadedWorld, loadedAnimatables, false);

      initialValues?.forEach((v: { name: string; value: RawValue }) => {
        const foundVal = Object.values(loadedAnimatables).find(
          (anim) => anim.name == v.name,
        );
        if (foundVal) {
          setVal(foundVal.id, "default", v.value);
        }
      });

      if (
        "mouth" in rigDef.channels &&
        "scale" in rigDef.channels.mouth.tracks &&
        "morph" in rigDef.channels.mouth.tracks
      ) {
        const foundScale = Object.values(loadedAnimatables).find(
          (anim) => anim.name === rigDef.channels.mouth.shapeKey + " scale",
        );
        const foundScaleId = foundScale?.id;
        const foundMorph = Object.values(loadedAnimatables).find(
          (anim) =>
            anim.name ===
            rigDef.channels.mouth.shapeKey +
              " Key " +
              rigDef.channels.mouth.tracks.morph.key,
        );
        const foundMorphId = foundMorph?.id;

        setRigMapping({
          rootId: (root as Group | undefined)?.id ?? "",
          scaleId: foundScaleId ?? "",
          morphId: foundMorphId ?? "",
          loadedAnimatables,
        });

        loadedModelRef.current = modelKey;
        setIsLoaded(true);
      } else {
        console.error(
          "Rig definition must include 'mouth' channel with 'scale' and 'morph' tracks.",
        );
      }
    } catch (error) {
      console.error("Failed to load model:", error);
    } finally {
      setIsLoading(false);
    }
  }, [glb, modelKey, addWorldElements, setVal, rigDef, bounds, initialValues]); // REMOVED isLoading from dependencies

  useEffect(() => {
    // Only load if we haven't loaded this exact configuration before
    if (!isLoaded && !isLoading && loadedModelRef.current !== modelKey) {
      loadVizij();
    }
  }, [loadVizij, isLoaded, isLoading, modelKey]);

  return { rigMapping, isLoading, isLoaded };
};

export const useRiggedModelLoader = (
  glb: string,
  rigDef: LowLevelRigDefinition,
) => {
  const debug = DEBUG;
  const [rig, setRig] = useState<VizijLowRig>();

  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const loadedModelRef = useRef<string | null>(null);
  const loadedModelsRef = useRef<Set<string>>(new Set());

  const addWorldElements = useVizijStore(
    (state: VizijStore) => state.addWorldElements,
  );
  const setVal = useVizijStore((state: VizijStore) => state.setValue);

  // Create stable references for the parameters
  const rigKey = JSON.stringify(rigDef);
  const modelKey = `${glb}-${rigKey}`;

  const loadVizij = useCallback(async () => {
    if (debug) {
      console.log("useRiggedModelLoader - Loading model with key:", modelKey);
    }

    // Check if this exact model configuration is already loaded or loading
    if (loadedModelsRef.current.has(modelKey)) {
      if (debug) {
        console.log(
          "useRiggedModelLoader - Model already processed:",
          modelKey,
        );
      }
      return;
    }

    if (isLoading) {
      if (debug) {
        console.log(
          "useRiggedModelLoader - Already loading, skipping:",
          modelKey,
        );
      }
      return;
    }

    // Mark as being loaded
    loadedModelsRef.current.add(modelKey);
    if (debug) {
      console.log("useRiggedModelLoader - Starting to load model...");
    }
    setIsLoading(true);

    try {
      const [loadedWorld, loadedAnimatables] = await loadGLTF(
        glb,
        ["default"],
        true,
        rigDef.bounds,
      );
      const root = Object.values(loadedWorld).find(
        (e) => e.type === "group" && e.rootBounds,
      );
      addWorldElements(loadedWorld, loadedAnimatables, false);
      if (debug) {
        console.log("useRiggedModelLoader - Model loaded successfully:", glb);
      }
      rigDef.initialValues?.forEach((v: { name: string; value: RawValue }) => {
        const foundVal = Object.values(loadedAnimatables).find(
          (anim) => anim.name == v.name,
        );
        if (foundVal) {
          setVal(foundVal.id, "default", v.value);
        }
      });

      setRig(
        new VizijLowRig({
          name: glb,
          rootId: (root as Group | undefined)?.id ?? "",
          rig: rigDef,
          animatables: loadedAnimatables,
          applyFunc: setVal,
        }),
      );

      loadedModelRef.current = modelKey;
      setIsLoaded(true);
    } catch (error) {
      // Remove from set if loading failed
      loadedModelsRef.current.delete(modelKey);
      console.error("Failed to load model:", error);
    } finally {
      setIsLoading(false);
    }
  }, [glb, modelKey, addWorldElements, setVal, rigDef]); // REMOVED isLoading from dependencies

  useEffect(() => {
    // Only load if we haven't loaded this exact configuration before
    if (!isLoaded && !isLoading && loadedModelRef.current !== modelKey) {
      loadVizij();
    }
  }, [loadVizij, isLoaded, isLoading, modelKey]);

  return { rig, isLoading, isLoaded };
};
