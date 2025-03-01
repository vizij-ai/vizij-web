import JiboGLB from "../assets/Jibo.glb";
import { HardCodedVizij } from "./HardCodedVizij";
import { HardCodedVizijWithControls } from "./HardCodedVizijWithControls";

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

export function JiboVizijWithControls() {
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

  const JiboMaterials = [
    { display: "Main", name: "Gray_2" },
    { display: "Center", name: "Gray_1" },
    { display: "Front Shadow", name: "Gray_3" },
    { display: "Background Shadow", name: "Gray_4" },
    { display: "Background", name: "Material" },
  ];
  const JiboMovables = [
    { display: "Ball", name: "Ball_Anim", allow: { translate: ["x", "y"], scale: ["y"] } },
  ];

  return (
    <HardCodedVizijWithControls
      glb={JiboGLB}
      bounds={JiboBounds}
      materials={JiboMaterials}
      movables={JiboMovables}
    />
  );
}
