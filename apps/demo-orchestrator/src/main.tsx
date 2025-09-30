import { createRoot } from "react-dom/client";
import App from "./App";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element");
}

const root = createRoot(container);
root.render(<App />);
