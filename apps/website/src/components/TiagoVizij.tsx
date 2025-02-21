import TiagoGLB from "../assets/Tiago.glb";
import { HardCodedVizij } from "./HardCodedVizij";

export function TiagoVizij() {
  const TiagoBounds = {
    center: {
      x: 0,
      y: 0,
    },
    size: {
      x: 5,
      y: 5,
    },
  };

  return <HardCodedVizij glb={TiagoGLB} bounds={TiagoBounds} />;
}
