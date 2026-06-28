import figma from "@figma/code-connect";
import { TextArea } from "./TextArea";

figma.connect(
  TextArea,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=19-52",
  {
    example: () => <TextArea placeholder="Placeholder" rows={3} />,
  },
);
