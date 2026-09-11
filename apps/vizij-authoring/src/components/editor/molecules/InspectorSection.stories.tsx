import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChannelLockButton } from "../atoms/ChannelLockButton";
import { InspectorSection } from "./InspectorSection";

const meta = {
  title: "Editor/molecules/InspectorSection",
  component: InspectorSection,
  parameters: {
    docs: {
      description: {
        component:
          "The titled, faintly-inset box an inspector is built out of. It existed as a local component in `InspectorPanel.tsx` and was *also* hand-inlined twelve more times in the same file, which is how three of the copies drifted apart.",
      },
    },
  },
  argTypes: {
    title: { control: "text" },
    count: { control: "number" },
  },
  args: { title: "Tracks" },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InspectorSection>;

export default meta;
type Story = StoryObj<typeof meta>;

function Rows({ labels }: { labels: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {labels.map((label) => (
        <div
          key={label}
          className="rounded border border-border-default/50 bg-bg-input/35 px-2 py-1.5 text-[10px] font-mono text-text-secondary"
        >
          {label}
        </div>
      ))}
    </div>
  );
}

export const Default: Story = {
  args: { count: 3 },
  render: (args) => (
    <InspectorSection {...args}>
      <Rows labels={["jaw.open", "brow.left", "eye.blink"]} />
    </InspectorSection>
  ),
};

export const Empty: Story = {
  args: {
    count: 0,
    emptyMessage: "No tracks yet for this animation.",
  },
  render: (args) => (
    <InspectorSection {...args}>
      <Rows labels={["never rendered"]} />
    </InspectorSection>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "`count === 0` swaps `children` for `emptyMessage`. Callers used to write this ternary by hand at every site.",
      },
    },
  },
};

export const WithMeta: Story = {
  args: { title: "Composition Outputs", meta: "12 channels" },
  render: (args) => (
    <InspectorSection {...args}>
      <Rows labels={["head.rotation.y", "head.rotation.z"]} />
    </InspectorSection>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "`meta` is for right-aligned metadata that is not a bare count — a phrase, an id, a duration. It gets the same muted mono treatment as `count`.",
      },
    },
  },
};

export const WithAction: Story = {
  args: { title: "Neutral Source" },
  render: (args) => (
    <InspectorSection
      {...args}
      action={
        <ChannelLockButton
          locked
          title="Unlock neutral source"
          onToggle={() => {}}
        />
      }
    >
      <Rows labels={["inherited from rig"]} />
    </InspectorSection>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "`action` is rendered verbatim on the right, so the caller keeps control of its layout. It composes with `count`/`meta` rather than replacing them.",
      },
    },
  },
};

export const CompositeTitle: Story = {
  args: {
    title: (
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-text-primary truncate">
          head.rotation.y
        </div>
        <div className="text-[10px] text-text-muted font-mono truncate">
          transform/rotation
        </div>
      </div>
    ),
    meta: "8 keyframes",
  },
  render: (args) => (
    <InspectorSection {...args}>
      <Rows labels={["t=0.00  v=0.0000", "t=0.50  v=0.3000"]} />
    </InspectorSection>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "A string `title` gets the standard uppercase label treatment; any other node renders as-is. That one branch is what let eleven differently-shaped inline copies collapse into this component instead of only the four that already matched.",
      },
    },
  },
};

const OVERRIDDEN_TOKENS: CSSProperties = {
  "--editor-panel-bg": "#241238",
  "--editor-border": "#7b4bb0",
  // Mid-tone on purpose: `--editor-panel-bg` is mixed at 35%, so this label sits
  // on a translucent purple that is dark in the dark theme and pale in the light
  // one. A token picked for only one of them is how the label goes invisible.
  "--editor-muted-fg": "#9b6fc4",
} as CSSProperties;

export const OverriddenTokens: Story = {
  args: { count: 2 },
  render: (args) => (
    <div className="flex flex-col gap-4">
      <InspectorSection {...args} title="Default">
        <Rows labels={["jaw.open", "brow.left"]} />
      </InspectorSection>
      <div style={OVERRIDDEN_TOKENS}>
        <InspectorSection {...args} title="Overridden">
          <Rows labels={["jaw.open", "brow.left"]} />
        </InspectorSection>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Surface, rule and label colour all come from `--editor-*`. Note the surface stays translucent under the override — the token is mixed at 35%, matching the opacity modifier the inline copies used, so it still sits *on* whatever the host's panel is.",
      },
    },
  },
};
