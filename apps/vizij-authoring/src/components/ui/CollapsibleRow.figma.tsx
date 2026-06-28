import figma from "@figma/code-connect";
import { CollapsibleRow } from "./CollapsibleRow";

// CollapsibleGroup shares this node (group-level disclosure of the same pattern).
figma.connect(
  CollapsibleRow,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-44",
  {
    example: () => <CollapsibleRow id="row" title="Row title" />,
  },
);
