import { RawVector2 } from "@semio/utils";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  createVizijStore,
  Group,
  loadGLTF,
  useVizijStore,
  VizijContext,
  Vizij,
  Controller,
} from "vizij";
import { useShallow } from "zustand/shallow";

type AnimatableLookup = {
  display: string;
  name: string;
};

function InnerHardCodedVizijWithControls({
  glb,
  materials,
  movables,
  morphables,
}: {
  glb: string;
  bounds: {
    center: RawVector2;
    size: RawVector2;
  };
  materials: AnimatableLookup[];
  movables: AnimatableLookup[];
  morphables: AnimatableLookup[];
}) {
  const [rootId, setRootId] = useState<string | undefined>("");

  const addWorldElements = useVizijStore(useShallow((state) => state.addWorldElements));
  const world = useVizijStore(useShallow((state) => state.world));
  const activeAnimatables = useVizijStore(useShallow((state) => state.animatables));

  const calculatedMaterials = useMemo(() => {
    return materials
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
  }, [materials, activeAnimatables]);

  const calculatedMovables = useMemo(() => {
    return movables
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
  }, [movables, world]);
  const calculatedMorphables = useMemo(() => {
    return morphables
      .filter((anim) => {
        return Object.values(world).find((e) => e.name == anim.name) !== undefined;
      })
      .map((anim) => {
        let foundAnim = Object.values(world).find((e) => e.name == anim.name);
        return {
          ...anim,
          id: foundAnim?.id,
          ...(foundAnim?.morphTargets ? { morphTargets: foundAnim.morphTargets } : null),
        };
      });
  }, [morphables, world]);

  useEffect(() => {
    const loadVizij = async () => {
      const [world, animatables] = await loadGLTF(glb, ["default"], true, {
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
    };

    loadVizij();
  }, []);
  return (
    <Suspense fallback={<div>Loading...</div>}>
      {/* @ts-expect-error Async Server Component */}
      <Vizij rootId={rootId ?? ""} namespace="default" />
      <div className="grid grid-cols-3">
        <div className="p-2 h-64 overflow-scroll">
          <p>Colors</p>
          {calculatedMaterials.map((material) => {
            return (
              <div key={material?.id}>
                <span>{material?.display}</span>
                {/* @ts-expect-error Async Server Component */}
                <Controller animatableId={material?.id} />
              </div>
            );
          })}
        </div>
        <div className="p-2 h-64 overflow-scroll">
          <p>Control</p>
          {calculatedMovables.map((control) => {
            return (
              <div key={control?.id}>
                {control?.display}
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
          {calculatedMorphables.map((morphable) => {
            return (
              <div key={morphable.id}>
                <span>{morphable.display}</span>
                {morphable.morphTargets.map((morph: string) => {
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

export function HardCodedVizijWithControls({
  glb,
  bounds,
  materials,
  movables,
  morphables,
}: {
  glb: string;
  bounds: {
    center: RawVector2;
    size: RawVector2;
  };
  materials: AnimatableLookup[];
  movables: AnimatableLookup[];
  morphables: AnimatableLookup[];
}) {
  const hardCodedStore = useMemo(() => createVizijStore(), []);

  return (
    <>
      {/* @ts-expect-error Async Server Component */}
      <VizijContext.Provider value={hardCodedStore}>
        <InnerHardCodedVizijWithControls
          glb={glb}
          bounds={bounds}
          materials={materials}
          movables={movables}
          morphables={morphables}
        />
      </VizijContext.Provider>
    </>
  );
}
