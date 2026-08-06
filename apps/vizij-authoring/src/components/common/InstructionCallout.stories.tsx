import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconBulb, IconInfoCircle } from "@tabler/icons-react";
import { Button } from "../ui";
import { InstructionCallout } from "./InstructionCallout";

/** Exercises the optionally-controlled `isOpen` / `onToggle` pair. */
function ControlledCallout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? "Collapse" : "Expand"} from outside
      </Button>
      <InstructionCallout
        label="Controlled callout"
        summary={`isOpen = ${String(open)}`}
        icon={<IconInfoCircle className="h-3.5 w-3.5" />}
        isOpen={open}
        onToggle={setOpen}
      >
        <p className="m-0">
          The header still toggles, but the state lives in the story.
        </p>
      </InstructionCallout>
    </div>
  );
}

/** `trigger="external"` renders the body with no header at all. */
function ExternallyTriggeredCallout() {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls="external-callout"
        onClick={() => setOpen((prev) => !prev)}
      >
        Toggle instructions
      </Button>
      <InstructionCallout
        label="Externally triggered"
        summary="No built-in header button"
        icon={<IconBulb className="h-3.5 w-3.5" />}
        trigger="external"
        contentId="external-callout"
        isOpen={open}
      >
        <p className="m-0">
          In this mode the component renders an accent-tinted card and hides
          itself with `hidden` when closed — it is not a Collapsible at all.
        </p>
      </InstructionCallout>
    </div>
  );
}

const meta = {
  title: "Common/InstructionCallout",
  component: InstructionCallout,
  parameters: {
    docs: {
      description: {
        component:
          "Collapsible “how to use this” callout on the Radix Collapsible primitives `@semio/ui` re-exports. Optionally controlled (`isOpen` + `onToggle`), with an `external` trigger mode that renders a differently-styled accent card and no header. Uses the app-global `animate-in`/`fade-in`/`slide-in-from-top-1` classes from `src/styles.css`. `src/components/common/` has no barrel, and the props interface is not exported.",
      },
    },
  },
  argTypes: {
    size: { control: "inline-radio", options: ["default", "compact"] },
    trigger: { control: "inline-radio", options: ["self", "external"] },
    defaultOpen: { control: "boolean" },
    onToggle: { action: "toggled" },
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

export const WithIcon: Story = {
  args: {
    summary: "Resolution happens at export time",
    icon: <IconInfoCircle className="h-4 w-4" />,
  },
};

export const DefaultOpen: Story = {
  args: { defaultOpen: true, icon: <IconInfoCircle className="h-4 w-4" /> },
};

export const Controlled: Story = {
  render: () => (
    <div className="max-w-md">
      <ControlledCallout />
    </div>
  ),
};

export const ExternalTrigger: Story = {
  render: () => (
    <div className="max-w-md">
      <ExternallyTriggeredCallout />
    </div>
  ),
};

/**
 * `size` only takes effect in `external` mode (`p-3` vs `p-4`); the collapsible
 * path ignores it entirely.
 */
export const CompactSizeOnlyAffectsExternal: Story = {
  args: { size: "compact", trigger: "external", isOpen: true },
};

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
