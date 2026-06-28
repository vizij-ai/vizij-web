import figma from "@figma/code-connect";
import { Modal } from "./Modal";

figma.connect(
  Modal,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-16",
  {
    example: () => (
      <Modal open onClose={() => {}} title="Dialog title">
        Modal content
      </Modal>
    ),
  },
);
