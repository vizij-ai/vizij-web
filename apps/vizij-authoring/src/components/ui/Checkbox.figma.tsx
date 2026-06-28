import figma from "@figma/code-connect";
import { Checkbox } from "./Checkbox";

figma.connect(
  Checkbox,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-42",
  {
    props: {
      checked: figma.enum("state", { Checked: true, Unchecked: false }),
    },
    example: ({ checked }) => (
      <Checkbox checked={checked} onChange={() => {}} label="Label" />
    ),
  },
);
