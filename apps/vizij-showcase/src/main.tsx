import React from "react";
import { createRoot } from "react-dom/client";
import { FaceApp } from "./FaceApp";

const root = createRoot(document.getElementById("root")!);
root.render(<FaceApp />);
