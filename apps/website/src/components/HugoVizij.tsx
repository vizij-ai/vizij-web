import { Suspense, useEffect, useMemo, useState } from "react";
import { createVizijStore, useVizijStore, Vizij, VizijContext, Group, loadGLTF } from "vizij";
import Hugo from "../assets/Hugo.glb";
import { useShallow } from "zustand/shallow";

export function HugoVizij() {
  // Hardcode the rootId for Hugo
  const [rootId, setRootId] = useState<string | undefined>("");
  const [rootGroup, setRootGroup] = useState<Group | undefined>();

  const addWorldElements = useVizijStore(useShallow((state) => state.addWorldElements));
  const setSlots = useVizijStore(useShallow((state) => state.setSlots));

  useEffect(() => {
    const loadHugo = async () => {
      console.log(Hugo);
      const [world, animatables] = await loadGLTF(Hugo, ["default"], true, {
        center: {
          x: 0,
          y: 0,
        },
        size: {
          x: 5,
          y: 6,
        },
      });
      const root = Object.values(world).find((e) => e.type === "group" && e.rootBounds);
      addWorldElements(world, animatables, true);
      setRootId((root as Group | undefined)?.id);
      setRootGroup(root as Group | undefined);
    };

    loadHugo();
  }, []);

  const HugoMaterials = [
    {
      displayAs: "Outer Eye Color",
      name: "Black_S",
    },
    {
      displayAs: "Inner Eye Color",
      name: "White_S",
    },
    {
      displayAs: "Cheek Color",
      name: "Pink_S",
    },
    {
      displayAs: "Face Color",
      name: "Blue_BG_S",
    },
  ];

  const HugoControllables = [
    {
      displayAs: "Face",
      name: "Circle",
    },
    {
      displayAs: "Left Eye (Face perspective)",
      name: "L_Eye",
    },
    {
      displayAs: "Right Eye (Face perspective)",
      name: "R_Eye",
    },
    {
      displayAs: "Mouth",
      name: "Mouth",
    },
  ];

  const HugoAnimatables = [
    {
      displayAs: "Left Eyelid",
      name: "Plane 006",
    },
  ];

  // return (
  //   <>
  //     <VizijFromGLB file={HugoGLB} materials={HugoMaterials} controls={HugoControllables} />
  //     <div>
  //       <ColorControls materials={HugoMaterials} />
  //       <MovementControls controls={HugoControllables} />
  //       <AnimationControls morphables={HugoAnimatables} />
  //     </div>
  //   </>
  // );

  return (
    <Suspense fallback={<div>Loading Hugo...</div>}>
      {/* @ts-expect-error Async Server Component */}
      <Vizij rootId={rootId ?? ""} namespace="default" />
    </Suspense>
  );
}

export function HugoVizijWithContext() {
  const hugoStore = useMemo(() => createVizijStore(), []);

  return (
    <>
      {/* @ts-expect-error Async Server Component */}
      <VizijContext.Provider value={hugoStore}>
        <HugoVizij />
      </VizijContext.Provider>
    </>
  );
}
