import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const originalWarn = console.warn;

console.warn = (...args: Parameters<typeof console.warn>) => {
  const [first] = args;
  if (
    typeof first === "string" &&
    first.includes("Multiple instances of Three.js being imported")
  ) {
    return;
  }
  originalWarn(...args);
};

afterEach(() => {
  cleanup();
});
