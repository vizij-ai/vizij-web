import Hugo from "../assets/Hugo.glb";
import { HardCodedVizij } from "./HardCodedVizij";
import { AnimatableLookup, HardCodedVizijWithControls } from "./HardCodedVizijWithControls";

export function HugoVizij() {
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
  const vals = [
    {
      name: "Black_S",
      value: { r: 0, g: 0, b: 0 },
    },
  ];
  return <HardCodedVizij glb={Hugo} bounds={HugoBounds} values={vals} />;
}

export function HugoVizijWithControls() {
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
  const HugoMaterials = [
    {
      display: "Main Color",
      name: "Black_S",
      initial: { r: 0, g: 0, b: 0 },
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

  const HugoMovables: AnimatableLookup[] = [
    {
      display: "Mouth",
      name: "Mouth",
      allow: {
        translate: ["x", "y"],
        scale: ["x", "y"],
        morphs: true,
      },
    },
    {
      display: "Left Eye",
      name: "L_Eye",
      allow: {
        translate: ["x", "y"],
      },
    },
    {
      display: "Right Eye",
      name: "R_Eye",
      allow: {
        translate: ["x", "y"],
      },
    },
    {
      display: "Left Eye Top Eyelid",
      name: "Plane005",
      allow: {
        translate: ["y"],
        rotate: ["z"],
        morphs: true,
      },
    },
    {
      display: "Right Eye Top Eyelid",
      name: "Plane006",
      allow: {
        translate: ["y"],
        rotate: ["z"],
        morphs: true,
      },
    },
    {
      display: "Left Eye Bottom Eyelid",
      name: "L_Eye009",
      allow: {
        translate: ["y"],
        rotate: ["z"],
      },
    },
    {
      display: "Right Eye Bottom Eyelid",
      name: "R_Eye009",
      allow: {
        translate: ["y"],
        rotate: ["z"],
      },
    },
    {
      display: "Left Eye Pupil",
      name: "L_EyeHighlight1",
      allow: { scale: ["x", "y"] },
    },
    {
      display: "Left Eye Pupil Reflection",
      name: "L_EyeHighlight2",
      allow: { scale: ["x", "y"] },
    },
    {
      display: "Right Eye Pupil",
      name: "R_EyeHighlight1",
      allow: { scale: ["x", "y"] },
    },
    {
      display: "Right Eye Pupil Reflection",
      name: "R_EyeHighlight2",
      allow: { scale: ["x", "y"] },
    },
    {
      display: "Left Eyebrow",
      name: "L_Brow",
      allow: {
        translate: ["y"],
        rotate: ["z"],
        scale: ["x"],
      },
    },
    {
      display: "Right Eyebrow",
      name: "R_Brow",
      allow: {
        translate: ["y"],
        rotate: ["z"],
        scale: ["x"],
      },
    },
    {
      display: "Face",
      name: "Circle",
      allow: { translate: ["x", "y"] },
    },
  ];

  return (
    <HardCodedVizijWithControls
      glb={Hugo}
      bounds={HugoBounds}
      materials={HugoMaterials}
      movables={HugoMovables}
    />
  );
}
