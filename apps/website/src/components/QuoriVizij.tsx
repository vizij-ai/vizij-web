import Quori from "../assets/Quori.glb";
import { HardCodedVizij } from "./HardCodedVizij";
import {
  AnimatableLookup,
  HardCodedVizijWithControls,
} from "./HardCodedVizijWithControls";

export function QuoriVizij() {
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

  return <HardCodedVizij glb={Quori} bounds={QuoriBounds} />;
}

export function QuoriVizijWithControls() {
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

  const QuoriMaterials = [
    {
      display: "Border",
      name: "Face_Outside_Color",
    },
    {
      display: "Face Color",
      name: "Face_Inside_Color",
    },
  ];

  const QuoriMovables: AnimatableLookup[] = [
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
      display: "Left Eye Highlight",
      name: "L_EyeHighlight",
      allow: {
        scale: ["x", "y"],
      },
    },
    {
      display: "Right Eye Highlight",
      name: "R_EyeHighlight",
      allow: {
        scale: ["x", "y"],
      },
    },
    {
      display: "Left Eye Bottom Eyelid",
      name: "LB_Lid",
      allow: {
        translate: ["y"],
        rotate: ["z"],
      },
    },
    {
      display: "Left Eye Bottom Eyelid Curve",
      name: "LB_LidCurve",
      allow: {
        scale: ["y"],
      },
    },
    {
      display: "Left Eye Top Eyelid",
      name: "LT_Lid",
      allow: {
        translate: ["y"],
        rotate: ["z"],
        morphs: true,
      },
    },
    {
      display: "Right Eye Bottom Eyelid",
      name: "RB_Lid",
      allow: {
        translate: ["y"],
        rotate: ["z"],
      },
    },
    {
      display: "Right Eye Bottom Eyelid Curve",
      name: "RB_LidCurve",
      allow: {
        scale: ["y"],
      },
    },
    {
      display: "Right Eye Top Eyelid",
      name: "RT_Lid",
      allow: {
        translate: ["y"],
        rotate: ["z"],
        morphs: true,
      },
    },
    {
      display: "Mouth",
      name: "Plane",
      allow: {
        translate: ["x", "y"],
        scale: ["x", "y"],
        morphs: true,
      },
    },
  ];

  return (
    <HardCodedVizijWithControls
      glb={Quori}
      bounds={QuoriBounds}
      materials={QuoriMaterials}
      movables={QuoriMovables}
    />
  );
}
