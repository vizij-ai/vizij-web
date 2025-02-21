import BaxterGLB from "../assets/Baxter.glb";
import { HardCodedVizij } from "./HardCodedVizij";

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
