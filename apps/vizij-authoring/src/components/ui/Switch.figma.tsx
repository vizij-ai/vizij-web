import figma from "@figma/code-connect";
import { Switch } from "./Switch";

figma.connect(
  Switch,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-22",
  {
    props: {
      checked: figma.enum("state", { On: true, Off: false }),
    },
    example: ({ checked }) => <Switch checked={checked} onChange={() => {}} />,
  },
);
