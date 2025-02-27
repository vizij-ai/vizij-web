import Quori from "../assets/Quori.glb";
import { HardCodedVizij } from "./HardCodedVizij";
import { HardCodedVizijWithControls } from "./HardCodedVizijWithControls";

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

  const QuoriMovables = [
    {
      display: "Mouth",
      name: "Plane",
    },
    {
      display: "Left Eye",
      name: "L_Eye",
    },
    {
      display: "Left Eye Highlight",
      name: "L_EyeHighlight",
    },
    {
      display: "Left Eye Top Eyelid",
      name: "LT_Lid",
    },
    {
      display: "Left Eye Bottom Eyelid",
      name: "LB_Lid",
    },
    {
      display: "Right Eye",
      name: "R_Eye",
    },
    {
      display: "Right Eye Highlight",
      name: "R_EyeHighlight",
    },
    {
      display: "Right Eye Top Eyelid",
      name: "RT_Lid",
    },
    {
      display: "Right Eye Bottom Eyelid",
      name: "RB_Lid",
    },
  ];
  const QuoriMorphables = [
    {
      display: "Mouth",
      name: "Plane",
    },
    {
      display: "Left Eye Top Eyelid",
      name: "LT_Lid",
    },
    {
      display: "Right Eye Top Eyelid",
      name: "RT_Lid",
    },
  ];

  return (
    <HardCodedVizijWithControls
      glb={Quori}
      bounds={QuoriBounds}
      materials={QuoriMaterials}
      morphables={QuoriMorphables}
      movables={QuoriMovables}
    />
  );
}
