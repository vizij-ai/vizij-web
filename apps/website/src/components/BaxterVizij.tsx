import BaxterGLB from "../assets/Baxter.glb";
import { HardCodedVizij } from "./HardCodedVizij";
import { HardCodedVizijWithControls } from "./HardCodedVizijWithControls";

export function BaxterVizij() {
  const BaxterBounds = {
    center: {
      x: 0,
      y: 0,
    },
    size: {
      x: 5,
      y: 5,
    },
  };

  return <HardCodedVizij glb={BaxterGLB} bounds={BaxterBounds} />;
}
export function BaxterVizijWithControls() {
  const BaxterBounds = {
    center: {
      x: 0,
      y: 0,
    },
    size: {
      x: 5,
      y: 5,
    },
  };

  const BaxterMaterials = [
    { display: "Face", name: "Black_S" },
    { display: "Eye", name: "White_S" },
    { display: "Iris", name: "IRIS_S" },
    { display: "Pupil", name: "Blue_BG_S" },
  ];
  const BaxterMovables = [
    {
      display: "Eyes",
      name: "Eyes",
    },
    {
      display: "Left Pupil",
      name: "L_Pupil",
    },
    {
      display: "Right Pupil",
      name: "R_Pupil",
    },
    {
      display: "Left Eyebrow",
      name: "L_Brow",
    },
    {
      display: "Right Eyebrow",
      name: "R_Brow",
    },
    {
      display: "Left Eyelid",
      name: "L_Lid",
    },
    {
      display: "Right Eyelid",
      name: "R_Lid",
    },
  ];
  const BaxterMorphables = [
    {
      display: "Left Eyelid",
      name: "L_Lid",
    },
    {
      display: "Right Eyelid",
      name: "R_Lid",
    },
  ];

  return (
    <HardCodedVizijWithControls
      glb={BaxterGLB}
      bounds={BaxterBounds}
      materials={BaxterMaterials}
      movables={BaxterMovables}
      morphables={BaxterMorphables}
    />
  );
}
