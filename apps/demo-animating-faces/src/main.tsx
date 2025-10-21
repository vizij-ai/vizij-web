import { createRoot } from "react-dom/client";
import { VizijContext, createVizijStore } from "@vizij/render";
import { OrchestratorProvider } from "@vizij/orchestrator-react";

import App from "./App";
import { AppStateProvider } from "./state/AppStateContext";
import "./styles.css";

const vizijStore = createVizijStore();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("demo-animating-faces: missing root element");
}

const root = createRoot(rootElement);

root.render(
  <VizijContext.Provider value={vizijStore}>
    <AppStateProvider>
      <OrchestratorProvider autoCreate={false} autostart={false}>
        <App />
      </OrchestratorProvider>
    </AppStateProvider>
  </VizijContext.Provider>,
);
