import React from "react";
import { IkGraphDemo } from "./demos/IkGraphDemo";
import { SlewDampDemo } from "./demos/SlewDampDemo";
import { MinimalDemoChrome, MinimalDemoSection } from "@vizij/minimal-demo-ui";

export default function App() {
  return (
    <MinimalDemoChrome
      title="Animation × Node Graph mini demos"
      subtitle="Minimal Vizij sample"
      description="Both examples replay StoredAnimation clips, stream their values into @vizij/node-graph-react, and visualise the processed graph outputs so you can compare drivers versus graph results."
    >
      <MinimalDemoSection
        title="URDF FK/IK replay"
        description="Anim joints drive a URDF FK target while a URDF IK node solves joints that track that pose."
      >
        <IkGraphDemo />
      </MinimalDemoSection>
      <MinimalDemoSection
        title="Slew + damp smoothing"
        description="A single driver track is filtered with slew and damp nodes to produce stable typed outputs."
      >
        <SlewDampDemo />
      </MinimalDemoSection>
    </MinimalDemoChrome>
  );
}
