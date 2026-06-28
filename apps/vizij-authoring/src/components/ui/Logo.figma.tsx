import figma from "@figma/code-connect";
import { Logo } from "./Logo";

figma.connect(
  Logo,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-56",
  {
    example: () => <Logo />,
  },
);
