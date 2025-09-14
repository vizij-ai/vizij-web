import Abi from "../assets/Abi.glb";
import { HardCodedVizij } from "./HardCodedVizij";
import {
  AnimatableLookup,
  HardCodedVizijWithControls,
} from "./HardCodedVizijWithControls";

export function AbiVizij() {
  const AbiBounds = {
    center: {
      x: 0,
      y: 0,
    },
    size: {
      x: 2,
      y: 3,
    },
  };

  return <HardCodedVizij glb={Abi} bounds={AbiBounds} />;
}

export function AbiVizijWithControls() {
  const AbiBounds = {
    center: {
      x: 0,
      y: 0,
    },
    size: {
      x: 2,
      y: 3,
    },
  };

  const AbiMaterials = [
    {
      display: "Face",
      name: "Black",
    },
    {
      display: "Eye",
      name: "White",
    },
    {
      display: "Iris",
      name: "Pink",
    },
  ];

  const AbiMovables: AnimatableLookup[] = [
    { display: "Eyes", name: "Eyes", allow: { translate: ["x", "y"] } },
    {
      display: "Left Eye Pupil",
      name: "L_Eye_Pupil",
      allow: { translate: ["x", "y"] },
    },
    {
      display: "Right Eye Pupil",
      name: "R_Eye_Pupil",
      allow: { translate: ["x", "y"] },
    },
    {
      display: "Left Eye Top Eyelid",
      name: "LT_Lid",
      allow: { translate: ["y"], rotate: ["z"], morphs: true },
    },
    {
      display: "Right Eye Top Eyelid",
      name: "RT_Lid",
      allow: { translate: ["y"], rotate: ["z"], morphs: true },
    },
  ];

  return (
    <HardCodedVizijWithControls
      glb={Abi}
      bounds={AbiBounds}
      materials={AbiMaterials}
      movables={AbiMovables}
    />
  );
}
