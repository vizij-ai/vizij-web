import { useMemo, useState } from "react";
import Hugo from "../assets/Hugo.glb";
import Quori from "../assets/Quori.glb";
import { HardCodedVizij } from "./HardCodedVizij";

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

export function VizijVisemeDemo() {
  const [selectedViseme, setSelectedViseme] = useState<Viseme>("sil");

  const quoriVals = useMemo(() => {
    const { x, y, morph } = visemeMapper[selectedViseme];
    return [
      {
        name: "Plane scale",
        value: { x: x, y: y, z: 1 },
      },
      { name: "Key 1", value: morph },
    ];
  }, [selectedViseme]);
  const hugoVals = useMemo(() => {
    const { x, y, morph } = visemeMapper[selectedViseme];
    return [
      {
        name: "Mouth scale",
        value: { x: x, y: y, z: 1 },
      },
      { name: "Key 1", value: morph },
      {
        name: "Black_S",
        value: { r: 0, g: 0, b: 0 },
      },
    ];
  }, [selectedViseme]);
  return (
    <div className="my-8">
      <div>
        <h4>Select Viseme</h4>
        <div>
          {Object.keys(visemeMapper).map((v) => {
            return (
              <button
                className="m-2 p-2 border border-white cursor-pointer rounded-md hover:bg-gray-800"
                key={v}
                value={v}
                onClick={() => {
                  setSelectedViseme(v as Viseme);
                }}
              >
                {v}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2">
        <div>
          <p>Quori</p>
          <div>
            <HardCodedVizij glb={Quori} bounds={QuoriBounds} values={quoriVals} />
          </div>
        </div>
        <div>
          <p>Hugo</p>
          <div>
            <HardCodedVizij glb={Hugo} bounds={HugoBounds} values={hugoVals} />
          </div>
        </div>
      </div>
    </div>
  );
}
