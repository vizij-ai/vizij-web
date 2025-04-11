import { useEffect, useMemo, useState } from "react";
import Hugo from "../assets/Hugo.glb";
import Quori from "../assets/Quori.glb";
import { useSpring } from "motion/react";
import { createVizijStore, Group, loadGLTF, useVizijStore, Vizij, VizijContext } from "vizij";
import { useShallow } from "zustand/shallow";
import { RawValue, RawVector2 } from "@semio/utils";

type Viseme = "sil" | "P" | "T" | "S" | "F" | "K" | "L" | "R" | "A" | "@" | "E" | "I" | "O" | "U";

const visemeMapper: {
  [key in Viseme]: {
    x: number;
    y: number;
    morph: number;
  };
} = {
  sil: { x: 1, y: 1, morph: 0 },
  P: { x: 0.82, y: 0.37, morph: 0.2 },
  T: { x: 1, y: 2.77, morph: 0.35 },
  S: { x: 1.6, y: 2.2, morph: 0.2 },
  F: { x: 0.7, y: 3.18, morph: 0.9 },
  K: { x: 1.2, y: 2.9, morph: 0.2 },
  L: { x: 0.79, y: 3.7, morph: 0.35 },
  R: { x: 0.85, y: 2.9, morph: 0.61 },
  A: { x: 1.18, y: 5.14, morph: 0.5 },
  "@": { x: 0.95, y: 3.3, morph: 0.61 },
  E: { x: 1, y: 5, morph: 0.37 },
  I: { x: 1.7, y: 3.89, morph: 0.44 },
  O: { x: 0.9, y: 6, morph: 0.5 },
  U: { x: 0.56, y: 4.15, morph: 0.5 },
};

const QuoriBounds = {
  center: {
    x: 0.01,
    y: -0.04,
  },
  size: {
    x: 0.6,
    y: 0.4,
  },
};

const HugoBounds = {
  center: {
    x: 0,
    y: 0,
  },
  size: {
    x: 4,
    y: 5,
  },
};
// 24FPS

export function VizijVisemeDemo() {
  const visemeDemoStore = useMemo(() => createVizijStore(), []);

  return (
    <>
      <VizijContext.Provider value={visemeDemoStore}>
        <InnerVizijVisemeDemo></InnerVizijVisemeDemo>;
      </VizijContext.Provider>
    </>
  );
}

type VisemeRigMapping = {
  rootId: string;
  scaleId: string;
  morphId: string;
};

export function InnerVizijVisemeDemo() {
  const addWorldElements = useVizijStore(useShallow((state) => state.addWorldElements));
  const setVal = useVizijStore(useShallow((state) => state.setValue));

  const [hugoIDs, setHugoIDs] = useState<VisemeRigMapping>({
    rootId: "",
    scaleId: "",
    morphId: "",
  });
  const [quoriIDs, setQuoriIDs] = useState<VisemeRigMapping>({
    rootId: "",
    scaleId: "",
    morphId: "",
  });

  const [selectedViseme, setSelectedViseme] = useState<Viseme>("sil");
  const scaleX = useSpring(0);
  const scaleY = useSpring(0);
  const mouthMorph = useSpring(0);

  scaleX.on("change", (latestVal) => {
    setVal(quoriIDs.scaleId, "default", { x: latestVal, y: scaleY.get(), z: 1 });
    setVal(hugoIDs.scaleId, "default", { x: latestVal, y: scaleY.get(), z: 1 });
  });
  scaleY.on("change", (latestVal) => {
    setVal(quoriIDs.scaleId, "default", { x: scaleX.get(), y: latestVal, z: 1 });
    setVal(hugoIDs.scaleId, "default", { x: scaleX.get(), y: latestVal, z: 1 });
  });

  mouthMorph.on("change", (latestVal) => {
    setVal(quoriIDs.morphId, "default", latestVal);
    setVal(hugoIDs.morphId, "default", latestVal);
  });

  const quoriSearch = {
    scale: "Plane scale",
    morph: "Plane Key 1",
  };

  const hugoSearch = {
    scale: "Mouth scale",
    morph: "Mouth Key 1",
  };

  const hugoInitialVals = [
    {
      name: "Black_S",
      value: { r: 0, g: 0, b: 0 },
    },
  ];

  useEffect(() => {
    const loadVizij = async (
      glb: string,
      bounds: {
        center: RawVector2;
        size: RawVector2;
      },
      initialValues: { name: string; value: RawValue }[],
      search: { scale: string; morph: string },
      setter: React.Dispatch<React.SetStateAction<VisemeRigMapping>>,
    ) => {
      const [loadedWorld, loadedAnimatables] = await loadGLTF(glb, ["default"], true, bounds);
      const root = Object.values(loadedWorld).find((e) => e.type === "group" && e.rootBounds);
      addWorldElements(loadedWorld, loadedAnimatables, true);

      initialValues?.forEach((v: { name: string; value: RawValue }) => {
        const foundVal = Object.values(loadedAnimatables).find((anim) => anim.name == v.name);
        if (foundVal) {
          setVal(foundVal.id, "default", v.value);
        }
      });

      const foundScale = Object.values(loadedAnimatables).find(
        (anim) => anim.name === search.scale,
      );
      const foundScaleId = foundScale?.id;
      const foundMorph = Object.values(loadedAnimatables).find(
        (anim) => anim.name === search.morph,
      );
      const foundMorphId = foundMorph?.id;

      setter({
        rootId: (root as Group | undefined)?.id ?? "",
        scaleId: foundScaleId ?? "",
        morphId: foundMorphId ?? "",
      });
    };

    loadVizij(Hugo, HugoBounds, hugoInitialVals, hugoSearch, setHugoIDs);

    loadVizij(Quori, QuoriBounds, [], quoriSearch, setQuoriIDs);
  }, []);

  return (
    <div className="my-8">
      <div>
        <h4>Select Viseme</h4>
        <div>
          {Object.keys(visemeMapper).map((v) => {
            return (
              <button
                className={
                  "m-2 p-2 border border-white cursor-pointer rounded-md hover:bg-gray-800 " +
                  (selectedViseme == v ? " bg-gray-700" : "")
                }
                key={v}
                value={v}
                onClick={() => {
                  setSelectedViseme(v as Viseme);
                  const { x, y, morph } = visemeMapper[v as Viseme];
                  scaleX.set(x);
                  scaleY.set(y);
                  mouthMorph.set(morph);
                }}
              >
                {v}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div>Or say something instead!</div>
        <input type="text" className="bg-white text-black p-2 m-2" />
        <button className="p-2 m-2 border border-white cursor-pointer rounded-md hover:bg-gray-800">
          Speak!
        </button>
      </div>
      <div className="grid grid-cols-2">
        <div>
          <p>Quori</p>
          <div>
            <Vizij rootId={quoriIDs.rootId} />
          </div>
        </div>
        <div>
          <p>Hugo</p>
          <div>
            <Vizij rootId={hugoIDs.rootId} />
          </div>
        </div>
      </div>
    </div>
  );
}
