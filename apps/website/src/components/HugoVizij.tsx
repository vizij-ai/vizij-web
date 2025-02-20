import { Suspense, useEffect, useMemo, useState } from "react";
import {
  createVizijStore,
  useVizijStore,
  Vizij,
  VizijContext,
  Group,
  loadGLTF,
  Controller,
} from "vizij";
import Hugo from "../assets/Hugo.glb";
import { useShallow } from "zustand/shallow";

export function HugoVizij() {
  // Hardcode the rootId for Hugo
  const [rootId, setRootId] = useState<string | undefined>("");
  const [rootGroup, setRootGroup] = useState<Group | undefined>();

  const addWorldElements = useVizijStore(useShallow((state) => state.addWorldElements));
  const world = useVizijStore(useShallow((state) => state.world));
  const activeAnimatables = useVizijStore(useShallow((state) => state.animatables));
  const setSlots = useVizijStore(useShallow((state) => state.setSlots));

  useEffect(() => {
    const loadHugo = async () => {
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

      console.log("Hugo's world");
      console.log(world);
    };

    loadHugo();
  }, []);

  const HugoMaterials = useMemo(() => {
    let initialMaterials = [
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

    return initialMaterials
      .filter((mat) => {
        return Object.values(activeAnimatables).find((anim) => anim.name == mat.name) !== undefined;
      })
      .map((mat) => {
        let foundMat = Object.values(activeAnimatables).find((anim) => anim.name == mat.name);
        if (foundMat !== undefined) {
          return {
            ...mat,
            id: foundMat.id,
          };
        }
      });
  }, [activeAnimatables]);

  const HugoControllables = useMemo(() => {
    console.table(world);
    let initialVals = [
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
    return initialVals
      .filter((val) => {
        return Object.values(world).find((e) => e.name === val.name) !== undefined;
      })
      .map((controllable) => {
        let foundShape = Object.values(world).find((e) => e.name === controllable.name);
        return {
          ...controllable,
          id: foundShape.id,
          translationId: foundShape?.features.translation.value,
          scaleId: foundShape?.features.scale?.value,
        };
      });
  }, [world]);

  const HugoAnimatables = useMemo(() => {
    let initialAnimatables = [
      {
        displayAs: "Left Eyelid",
        name: "Plane006",
      },
      {
        displayAs: "Right Eyelid",
        name: "Plane005",
      },
      {
        displayAs: "Left Brow",
        name: "L_Brow",
      },
      {
        displayAs: "Right Brow",
        name: "R_Brow",
      },
      {
        displayAs: "Flip Mouth",
        name: "Mouth",
      },
    ];
    return initialAnimatables
      .filter((anim) => {
        return Object.values(world).find((e) => e.name == anim.name) !== undefined;
      })
      .map((anim) => {
        let foundAnim = Object.values(world).find((e) => e.name == anim.name);
        console.log("Found it!");
        console.table(foundAnim);
        return {
          ...anim,
          id: foundAnim?.id,
          ...(foundAnim?.morphTargets ? { morphTargets: foundAnim.morphTargets } : null),
        };
      });
  }, [world]);

  return (
    <Suspense fallback={<div>Loading Hugo...</div>}>
      {/* @ts-expect-error Async Server Component */}
      <Vizij rootId={rootId ?? ""} namespace="default" />
      <div className="grid grid-cols-3">
        <div className="p-2 h-64 overflow-scroll">
          <p>Colors</p>
          {HugoMaterials.map((material) => {
            return (
              <div key={material?.id}>
                <span>{material?.displayAs}</span>
                {/* @ts-expect-error Async Server Component */}
                <Controller animatableId={material?.id} />
              </div>
            );
          })}
        </div>
        <div className="p-2 h-64 overflow-scroll">
          <p>Control</p>
          {HugoControllables.map((control) => {
            return (
              <div key={control?.id}>
                {control?.displayAs}
                <div>
                  <span>Move</span>
                  {/* @ts-expect-error Async Server Component */}
                  <Controller animatableId={control.translationId} />
                  <span>Scale</span>
                  {/* @ts-expect-error Async Server Component */}
                  <Controller animatableId={control.scaleId} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-2 h-64 overflow-scroll">
          <p>Animations</p>
          {HugoAnimatables.map((animatable) => {
            return (
              <div key={animatable.id}>
                <span>{animatable.displayAs}</span>
                {animatable.morphTargets.map((morph: string) => {
                  return (
                    <>
                      {/* @ts-expect-error Async Server Component */}
                      <Controller key={morph} animatableId={morph} />
                    </>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
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
