import { RawValue, RawVector2 } from "@semio/utils";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
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

type axis = "x" | "y" | "z";

export type AnimatableLookup = {
  display: string;
  name: string;
  initial?: RawValue;
  allow?: {
    translate?: axis[];
    scale?: axis[];
    morphs?: boolean;
    rotate?: axis[];
  };
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
  allow?: {
    translate?: axis[];
    scale?: axis[];
    rotate?: axis[];
    morphs?: boolean;
  };
  translationId?: string;
  scaleId?: string;
  rotateId?: string;
  morphTargets?: string[];
};

function InnerHardCodedVizijWithControls({
  glb,
  bounds,
  materials,
  movables,
}: {
  glb: string;
  bounds: {
    center: RawVector2;
    size: RawVector2;
  };
  materials: AnimatableLookup[];
  movables: AnimatableLookup[];
}) {
  const [rootId, setRootId] = useState<string | undefined>("");

  const addWorldElements = useVizijStore(
    useShallow((state) => state.addWorldElements),
  );
  const setValue = useVizijStore(useShallow((state) => state.setValue));
  const world = useVizijStore(useShallow((state) => state.world));
  const activeAnimatables = useVizijStore(
    useShallow((state) => state.animatables),
  );

  const calculatedMaterials = useMemo(() => {
    return materials
      .map((mat) => {
        const foundMat = Object.values(activeAnimatables).find(
          (anim) => anim.name == mat.name,
        );
        if (foundMat !== undefined) {
          if (mat.initial) {
            setValue(foundMat.id, "default", mat.initial);
          }
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
  }, [materials, activeAnimatables, setValue]);

  const calculatedMovables = useMemo(() => {
    return movables
      .map((controllable) => {
        const foundShape = Object.values(world).find(
          (e) => e.name === controllable.name,
        );
        if (foundShape !== undefined) {
          return {
            ...controllable,
            id: foundShape.id,
            translationId: foundShape?.features.translation.value,
            ...("scale" in foundShape.features &&
            foundShape?.features.scale?.value !== undefined
              ? { scaleId: foundShape?.features.scale.value }
              : {}),
            ...("rotation" in foundShape.features &&
            foundShape.features.rotation !== undefined
              ? { rotateId: foundShape.features.rotation.value }
              : {}),
            ...("morphTargets" in foundShape &&
            foundShape.morphTargets !== undefined
              ? { morphTargets: foundShape.morphTargets }
              : {}),
          };
        }
        return controllable;
      })
      .filter((val) => {
        return "id" in val && "translationId" in val && "scaleId" in val;
      }) as IdentifiedMovable[];
  }, [movables, world]);

  useEffect(() => {
    const loadVizij = async () => {
      const [world, animatables] = await loadGLTF(
        glb,
        ["default"],
        true,
        bounds,
      );
      const root = Object.values(world).find(
        (e) => e.type === "group" && e.rootBounds,
      );
      addWorldElements(world, animatables, true);
      setRootId((root as Group | undefined)?.id);
    };

    loadVizij();
  }, [bounds, glb, addWorldElements]);
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div className="grid md:grid-cols-2">
        <div className="h-50 md:h-100 m-5 md:m-10">
          <Vizij rootId={rootId ?? ""} namespace="default" />
        </div>
        <div className="max-h-70 md:max-h-120 overflow-scroll mt-4">
          <Disclosure as={"div"} className={"px-4 py-2 mx-2"}>
            {({ open }) => (
              <>
                <DisclosureButton
                  className={
                    "sticky top-0 font-bold text-xl uppercase block w-full p-1 cursor-pointer " +
                    (open ? "bg-gray-800" : "bg-gray-600")
                  }
                >
                  Colors{" "}
                  {open ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="h-4 w-4 inline-block ml-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m4.5 15.75 7.5-7.5 7.5 7.5"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="h-4 w-4 inline-block ml-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m19.5 8.25-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  )}
                </DisclosureButton>
                <DisclosurePanel className="max-h-120 overflow-scroll">
                  {calculatedMaterials.map((material) => {
                    return (
                      <div
                        key={material.id}
                        className="m-1 p-1 text-left font-bold flex-row flex gap-2"
                      >
                        <div className="inline-block">
                          <Controller animatableId={material.id} />
                        </div>
                        <span>{material.display}</span>
                      </div>
                    );
                  })}
                </DisclosurePanel>
              </>
            )}
          </Disclosure>
          <div className={"px-4 py-2 mx-2"}>
            <span
              className={
                "sticky top-0 font-bold text-xl uppercase block w-full p-1 bg-gray-800"
              }
            >
              Control
            </span>
            <div className="max-h-120 overflow-scroll">
              {calculatedMovables.map((control) => {
                return (
                  <Disclosure
                    as="div"
                    key={control?.id}
                    className="m-1 p-1 text-left font-bold"
                  >
                    {({ open }) => (
                      <>
                        <DisclosureButton
                          className={
                            "cursor-pointer block w-full text-left p-1 pl-2 " +
                            (open ? "bg-gray-800" : "bg-gray-900")
                          }
                        >
                          {control?.display}
                        </DisclosureButton>
                        <DisclosurePanel className={"bg-gray-800 p-2"}>
                          {control.allow ? (
                            <div className="p-1 text-left">
                              {control.allow.translate && (
                                <div className="my-2">
                                  <span>Translate</span>
                                  {control.translationId !== undefined &&
                                    control.allow.translate.map(
                                      (allowableAxis) => {
                                        return (
                                          <div key={allowableAxis}>
                                            <Controller
                                              key={allowableAxis}
                                              animatableId={
                                                control.translationId ?? ""
                                              }
                                              subfield={allowableAxis}
                                            />
                                          </div>
                                        );
                                      },
                                    )}
                                </div>
                              )}
                              {control.rotateId &&
                                control.rotateId !== undefined &&
                                control.allow.rotate && (
                                  <div className="my-2">
                                    <span>Rotate</span>
                                    {control.allow.rotate.map(
                                      (allowableAxis) => {
                                        return (
                                          <div key={allowableAxis}>
                                            <Controller
                                              key={allowableAxis}
                                              animatableId={
                                                control.rotateId ?? ""
                                              }
                                              subfield={allowableAxis}
                                            />
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                )}
                              {control.scaleId !== undefined &&
                                control.allow.scale && (
                                  <div className="my-2">
                                    <span>Scale</span>
                                    {control.allow.scale.map(
                                      (allowableAxis) => {
                                        return (
                                          <div key={allowableAxis}>
                                            <Controller
                                              key={allowableAxis}
                                              animatableId={
                                                control.scaleId ?? ""
                                              }
                                              subfield={allowableAxis}
                                            />
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                )}
                              {control.morphTargets !== undefined &&
                                control.allow.morphs && (
                                  <div className="my-2">
                                    <span>Morphs</span>
                                    {control.morphTargets.map(
                                      (morph: string) => {
                                        return (
                                          <div
                                            className="p-2 text-left"
                                            key={morph}
                                          >
                                            <Controller animatableId={morph} />
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                )}
                            </div>
                          ) : (
                            <div className="p-1 text-left">
                              <div className="my-2">
                                <span>Translate</span>
                                <Controller
                                  animatableId={control.translationId!}
                                  subfield="x"
                                />
                                <Controller
                                  animatableId={control.translationId!}
                                  subfield="y"
                                />
                              </div>
                              <div className="my-2">
                                <span>Scale</span>
                                <Controller
                                  animatableId={control.scaleId!}
                                  subfield="x"
                                />
                                <Controller
                                  animatableId={control.scaleId!}
                                  subfield="y"
                                />
                              </div>
                              {control.morphTargets && (
                                <div className="my-2">
                                  <span>Morphs</span>
                                  {control.morphTargets.map((morph: string) => {
                                    return (
                                      <div
                                        className="p-2 text-left"
                                        key={morph}
                                      >
                                        <Controller animatableId={morph} />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </DisclosurePanel>
                      </>
                    )}
                  </Disclosure>
                );
              })}
            </div>
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
}: {
  glb: string;
  bounds: {
    center: RawVector2;
    size: RawVector2;
  };
  materials: AnimatableLookup[];
  movables: AnimatableLookup[];
}) {
  const hardCodedStore = useMemo(() => createVizijStore(), []);

  return (
    <>
      <VizijContext.Provider value={hardCodedStore}>
        <InnerHardCodedVizijWithControls
          glb={glb}
          bounds={bounds}
          materials={materials}
          movables={movables}
        />
      </VizijContext.Provider>
    </>
  );
}
