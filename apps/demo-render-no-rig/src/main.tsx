import ReactDOM from "react-dom/client";
import { VizijContext, createVizijStore } from "@vizij/render";
import { OrchestratorProvider } from "@vizij/orchestrator-react";

import App from "./App";
import "./styles.css";

const vizijStore = createVizijStore();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <VizijContext.Provider value={vizijStore}>
    <OrchestratorProvider autostart>
      <App />
    </OrchestratorProvider>
  </VizijContext.Provider>,
);
