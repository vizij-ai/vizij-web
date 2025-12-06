import { startVitest } from "vitest/node";

const ctx = await startVitest("run", [], { passWithNoTests: true });
await ctx?.close();
