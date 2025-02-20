import { Suspense, useEffect, useMemo, useState } from "react";
import { createVizijStore, useVizijStore, Vizij, VizijContext, Group, loadGLTF } from "vizij";
import Quori from "../assets/Quori.glb";
import { useShallow } from "zustand/shallow";

export function QuoriVizij() {
  // Hardcode the rootId for Quori
  const [rootId, setRootId] = useState<string | undefined>("");
  const [rootGroup, setRootGroup] = useState<Group | undefined>();

  const addWorldElements = useVizijStore(useShallow((state) => state.addWorldElements));
  const setSlots = useVizijStore(useShallow((state) => state.setSlots));

  useEffect(() => {
    const loadQuori = async () => {
      const [world, animatables] = await loadGLTF(Quori, ["default"], true, {
        center: {
          x: 0,
          y: 0,
        },
        size: {
          x: 0.5,
          y: 0.8,
        },
      });
      const root = Object.values(world).find((e) => e.type === "group" && e.rootBounds);
      addWorldElements(world, animatables, true);
      setRootId((root as Group | undefined)?.id);
      setRootGroup(root as Group | undefined);
    };

    loadQuori();
  }, []);

  return (
    <Suspense fallback={<div>Loading Quori...</div>}>
      {/* @ts-expect-error Async Server Component */}
      <Vizij rootId={rootId ?? ""} namespace="default" />
    </Suspense>
  );
}

export function QuoriVizijWithContext() {
  const quoriStore = useMemo(() => createVizijStore(), []);

  return (
    <>
      {/* @ts-expect-error Async Server Component */}
      <VizijContext.Provider value={quoriStore}>
        <QuoriVizij />
      </VizijContext.Provider>
    </>
  );
}
