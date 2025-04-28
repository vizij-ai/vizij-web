import { RawValue, RawVector2 } from "@semio/utils";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createVizijStore, Group, loadGLTF, useVizijStore, VizijContext, Vizij } from "vizij";
import { useShallow } from "zustand/shallow";

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

  const addWorldElements = useVizijStore(useShallow((state) => state.addWorldElements));
  const setVal = useVizijStore(useShallow((state) => state.setValue));

  useEffect(() => {
    const loadVizij = async () => {
      const [world, animatables] = await loadGLTF(glb, ["default"], true, bounds);
      const root = Object.values(world).find((e) => e.type === "group" && e.rootBounds);
      addWorldElements(world, animatables, true);
      setRootId((root as Group | undefined)?.id);
      values?.forEach((v) => {
        const foundVal = Object.values(animatables).find((anim) => anim.name == v.name);
        if (foundVal) {
          setVal(foundVal.id, "default", v.value);
        }
      });
    };

    loadVizij();
  }, [bounds, glb, setVal, addWorldElements, values]);
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
