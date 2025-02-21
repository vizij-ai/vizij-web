import JiboGLB from "../assets/Jibo.glb";
import { HardCodedVizij } from "./HardCodedVizij";

export function JiboVizij() {
  const JiboBounds = {
    center: {
      x: 0,
      y: 0,
    },
    size: {
      x: 5,
      y: 5,
    },
  };

  return <HardCodedVizij glb={JiboGLB} bounds={JiboBounds} />;
}
