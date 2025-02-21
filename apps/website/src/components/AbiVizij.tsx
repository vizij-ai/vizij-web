import Abi from "../assets/Abi.glb";
import { HardCodedVizij } from "./HardCodedVizij";
import { HardCodedVizijWithControls } from "./HardCodedVizijWithControls";

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

  return (
    <HardCodedVizijWithControls
      glb={Abi}
      bounds={AbiBounds}
      materials={[]}
      morphables={[]}
      movables={[]}
    />
  );
}
