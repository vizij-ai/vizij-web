import React from "react";
import { createRoot } from "react-dom/client";
import { VizijContext, createVizijStore } from "@vizij/render";
import App from "./App";
import { initializeMemoryInvestigation } from "./debug/memoryInvestigation";
import { SemioAnimationSheetSpike } from "./components/animation/spike/SemioAnimationSheetSpike";
import "./styles.css";

initializeMemoryInvestigation();

/**
 * `?semioSpike=1` renders the Phase 1 adoption spike alone, with no face load
 * and no runtime — see docs/plans/TIMELINE_ADOPTION_PLAN_2026-09-03.md. Kept
 * out of the app tree so the spike cannot perturb, or be perturbed by, the
 * authoring session.
 */
const spikeRequested =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("semioSpike") === "1";

const vizijStore = createVizijStore();

const root = createRoot(document.getElementById("root")!);

if (spikeRequested) {
  root.render(
    <React.StrictMode>
      <SemioAnimationSheetSpike height={360} />
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <VizijContext.Provider value={vizijStore}>
        <App />
      </VizijContext.Provider>
    </React.StrictMode>,
  );
}
