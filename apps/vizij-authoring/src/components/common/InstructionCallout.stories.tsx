import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconBulb, IconInfoCircle } from "@tabler/icons-react";
import { InstructionCallout } from "./InstructionCallout";

const meta = {
  title: "Common/InstructionCallout",
  component: InstructionCallout,
  parameters: {
    docs: {
      description: {
        component:
          'Collapsible “how to use this” callout.\n\nIt used to be a 160-line second implementation of `CollapsibleGroup`, justified by four capabilities that component lacked: optional controlled state, a `trigger="external"` mode, a caller-supplied `contentId`, and an `icon` slot. Three of the four had **no consumers** — only the stories written to document them. `size` was worse: read at exactly one place, inside the `external` branch, while all five real call sites passed `size="compact"` and got nothing for it.\n\nSo the unused surface was deleted rather than absorbed, `icon` moved to `CollapsibleGroup` where both can use it, and this became a thin delegate — the same shape `SidebarSection` already had. The stories that exercised the deleted props went with them; what is left is what the app actually calls.',
      },
    },
  },
  argTypes: {
    defaultOpen: { control: "boolean" },
  },
  args: {
    label: "How bindings resolve",
    children: (
      <p className="m-0">
        Each binding is matched against the runtime channel table at export
        time. Unresolved bindings are reported but do not block the build.
      </p>
    ),
  },
  render: (args) => (
    <div className="max-w-md">
      <InstructionCallout {...args} />
    </div>
  ),
} satisfies Meta<typeof InstructionCallout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSummary: Story = {
  args: { summary: "Resolution happens at export time" },
};

/** The one forked capability that was real, now living in `CollapsibleGroup`. */
export const WithIcon: Story = {
  args: {
    summary: "Resolution happens at export time",
    icon: <IconInfoCircle className="h-4 w-4" />,
  },
};

export const DefaultOpen: Story = {
  args: { defaultOpen: true, icon: <IconInfoCircle className="h-4 w-4" /> },
};

/** The shape all five real call sites use: label, summary, icon, list content. */
export const RichContent: Story = {
  args: {
    defaultOpen: true,
    icon: <IconBulb className="h-4 w-4" />,
    children: (
      <>
        <p className="m-0">Three things to check before exporting:</p>
        <ul className="m-0 list-disc pl-4">
          <li>Every declared input has a binding.</li>
          <li>No cycle warnings in the derived inputs.</li>
          <li>The rig&apos;s baked bounds are centred.</li>
        </ul>
      </>
    ),
  },
};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
  args: { defaultOpen: true, icon: <IconInfoCircle className="h-4 w-4" /> },
};
