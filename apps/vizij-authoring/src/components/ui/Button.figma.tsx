import figma from "@figma/code-connect";
import { Button } from "./Button";

figma.connect(
  Button,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-16",
  {
    props: {
      variant: figma.enum("variant", {
        Primary: "primary",
        Secondary: "secondary",
        Subtle: "subtle",
        Danger: "danger",
        Ghost: "ghost",
      }),
    },
    example: ({ variant }) => <Button variant={variant}>Button</Button>,
  },
);
