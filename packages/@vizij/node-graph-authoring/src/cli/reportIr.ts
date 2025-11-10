#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { StandardRigInput } from "@vizij/utils";

import {
  buildRigGraphSpec,
  type BuildGraphOptions,
  type BuildGraphResult,
} from "../graphBuilder";
import type { BindingMap, InputBindingMap } from "../state";
import {
  MACHINE_REPORT_VERSION,
  buildMachineReport,
  diffMachineReports,
  type MachineReport,
} from "../ir/inspection";

interface CliInputFile {
  faceId: string;
  animatables: BuildGraphOptions["animatables"];
  components: BuildGraphOptions["components"];
  bindings: BindingMap;
  inputs?: StandardRigInput[];
  inputBindings?: InputBindingMap;
  inputMetadata?: Record<string, unknown>[];
}

interface CliArgs {
  inputPath: string;
  dumpPath?: string;
  diffPath?: string;
  diffLimit?: number;
}

function usage(): never {
  console.error(
    [
      "Usage: vizij-ir-report --input <path/to/buildGraphOptions.json> [options]",
      "",
      "Options:",
      "  --dump <path|->         Write normalized machine-readable report (use '-' for stdout).",
      "  --diff <path|->         Compare against a dumped report (use '-' or 'stdin').",
      "  --diff-limit <number>   Maximum diff entries to emit (default 50).",
      "  -h, --help              Show this message.",
    ].join("\n"),
  );
  process.exit(1);
  throw new Error("Unreachable");
}

function parseArgs(argv: string[]): CliArgs {
  const args = [...argv];
  let inputPath = "";
  let dumpPath: string | undefined;
  let diffPath: string | undefined;
  let diffLimit: number | undefined;
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
    } else if (token === "--dump" || token === "--dump-json") {
      const value = args.shift();
      if (!value) {
        usage();
      }
      dumpPath = normalizeStreamToken(value);
    } else if (token === "--diff") {
      const value = args.shift();
      if (!value) {
        usage();
      }
      diffPath = normalizeStreamToken(value);
    } else if (token === "--diff-limit") {
      const value = args.shift();
      if (!value) {
        usage();
      }
      diffLimit = parsePositiveInteger(value, "--diff-limit");
    } else if (!token.startsWith("--") && !inputPath) {
      inputPath = token;
    }
  }
  if (!inputPath) {
    usage();
  }
  return {
    inputPath: resolve(process.cwd(), inputPath),
    dumpPath: resolveOptionalPath(dumpPath),
    diffPath: resolveOptionalPath(diffPath),
    diffLimit,
  };
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
  const { inputPath, dumpPath, diffPath, diffLimit } = parseArgs(
    process.argv.slice(2),
  );
  const options = loadCliInput(inputPath);
  const result = buildRigGraphSpec(options);
  const machineReport = buildMachineReport(result);

  if (
    diffPath &&
    dumpPath &&
    diffPath !== "-" &&
    dumpPath !== "-" &&
    diffPath === dumpPath
  ) {
    throw new Error(
      "Cannot reuse the same file path for --dump and --diff. Provide separate files.",
    );
  }

  if (diffPath) {
    if (dumpPath === "-") {
      throw new Error("Cannot dump to stdout while running --diff.");
    }
    if (dumpPath) {
      writeMachineDump(machineReport, dumpPath);
    }
    const baseline = loadMachineDump(diffPath);
    validateReportVersion(baseline.reportVersion);
    const diffResult = diffMachineReports(machineReport, baseline, {
      limit: diffLimit,
    });
    const diffPayload = {
      mode: "diff" as const,
      reportVersion: MACHINE_REPORT_VERSION,
      faceId: machineReport.faceId,
      inputPath,
      baselinePath: diffPath,
      equal: diffResult.equal,
      differenceCount: diffResult.differences.length,
      limitReached: diffResult.limitReached,
      differences: diffResult.differences,
    };
    console.log(JSON.stringify(diffPayload, null, 2));
    process.exitCode = diffResult.equal ? 0 : 1;
    return;
  }

  if (dumpPath) {
    writeMachineDump(machineReport, dumpPath);
    return;
  }

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

function resolveOptionalPath(path: string | undefined): string | undefined {
  if (!path || path === "-") {
    return path;
  }
  return resolve(process.cwd(), path);
}

function normalizeStreamToken(value: string): string {
  const lower = value.toLowerCase();
  if (lower === "-" || lower === "stdout" || lower === "stdin") {
    return "-";
  }
  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`Invalid value for ${flag}: ${value}`);
    usage();
  }
  return parsed;
}

function writeMachineDump(report: MachineReport, target: string): void {
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  if (target === "-") {
    process.stdout.write(payload);
    return;
  }
  writeFileSync(target, payload, "utf-8");
}

function loadMachineDump(path: string): MachineReport {
  const content =
    path === "-" ? readFileSync(0, "utf-8") : readFileSync(path, "utf-8");
  try {
    const parsed = JSON.parse(content) as MachineReport;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.reportVersion !== "number"
    ) {
      throw new Error("Invalid machine report structure.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse machine-readable report JSON.");
    }
    throw error;
  }
}

function validateReportVersion(version: number): void {
  if (version !== MACHINE_REPORT_VERSION) {
    throw new Error(
      `Machine report version mismatch (expected ${MACHINE_REPORT_VERSION}, received ${version}).`,
    );
  }
}
