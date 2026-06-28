import figma from "@figma/code-connect";
import { ListRow } from "./ListRow";

figma.connect(
  ListRow,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-37",
  {
    example: () => <ListRow title="List item" meta="meta" />,
  },
);
