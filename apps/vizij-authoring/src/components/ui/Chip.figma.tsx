import figma from "@figma/code-connect";
import { Chip } from "./Chip";

figma.connect(
  Chip,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-50",
  {
    props: {
      tone: figma.enum("tone", {
        Default: "default",
        Success: "success",
        Warning: "warning",
      }),
    },
    example: ({ tone }) => <Chip tone={tone}>Chip</Chip>,
  },
);
