import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button, Input, Modal } from "./index";
import type { ModalProps } from "./index";

/**
 * `Modal` is controlled (`open` + `onClose`) and radix unmounts it on close, so
 * a static `open: false` would render nothing at all. This wrapper adds the
 * trigger and seeds `open` from the arg.
 */
function ModalHarness({ open: initialOpen, onClose, ...rest }: ModalProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <Modal
        {...rest}
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
      />
    </>
  );
}

const meta = {
  title: "UI/Modal",
  component: Modal,
  parameters: {
    docs: {
      description: {
        component:
          "Dialog built on the Dialog primitive from `radix-ui`, portalled to `document.body` at `z-[4100]` — above the whole menu ladder. Actions belong in `children`; there is no footer slot. Close is a `ghost` `Button` whose accessible name comes from `aria-label`. Because the portal is a sibling of the story wrapper, the theme has to be set on the `html` element — which is what the toolbar toggle does.",
      },
    },
  },
  argTypes: {
    maxWidth: {
      control: "select",
      options: ["sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl"],
    },
    onClose: { action: "closed" },
  },
  args: {
    open: true,
    title: "Export bundle",
    onClose: fn(),
    children: (
      <p className="m-0 text-sm">
        The bundle will include poses, the derived graph and rig metadata.
      </p>
    ),
  },
  render: (args) => <ModalHarness {...args} />,
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ClosedInitially: Story = {
  args: { open: false },
};

export const WithActions: Story = {
  args: {
    maxWidth: "md",
    children: (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm">
          This discards every unsaved edit in the working state.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary">Cancel</Button>
          <Button variant="danger">Discard</Button>
        </div>
      </div>
    ),
    title: "Discard changes",
  },
};

export const WithForm: Story = {
  args: {
    maxWidth: "md",
    title: "Name this pose",
    children: (
      <div className="flex flex-col gap-4">
        <Input placeholder="Pose name" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary">Cancel</Button>
          <Button variant="primary">Save</Button>
        </div>
      </div>
    ),
  },
};

export const Small: Story = {
  args: { maxWidth: "sm", title: "Confirm" },
};

export const ExtraLarge: Story = {
  args: { maxWidth: "5xl", title: "IR inspector" },
};

/** The body caps at `max-h-[80vh]` and scrolls; the header stays put. */
export const ScrollingBody: Story = {
  args: {
    title: "Machine report",
    children: (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 40 }, (_, index) => (
          <p key={index} className="m-0 text-sm">
            Diagnostic line {index + 1}: binding resolved against the runtime
            channel table.
          </p>
        ))}
      </div>
    ),
  },
};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
  parameters: {
    docs: {
      description: {
        story:
          "The backdrop is a fixed `bg-zinc-950/80` rather than a token, so it stays near-black in light mode.",
      },
    },
  },
};
