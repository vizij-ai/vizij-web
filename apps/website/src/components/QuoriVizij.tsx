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
      display: "Ring",
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
  ];
  const QuoriMorphables = [
    {
      display: "Mouth",
      name: "Plane",
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
