import figma from "@figma/code-connect";
import { Card } from "./Card";

figma.connect(
  Card,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-3",
  {
    example: () => <Card>Card content</Card>,
  },
);
