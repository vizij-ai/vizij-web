import type { BuildGraphResult } from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph-wasm";

let lastIrCompileWarningSignature: string | null = null;

export type RuntimeGraphSpec = {
  spec: GraphSpec;
  source: "legacy" | "ir";
};

export type ResolveRuntimeGraphSpecResult = {
  runtimeSpec: RuntimeGraphSpec | null;
  blocked: boolean;
  warning: string | null;
};

export const DEFAULT_RUNTIME_GRAPH_SPEC_RESULT: ResolveRuntimeGraphSpecResult =
  {
    runtimeSpec: null,
    blocked: false,
    warning: null,
  };

export function resolveRuntimeGraphSpec(
  rigGraphBuild: BuildGraphResult | null,
  lastKnownGood: RuntimeGraphSpec | null,
): ResolveRuntimeGraphSpecResult {
  if (!rigGraphBuild) {
    return { runtimeSpec: null, blocked: false, warning: null };
  }

  if (rigGraphBuild.ir) {
    try {
      const compiled = rigGraphBuild.ir.compile({ preferLegacySpec: false });
      if (compiled?.spec) {
        if (compiled.issues && compiled.issues.length > 0) {
          const faceId = rigGraphBuild.summary?.faceId ?? "unknown";
          const firstIssue =
            typeof compiled.issues[0] === "string"
              ? compiled.issues[0]
              : JSON.stringify(compiled.issues[0]);
          const signature = `${faceId}:${compiled.issues.length}:${firstIssue}`;
          if (signature !== lastIrCompileWarningSignature) {
            lastIrCompileWarningSignature = signature;
            const issuePreview = compiled.issues
              .slice(0, 3)
              .map((issue) =>
                typeof issue === "string" ? issue : JSON.stringify(issue),
              );
            const remaining = compiled.issues.length - issuePreview.length;
            if (remaining > 0) {
              issuePreview.push(`... ${remaining} more`);
            }
            // eslint-disable-next-line no-console -- diagnostics for IR compile
            console.warn(
              "[vizij-studio-support] IR runtime compile reported issues",
              issuePreview,
            );
          }
          return {
            runtimeSpec: lastKnownGood,
            blocked: true,
            warning:
              "IR compile reported issues. Runtime apply blocked until the IR compiles cleanly.",
          };
        }
        return {
          runtimeSpec: { spec: compiled.spec, source: "ir" },
          blocked: false,
          warning: null,
        };
      }
      return {
        runtimeSpec: lastKnownGood,
        blocked: true,
        warning: "IR compile failed: no spec produced",
      };
    } catch (error) {
      return {
        runtimeSpec: lastKnownGood,
        blocked: true,
        warning: `IR compile failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return {
    runtimeSpec: { spec: rigGraphBuild.spec, source: "legacy" },
    blocked: false,
    warning: null,
  };
}
