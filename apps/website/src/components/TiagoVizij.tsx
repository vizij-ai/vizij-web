import TiagoGLB from "../assets/Tiago.glb";
import { HardCodedVizij } from "./HardCodedVizij";
import { HardCodedVizijWithControls } from "./HardCodedVizijWithControls";

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
  const TiagoMovables = [
    { display: "Eyes", name: "Eyes" },
    { display: "Left Eye", name: "L_Eye" },
    { display: "Left Eye Pupil", name: "L_Eye_Pupil" },
    { display: "Left Eye Top Eyelid", name: "LT_Lid" },
    { display: "Right Eye", name: "R_Eye" },
    { display: "Right Eye Pupil", name: "R_Eye_Pupil" },
    { display: "Right Eye Top Eyelid", name: "RT_Lid" },
    { display: "Mouth", name: "Mouth" },
  ];
  const TiagoMorphables = [
    { display: "Mouth", name: "Mouth" },
    { display: "Left Eye Top Eyelid", name: "LT_Lid" },
    { display: "Right Eye Top Eyelid", name: "RT_Lid" },
  ];

  return (
    <HardCodedVizijWithControls
      glb={TiagoGLB}
      bounds={TiagoBounds}
      materials={TiagoMaterials}
      movables={TiagoMovables}
      morphables={TiagoMorphables}
    />
  );
}
