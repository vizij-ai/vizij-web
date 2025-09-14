import { useEffect, useState, useRef, useCallback } from "react";
import { RawValue, RawVector2 } from "@semio/utils";
import { Group, loadGLTF, useVizijStore } from "vizij";
import { useShallow } from "zustand/shallow";
import { VisemeRigMapping } from "../config/models";

export const useModelLoader = (
  glb: string,
  bounds: {
    center: RawVector2;
    size: RawVector2;
  },
  initialValues: { name: string; value: RawValue }[],
  search: { scale: string; morph: string },
) => {
  const [rigMapping, setRigMapping] = useState<VisemeRigMapping>({
    rootId: "",
    scaleId: "",
    morphId: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const loadedModelRef = useRef<string | null>(null);

  const addWorldElements = useVizijStore(
    useShallow((state) => state.addWorldElements),
  );
  const setVal = useVizijStore(useShallow((state) => state.setValue));

  // Create stable references for the parameters
  const boundsKey = `${bounds.center.x},${bounds.center.y},${bounds.size.x},${bounds.size.y}`;
  const initialValuesKey = JSON.stringify(initialValues);
  const searchKey = `${search.scale},${search.morph}`;
  const modelKey = `${glb}-${boundsKey}-${initialValuesKey}-${searchKey}`;

  const loadVizij = useCallback(async () => {
    // Prevent loading if already loading or if this exact model configuration is already loaded
    if (isLoading || loadedModelRef.current === modelKey) {
      return;
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

      const foundScale = Object.values(loadedAnimatables).find(
        (anim) => anim.name === search.scale,
      );
      const foundScaleId = foundScale?.id;
      const foundMorph = Object.values(loadedAnimatables).find(
        (anim) => anim.name === search.morph,
      );
      const foundMorphId = foundMorph?.id;

      setRigMapping({
        rootId: (root as Group | undefined)?.id ?? "",
        scaleId: foundScaleId ?? "",
        morphId: foundMorphId ?? "",
      });

      loadedModelRef.current = modelKey;
      setIsLoaded(true);
    } catch (error) {
      console.error("Failed to load model:", error);
    } finally {
      setIsLoading(false);
    }
  }, [
    glb,
    modelKey,
    addWorldElements,
    setVal,
    isLoading,
    search,
    bounds,
    initialValues,
  ]);

  useEffect(() => {
    // Only load if we haven't loaded this exact configuration before
    if (!isLoaded && !isLoading && loadedModelRef.current !== modelKey) {
      loadVizij();
    }
  }, [loadVizij, isLoaded, isLoading, modelKey]);

  return { rigMapping, isLoading, isLoaded };
};
