import figma from "@figma/code-connect";
import { Tabs } from "./Tabs";

// The Figma "Tab" set is a single tab item (variant × state); the code primitive
// is the Tabs container. We map the `variant` style; items/state are per-tab.
figma.connect(
  Tabs,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-37",
  {
    props: {
      variant: figma.enum("variant", {
        Default: "default",
        Pill: "pill",
        Underline: "underline",
      }),
    },
    example: ({ variant }) => (
      <Tabs
        variant={variant}
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
