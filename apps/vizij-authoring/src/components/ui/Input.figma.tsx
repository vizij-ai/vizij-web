import figma from "@figma/code-connect";
import { Input } from "./Input";

figma.connect(
  Input,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-52",
  {
    example: () => <Input placeholder="Placeholder" />,
  },
);
