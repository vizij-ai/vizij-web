import { createRoot } from "react-dom/client";
import App from "./App";
import { AppStateProvider } from "./state/AppStateContext";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("demo-vizij-player: missing root element");
}

createRoot(rootElement).render(
  <AppStateProvider>
    <App />
  </AppStateProvider>,
);
