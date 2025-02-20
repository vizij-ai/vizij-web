import { Suspense, useEffect, useMemo, useState } from "react";
import { createVizijStore, useVizijStore, Vizij, VizijContext, Group, loadGLTF } from "vizij";
import Abi from "../assets/Abi.glb";
import { useShallow } from "zustand/shallow";

export function AbiVizij() {
  // Hardcode the rootId for Abi
  const [rootId, setRootId] = useState<string | undefined>("");
  const [rootGroup, setRootGroup] = useState<Group | undefined>();

  const addWorldElements = useVizijStore(useShallow((state) => state.addWorldElements));
  const setSlots = useVizijStore(useShallow((state) => state.setSlots));

  useEffect(() => {
    const loadAbi = async () => {
      const [world, animatables] = await loadGLTF(Abi, ["default"], true, {
        center: {
          x: 0,
          y: 0,
        },
        size: {
          x: 2,
          y: 3,
        },
      });
      const root = Object.values(world).find((e) => e.type === "group" && e.rootBounds);
      addWorldElements(world, animatables, true);
      setRootId((root as Group | undefined)?.id);
      setRootGroup(root as Group | undefined);
    };

    loadAbi();
  }, []);

  return (
    <Suspense fallback={<div>Loading Abi...</div>}>
      {/* @ts-expect-error Async Server Component */}
      <Vizij rootId={rootId ?? ""} namespace="default" />
    </Suspense>
  );
}

export function AbiVizijWithContext() {
  const abiStore = useMemo(() => createVizijStore(), []);

  return (
    <>
      {/* @ts-expect-error Async Server Component */}
      <VizijContext.Provider value={abiStore}>
        <AbiVizij />
      </VizijContext.Provider>
    </>
  );
}
