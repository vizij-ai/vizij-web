#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { StandardRigInput } from "@vizij/utils";

import {
  buildRigGraphSpec,
  type BuildGraphOptions,
  type BuildGraphResult,
} from "../graphBuilder";
import type { BindingMap, InputBindingMap } from "../state";

interface CliInputFile {
  faceId: string;
  animatables: BuildGraphOptions["animatables"];
  components: BuildGraphOptions["components"];
  bindings: BindingMap;
  inputs?: StandardRigInput[];
  inputBindings?: InputBindingMap;
  inputMetadata?: Record<string, unknown>[];
}

function usage(): never {
  console.error(
    "Usage: vizij-ir-report --input <path/to/buildGraphOptions.json>",
  );
  process.exit(1);
  throw new Error("Unreachable");
}

function parseArgs(argv: string[]): { inputPath: string } {
  const args = [...argv];
  let inputPath = "";
  while (args.length > 0) {
    const token = args.shift();
    if (!token) {
      break;
    }
    if (token === "--input" || token === "-i") {
      const value = args.shift();
      if (!value) {
        usage();
      }
      inputPath = value;
    } else if (token === "--help" || token === "-h") {
      usage();
    } else if (!token.startsWith("--") && !inputPath) {
      inputPath = token;
    }
  }
  if (!inputPath) {
    usage();
  }
  return { inputPath: resolve(process.cwd(), inputPath) };
}

function loadCliInput(path: string): BuildGraphOptions {
  const raw = JSON.parse(readFileSync(path, "utf-8")) as CliInputFile;
  const inputs = raw.inputs ?? [];
  const inputsById = new Map(inputs.map((input) => [input.id, input]));
  const inputMetadata = raw.inputMetadata
    ? new Map(
        raw.inputMetadata
          .map((entry) => ({
            id: (entry as { id?: string }).id,
            value: entry,
          }))
          .filter(
            (entry): entry is { id: string; value: Record<string, unknown> } =>
              Boolean(entry.id),
          )
          .map((entry) => [entry.id, entry.value]),
      )
    : undefined;

  return {
    faceId: raw.faceId,
    animatables: raw.animatables,
    components: raw.components,
    bindings: raw.bindings,
    inputsById,
    inputBindings: raw.inputBindings ?? {},
    inputMetadata,
  };
}

function printIssues(result: BuildGraphResult): void {
  console.log(`\nIR Diagnostics for face "${result.summary.faceId}"`);
  if (result.issues.fatal.length === 0) {
    console.log("• No fatal binding issues detected.");
  } else {
    console.log("• Fatal issues:");
    result.issues.fatal.forEach((issue) => console.log(`  - ${issue}`));
  }

  const targets = Object.entries(result.issues.byTarget);
  if (targets.length > 0) {
    console.log("\nPer-binding issues:");
    targets.forEach(([targetId, issues]) => {
      issues.forEach((issue) => {
        console.log(`  - ${targetId}: ${issue}`);
      });
    });
  }

  const irIssues = result.ir?.graph.issues ?? [];
  if (irIssues.length > 0) {
    console.log("\nIR issues:");
    irIssues.forEach((issue) => {
      console.log(
        `  - (${issue.severity}) ${issue.message}${
          issue.targetId ? ` [${issue.targetId}]` : ""
        }`,
      );
    });
  }
}

function printBindingSummary(
  result: BuildGraphResult,
  options: BuildGraphOptions,
): void {
  console.log("\nBinding summary:");
  const bindingIndex = new Map(
    Object.entries(options.bindings ?? {}) as [
      string,
      NonNullable<BuildGraphOptions["bindings"]>[string],
    ][],
  );
  result.summary.bindings.forEach((binding) => {
    const key = binding.targetId;
    const operatorSummary = summarizeOperators(bindingIndex.get(key));
    console.log(
      `  - ${binding.targetId} (${binding.slotAlias}): expr="${binding.expression}"${operatorSummary}`,
    );
    if (binding.issues && binding.issues.length > 0) {
      binding.issues.forEach((issue) => {
        console.log(`      • ${issue}`);
      });
    }
  });
}

function summarizeOperators(binding: unknown): string {
  if (
    !binding ||
    !Array.isArray((binding as { operators?: unknown }).operators)
  ) {
    return "";
  }
  const operators = (
    binding as { operators: Array<{ type: string; enabled: boolean }> }
  ).operators;
  const enabled = operators.filter((op) => op.enabled).map((op) => op.type);
  if (enabled.length === 0) {
    return "";
  }
  return ` operators=[${enabled.join(", ")}]`;
}

async function main(): Promise<void> {
  const { inputPath } = parseArgs(process.argv.slice(2));
  const options = loadCliInput(inputPath);
  const result = buildRigGraphSpec(options);
  console.log(
    `Loaded ${options.components.length} components / ${options.faceId} from ${inputPath}`,
  );
  printIssues(result);
  printBindingSummary(result, options);
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("[vizij-ir-report] Failed:", error);
  process.exit(1);
});
