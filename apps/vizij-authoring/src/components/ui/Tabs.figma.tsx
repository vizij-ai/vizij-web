import figma from "@figma/code-connect";
import { Tabs } from "./Tabs";

// The Figma "Tab" set (state=Selected/Default) represents a single tab; the code
// primitive is the Tabs container, so this maps usage rather than a variant prop.
figma.connect(
  Tabs,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-37",
  {
    example: () => (
      <Tabs
        items={[
          { id: "design", label: "Design" },
          { id: "rig", label: "Rig" },
        ]}
        value="design"
        onValueChange={() => {}}
        renderPanel={(id) => <div>{id} panel</div>}
      />
    ),
  },
);
