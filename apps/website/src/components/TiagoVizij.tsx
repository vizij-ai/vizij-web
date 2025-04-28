import TiagoGLB from "../assets/Tiago.glb";
import { HardCodedVizij } from "./HardCodedVizij";
import { AnimatableLookup, HardCodedVizijWithControls } from "./HardCodedVizijWithControls";

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
export function TiagoVizijWithControls() {
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

  const TiagoMaterials = [
    { display: "Main", name: "Gray_4" },
    { display: "Background", name: "Material" },
  ];
  const TiagoMovables: AnimatableLookup[] = [
    { display: "Left Eye", name: "L_Eye", allow: { translate: ["x", "y"] } },
    { display: "Right Eye", name: "R_Eye", allow: { translate: ["x", "y"] } },
    { display: "Mouth", name: "Mouth", allow: { scale: ["x"], rotate: ["z"], morphs: true } },
  ];

  return (
    <HardCodedVizijWithControls
      glb={TiagoGLB}
      bounds={TiagoBounds}
      materials={TiagoMaterials}
      movables={TiagoMovables}
    />
  );
}
