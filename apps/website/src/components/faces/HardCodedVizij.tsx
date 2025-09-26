import { RawValue, RawVector2 } from "@vizij/utils";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  createVizijStore,
  Group,
  loadGLTF,
  useVizijStore,
  VizijContext,
  Vizij,
} from "@vizij/render";

function InnerHardCodedVizij({
  glb,
  bounds,
  values,
}: {
  glb: string;
  bounds: {
    center: RawVector2;
    size: RawVector2;
  };
  values?: { name: string; value: RawValue }[];
}) {
  const [rootId, setRootId] = useState<string | undefined>("");

  const addWorldElements = useVizijStore((state) => state.addWorldElements);
  const setVal = useVizijStore((state) => state.setValue);
  const animatables = useVizijStore((state) => state.animatables);

  useEffect(() => {
    const loadVizij = async () => {
      const [loadedWorld, loadedAnimatables] = await loadGLTF(
        glb,
        ["default"],
        true,
        bounds,
      );
      const root = Object.values(loadedWorld).find(
        (e) => e.type === "group" && e.rootBounds,
      );
      addWorldElements(loadedWorld, loadedAnimatables, true);
      setRootId((root as Group | undefined)?.id);
      values?.forEach((v) => {
        const foundVal = Object.values(loadedAnimatables).find(
          (anim) => anim.name == v.name,
        );
        if (foundVal) {
          setVal(foundVal.id, "default", v.value);
        }
      });
    };

    loadVizij();
  }, [addWorldElements, bounds, glb, setVal, values]);

  useEffect(() => {
    values?.forEach((v) => {
      const foundVal = Object.values(animatables).find(
        (anim) => anim.name == v.name,
      );
      if (foundVal) {
        setVal(foundVal.id, "default", v.value);
      }
    });
  }, [animatables, setVal, values]);
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Vizij rootId={rootId ?? ""} namespace="default" />
    </Suspense>
  );
}

export function HardCodedVizij({
  glb,
  bounds,
  values,
}: {
  glb: string;
  bounds: {
    center: RawVector2;
    size: RawVector2;
  };
  values?: { name: string; value: RawValue }[];
}) {
  const hardCodedStore = useMemo(() => createVizijStore(), []);

  return (
    <>
      <VizijContext.Provider value={hardCodedStore}>
        <InnerHardCodedVizij glb={glb} bounds={bounds} values={values} />
      </VizijContext.Provider>
    </>
  );
}
