import type { Meta, StoryObj } from "@storybook/react";
import { Logo } from "./Logo";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-56";

const meta: Meta<typeof Logo> = {
  title: "UI/Logo",
  component: Logo,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof Logo> = { render: () => <Logo /> };
export const Large: StoryObj<typeof Logo> = { render: () => <Logo className="h-12" /> };
