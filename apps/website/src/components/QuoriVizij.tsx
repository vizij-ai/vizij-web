import Quori from "../assets/Quori.glb";
import { HardCodedVizij } from "./HardCodedVizij";
import { HardCodedVizijWithControls } from "./HardCodedVizijWithControls";

export function QuoriVizij() {
  const QuoriBounds = {
    center: {
      x: 0,
      y: 0,
    },
    size: {
      x: 0.5,
      y: 0.8,
    },
  };

  return <HardCodedVizij glb={Quori} bounds={QuoriBounds} />;
}

export function QuoriVizijWithControls() {
  const QuoriBounds = {
    center: {
      x: 0,
      y: 0,
    },
    size: {
      x: 0.5,
      y: 0.8,
    },
  };

  return (
    <HardCodedVizijWithControls
      glb={Quori}
      bounds={QuoriBounds}
      materials={[]}
      morphables={[]}
      movables={[]}
    />
  );
}
