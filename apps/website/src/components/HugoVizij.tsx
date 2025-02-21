import Hugo from "../assets/Hugo.glb";
import { HardCodedVizijWithControls } from "./HardCodedVizijWithControls";

export function HugoVizij() {
  const HugoBounds = {
    center: {
      x: 0,
      y: 0,
    },
    size: {
      x: 5,
      y: 6,
    },
  };
  const HugoMaterials = [
    {
      display: "Main Color",
      name: "Black_S",
    },
    {
      display: "Inner Eye Color",
      name: "White_S",
    },
    {
      display: "Cheek Color",
      name: "Pink_S",
    },
    {
      display: "Face Color",
      name: "Blue_BG_S",
    },
  ];

  const HugoMovables = [
    {
      display: "Face",
      name: "Circle",
    },
    {
      display: "Left Eye (Face perspective)",
      name: "L_Eye",
    },
    {
      display: "Right Eye (Face perspective)",
      name: "R_Eye",
    },
    {
      display: "Mouth",
      name: "Mouth",
    },
  ];

  const HugoMorphables = [
    {
      display: "Left Eyelid",
      name: "Plane006",
    },
    {
      display: "Right Eyelid",
      name: "Plane005",
    },
    {
      display: "Left Brow",
      name: "L_Brow",
    },
    {
      display: "Right Brow",
      name: "R_Brow",
    },
    {
      display: "Flip Mouth",
      name: "Mouth",
    },
  ];

  return (
    <HardCodedVizijWithControls
      glb={Hugo}
      bounds={HugoBounds}
      materials={HugoMaterials}
      morphables={HugoMorphables}
      movables={HugoMovables}
    />
  );
}
