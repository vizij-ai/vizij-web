import figma from "@figma/code-connect";
import { Badge } from "./Badge";

figma.connect(
  Badge,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-30",
  {
    props: {
      tone: figma.enum("tone", { Accent: "accent", Info: "info", Muted: "muted" }),
    },
    example: ({ tone }) => <Badge tone={tone}>Badge</Badge>,
  },
);
