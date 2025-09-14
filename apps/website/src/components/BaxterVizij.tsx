import BaxterGLB from "../assets/Baxter.glb";
import { HardCodedVizij } from "./HardCodedVizij";
import {
  AnimatableLookup,
  HardCodedVizijWithControls,
} from "./HardCodedVizijWithControls";

export function BaxterVizij() {
  const BaxterBounds = {
    center: {
      x: 0,
      y: -0.25,
    },
    size: {
      x: 6,
      y: 5,
    },
  };

  return <HardCodedVizij glb={BaxterGLB} bounds={BaxterBounds} />;
}
export function BaxterVizijWithControls() {
  const BaxterBounds = {
    center: {
      x: 0,
      y: -0.25,
    },
    size: {
      x: 6,
      y: 5,
    },
  };

  const BaxterMaterials = [
    { display: "Face", name: "Black_S" },
    { display: "Eye", name: "White_S" },
    { display: "Iris", name: "IRIS_S" },
    { display: "Pupil", name: "Blue_BG_S" },
  ];
  const BaxterMovables: AnimatableLookup[] = [
    {
      display: "Eyes",
      name: "Eyes",
      allow: {
        translate: ["x", "y"],
      },
    },
    {
      display: "Left Pupil",
      name: "L_Pupil",
      allow: {
        translate: ["x", "y"],
      },
    },
    {
      display: "Right Pupil",
      name: "R_Pupil",
      allow: {
        translate: ["x", "y"],
      },
    },
    {
      display: "Left Eyebrow",
      name: "L_Brow",
      allow: {
        translate: ["y"],
        rotate: ["z"],
      },
    },
    {
      display: "Right Eyebrow",
      name: "R_Brow",
      allow: {
        translate: ["y"],
        rotate: ["z"],
      },
    },
    {
      display: "Left Eyelid",
      name: "L_Lid",
      allow: {
        translate: ["y"],
        rotate: ["z"],
        morphs: true,
      },
    },
    {
      display: "Right Eyelid",
      name: "R_Lid",
      allow: {
        translate: ["y"],
        rotate: ["z"],
        morphs: true,
      },
    },
  ];

  return (
    <HardCodedVizijWithControls
      glb={BaxterGLB}
      bounds={BaxterBounds}
      materials={BaxterMaterials}
      movables={BaxterMovables}
    />
  );
}
