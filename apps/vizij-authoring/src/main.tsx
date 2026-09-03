import React from "react";
import { createRoot } from "react-dom/client";
import { VizijContext, createVizijStore } from "@vizij/render";
import App from "./App";
import { SemioThemeProvider } from "./providers/SemioTheme";
import { initializeMemoryInvestigation } from "./debug/memoryInvestigation";
// `@semio/ui/styles.css` resolves to the package's PRECOMPILED sheet
// (`dist/semio-ui.css`). Do not switch to `@semio/ui/dist/styles.css`: that is
// the raw Tailwind entry and contains `@source "../src"`, but the published
// tarball ships no `src/` directory, so out-of-tree it resolves to nothing.
//
// It is imported here as a sibling module rather than `@import`-ed from
// ./styles.css so the app's Tailwind never re-parses 140kB of already-compiled
// output, and so source order stays deterministic: semio's `@layer theme`
// tokens land first and ./styles.css overrides them unlayered.
import "@semio/ui/styles.css";
import "./styles.css";

initializeMemoryInvestigation();

const vizijStore = createVizijStore();

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <VizijContext.Provider value={vizijStore}>
      <SemioThemeProvider>
        <App />
      </SemioThemeProvider>
    </VizijContext.Provider>
  </React.StrictMode>,
);
