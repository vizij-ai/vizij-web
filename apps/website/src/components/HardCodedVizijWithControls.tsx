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

type IdentifiedMaterial = {
  display: string;
  name: string;
  id: string;
};
type IdentifiedMovable = {
  display: string;
  name: string;
  id: string;
  translationId: string;
  scaleId: string;
};
type IdentifiedMorphable = {
  display: string;
  name: string;
  id: string;
  morphTargets: string[];
};

function InnerHardCodedVizijWithControls({
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
  const [rootId, setRootId] = useState<string | undefined>("");

  const addWorldElements = useVizijStore(useShallow((state) => state.addWorldElements));
  const world = useVizijStore(useShallow((state) => state.world));
  const activeAnimatables = useVizijStore(useShallow((state) => state.animatables));

  const calculatedMaterials = useMemo(() => {
    return materials
      .map((mat) => {
        let foundMat = Object.values(activeAnimatables).find((anim) => anim.name == mat.name);
        if (foundMat !== undefined) {
          return {
            ...mat,
            id: foundMat.id,
          };
        }
        return mat;
      })
      .filter((mat) => {
        return "id" in mat;
      }) as IdentifiedMaterial[];
  }, [materials, activeAnimatables]);

  const calculatedMovables = useMemo(() => {
    return movables
      .map((controllable) => {
        let foundShape = Object.values(world).find((e) => e.name === controllable.name);
        if (foundShape !== undefined) {
          return {
            ...controllable,
            id: foundShape.id,
            translationId: foundShape?.features.translation.value,
            ...("scale" in foundShape.features && foundShape?.features.scale?.value !== undefined
              ? { scaleId: foundShape?.features.scale?.value }
              : {}),
          };
        }
        return controllable;
      })
      .filter((val) => {
        return "id" in val && "translationId" in val && "scaleId" in val;
      }) as IdentifiedMovable[];
  }, [movables, world]);
  const calculatedMorphables = useMemo(() => {
    return morphables
      .map((anim) => {
        let foundAnim = Object.values(world).find((e) => e.name == anim.name);
        if (foundAnim !== undefined) {
          return {
            ...anim,
            id: foundAnim?.id,
            ...("morphTargets" in foundAnim && foundAnim.morphTargets !== undefined
              ? { morphTargets: foundAnim.morphTargets }
              : {}),
          };
        }
        return anim;
      })
      .filter((anim) => {
        return "id" in anim && "morphTargets" in anim;
      }) as IdentifiedMorphable[];
  }, [morphables, world]);

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
      <div className="h-50 md:h-100 m-5 md:m-10">
        {/* @ts-expect-error Async Server Component */}
        <Vizij rootId={rootId ?? ""} namespace="default" />
      </div>
      <div className="grid md:grid-cols-3">
        <div className="p-4 mx-2">
          <p className="font-bold text-xl uppercase">Colors</p>
          <div className="max-h-120 overflow-scroll">
            {calculatedMaterials.map((material) => {
              return (
                <div key={material?.id} className="m-1 p-1 text-left font-bold">
                  <span>{material?.display}</span>
                  {/* @ts-expect-error Async Server Component */}
                  <Controller animatableId={material?.id} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="p-4 mx-2">
          <p className="font-bold text-xl uppercase">Control</p>
          <div className="max-h-120 overflow-scroll">
            {calculatedMovables.map((control) => {
              return (
                <div key={control?.id} className="m-1 p-1 text-left font-bold">
                  {control?.display}
                  <div className="p-4 text-left">
                    <div className="my-4">
                      <span>Move</span>
                      {/* @ts-expect-error Async Server Component */}
                      <Controller animatableId={control.translationId} />
                    </div>
                    <div className="my-4">
                      <span>Scale</span>
                      {/* @ts-expect-error Async Server Component */}
                      <Controller animatableId={control.scaleId} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="p-4 mx-2">
          <p className="font-bold text-xl uppercase">Blend Shapes</p>
          <div className="max-h-120 overflow-scroll">
            {calculatedMorphables.map((morphable) => {
              return (
                <div key={morphable.id} className="m-1 p-1 text-left font-bold">
                  <span>{morphable.display}</span>
                  {morphable.morphTargets.map((morph: string) => {
                    return (
                      <div className="p-2 text-left">
                        {/* @ts-expect-error Async Server Component */}
                        <Controller key={morph} animatableId={morph} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
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
