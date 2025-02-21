import { RawVector2 } from "@semio/utils";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createVizijStore, Group, loadGLTF, useVizijStore, VizijContext, Vizij } from "vizij";
import { useShallow } from "zustand/shallow";

function InnerHardCodedVizij({
  glb,
  bounds,
}: {
  glb: string;
  bounds: {
    center: RawVector2;
    size: RawVector2;
  };
}) {
  const [rootId, setRootId] = useState<string | undefined>("");

  const addWorldElements = useVizijStore(useShallow((state) => state.addWorldElements));

  useEffect(() => {
    const loadVizij = async () => {
      const [world, animatables] = await loadGLTF(glb, ["default"], true, bounds);
      const root = Object.values(world).find((e) => e.type === "group" && e.rootBounds);
      addWorldElements(world, animatables, true);
      setRootId((root as Group | undefined)?.id);
    };

    loadVizij();
  }, []);
  return (
    <Suspense fallback={<div>Loading...</div>}>
      {/* @ts-expect-error Async Server Component */}
      <Vizij rootId={rootId ?? ""} namespace="default" />
    </Suspense>
  );
}

export function HardCodedVizij({
  glb,
  bounds,
}: {
  glb: string;
  bounds: {
    center: RawVector2;
    size: RawVector2;
  };
}) {
  const hardCodedStore = useMemo(() => createVizijStore(), []);

  return (
    <>
      {/* @ts-expect-error Async Server Component */}
      <VizijContext.Provider value={hardCodedStore}>
        <InnerHardCodedVizij glb={glb} bounds={bounds} />
      </VizijContext.Provider>
    </>
  );
}
