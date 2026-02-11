import type { BuildGraphResult } from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph-wasm";

export type RuntimeGraphSpec = {
  spec: GraphSpec;
  source: "legacy" | "ir";
};

export type ResolveRuntimeGraphSpecResult = {
  runtimeSpec: RuntimeGraphSpec | null;
  blocked: boolean;
  warning: string | null;
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
          // eslint-disable-next-line no-console -- diagnostics for IR compile
          console.warn(
            "[vizij-authoring] IR runtime compile reported issues",
            compiled.issues,
          );
          return {
            runtimeSpec: { spec: rigGraphBuild.spec, source: "legacy" },
            blocked: false,
            warning:
              "IR compile reported issues; using legacy spec for runtime.",
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
