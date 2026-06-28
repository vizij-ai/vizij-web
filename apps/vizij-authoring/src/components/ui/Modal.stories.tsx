import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Modal } from "./Modal";
import { Button } from "./Button";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-16";

const meta: Meta<typeof Modal> = {
  title: "UI/Modal",
  component: Modal,
  parameters: { layout: "fullscreen", design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof Modal> = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <div style={{ padding: 24 }}>
        <Button variant="secondary" onClick={() => setOpen(true)}>Open dialog</Button>
        <Modal open={open} onClose={() => setOpen(false)} title="Dialog title" maxWidth="sm">
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            A short description of what this dialog asks the user to confirm.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>Confirm</Button>
          </div>
        </Modal>
      </div>
    );
  },
};
