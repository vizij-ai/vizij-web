import React from "react";
import { createRoot } from "react-dom/client";
import { OrchestratorProvider } from "@vizij/orchestrator-react";
import { FaceApp } from "./FaceApp";

const root = createRoot(document.getElementById("root")!);
root.render(
  <OrchestratorProvider autostart={false}>
    <FaceApp />
  </OrchestratorProvider>,
);
