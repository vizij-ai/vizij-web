import figma from "@figma/code-connect";
import { Tooltip } from "./Tooltip";

figma.connect(
  Tooltip,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-24",
  {
    example: () => (
      <Tooltip content="Tooltip text">
        <button>Hover</button>
      </Tooltip>
    ),
  },
);
