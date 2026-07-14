import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { StudioOwnerPrompt } from "./components/StudioOwnerPrompt";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
    {/* Fixed-position overlay: shows only when built with the studio-bridge
        feature and no device owner is known yet. Renders nothing otherwise, so
        it is safe to mount above App regardless of the app's load state. */}
    <StudioOwnerPrompt />
  </React.StrictMode>,
);
