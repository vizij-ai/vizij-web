import React from "react";
import { createRoot } from "react-dom/client";
import { VizijContext, createVizijStore } from "@vizij/render";
import App from "./App";
import { initializeMemoryInvestigation } from "./debug/memoryInvestigation";
import "@fontsource/questrial";
import "./styles.css";

initializeMemoryInvestigation();

const vizijStore = createVizijStore();

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <VizijContext.Provider value={vizijStore}>
      <App />
    </VizijContext.Provider>
  </React.StrictMode>,
);
