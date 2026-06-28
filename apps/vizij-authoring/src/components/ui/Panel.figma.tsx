import figma from "@figma/code-connect";
import { Panel } from "./Panel";

// StudioPanel shares this node; it is Panel with scrollable content semantics.
figma.connect(
  Panel,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-7",
  {
    example: () => (
      <Panel title="Panel title" description="Panel description">
        Panel content
      </Panel>
    ),
  },
);
