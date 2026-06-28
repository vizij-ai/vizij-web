import figma from "@figma/code-connect";
import { TreeRow } from "./TreeRow";

figma.connect(
  TreeRow,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-39",
  {
    example: () => (
      <TreeRow depth={0} hasChildren label="Node" onToggle={() => {}} />
    ),
  },
);
