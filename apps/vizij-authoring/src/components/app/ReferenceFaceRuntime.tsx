import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { VizijRuntimeProvider, useVizijRuntime } from "@vizij/runtime-react";
import type { VizijBundleExtension } from "@vizij/render";
import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import { readGlbChunks } from "../../animationImport/gltfAccessors";
import {
  isPoseControlInputPath,
  isPoseOutputInputPath,
  isPoseWeightInputPath,
} from "../../poseRig/utils";
import { Button } from "../ui";
import { RuntimeFaceControlsOverlay } from "./RuntimeFaceControlsOverlay";
import { buildRuntimeInputCatalogFromDescription } from "./runtimeInputsFromConstraints";
import { RuntimeFaceFrame } from "./RuntimeFaceFrame";

type ReferenceFaceRuntimeProps = {
  file?: File | null;
  active?: boolean;
  fallback?: ReactNode;
  /** Whether the reference face is on screen: its device runs only then. */
  visible?: boolean;
  /** Called when standard inputs are detected from the loaded face */
  onStandardInputsReady?: (
    inputs: StandardRigInput[],
    byId: Map<string, StandardRigInput>,
  ) => void;
  /** Called when loading state changes */
  onLoadingStateChange?: (isLoading: boolean, isLoaded: boolean) => void;
  /** Called with the function that writes an input of the reference face by
   * its rig path, or `undefined` while no face is ready. */
  onAnimateValueReady?: (
    animateValue: ((path: string, value: number) => void) | undefined,
  ) => void;
  /** Called when any standard input value changes on the reference face (from any source) */
  onStandardInputChange?: (inputId: string, value: number) => void;
  /** Called with the `VIZIJ_bundle` of the loaded file, `null` when it has none. */
  onBundleReady?: (bundle: VizijBundleExtension | null) => void;
  /** Whether the split is vertical */
  splitVertical?: boolean;
  /** Callback to toggle split orientation */
  onToggleSplit?: () => void;
};

/** The keys of an input the rig reads through `override/<id>/…` rather than
 * at its own path. */
interface OverrideRoute {
  valuePath: string | null;
  enabledPath: string | null;
}

/**
 * The override keys the device lists under `prefix` (`P("override/")`), by
 * input id: `<prefix><id>/value` and `<prefix><id>/enabled`.
 */
function overrideRoutesByInputId(
  paths: ReadonlyArray<string>,
  prefix: string,
): Map<string, OverrideRoute> {
  const routes = new Map<string, OverrideRoute>();
  for (const path of paths) {
    if (!path.startsWith(prefix)) {
      continue;
    }
    const match = path.slice(prefix.length).match(/^([^/]+)\/(enabled|value)$/);
    if (!match) {
      continue;
    }
    const [, inputId, field] = match;
    const route = routes.get(inputId) ?? { valuePath: null, enabledPath: null };
    route[field === "enabled" ? "enabledPath" : "valuePath"] = path;
    routes.set(inputId, route);
  }
  return routes;
}

/**
 * The `VIZIJ_bundle` a GLB carries, where the face's device reads it: on a
 * node, else on the document's root. `null` for a GLB without one, or bytes
 * that are not a GLB.
 */
function readGlbBundle(bytes: ArrayBuffer): VizijBundleExtension | null {
  let json: Record<string, unknown>;
  try {
    json = readGlbChunks(bytes).json;
  } catch {
    return null;
  }
  const bundleOf = (holder: unknown): VizijBundleExtension | null => {
    const extensions =
      holder && typeof holder === "object"
        ? (holder as { extensions?: unknown }).extensions
        : null;
    const bundle =
      extensions && typeof extensions === "object"
        ? (extensions as { VIZIJ_bundle?: unknown }).VIZIJ_bundle
        : null;
    return bundle && typeof bundle === "object"
      ? (bundle as VizijBundleExtension)
      : null;
  };
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  for (const node of nodes) {
    const bundle = bundleOf(node);
    if (bundle) {
      return bundle;
    }
  }
  return bundleOf(json);
}

/**
 * The reference face: the user's file loaded as its own Vizij, composed as
 * the main face is, running while it is visible. It reports its rig's inputs
 * and its bundle, and takes the main face's edits by rig path.
 */
export function ReferenceFaceRuntime({
  file = null,
  active = true,
  fallback = null,
  visible = true,
  onStandardInputsReady,
  onLoadingStateChange,
  onAnimateValueReady,
  onStandardInputChange,
  onBundleReady,
  splitVertical,
  onToggleSplit,
}: ReferenceFaceRuntimeProps) {
  useEffect(() => {
    if (!file || !active) {
      return;
    }
    let current = true;
    void file.arrayBuffer().then(
      (bytes) => {
        if (current) {
          onBundleReady?.(readGlbBundle(bytes));
        }
      },
      (error: unknown) => {
        console.error(
          "[vizij-authoring] the reference face's file did not read",
          error,
        );
      },
    );
    return () => {
      current = false;
    };
  }, [active, file, onBundleReady]);

  if (!active) {
    return <>{fallback}</>;
  }

  if (!file) {
    return (
      <ReferenceFacePlaceholder
        splitVertical={splitVertical}
        onToggleSplit={onToggleSplit}
      />
    );
  }

  return (
    <VizijRuntimeProvider glb={file} run={visible}>
      <ReferenceFaceBridge
        onStandardInputsReady={onStandardInputsReady}
        onLoadingStateChange={onLoadingStateChange}
        onAnimateValueReady={onAnimateValueReady}
        onStandardInputChange={onStandardInputChange}
        splitVertical={splitVertical}
        onToggleSplit={onToggleSplit}
      />
    </VizijRuntimeProvider>
  );
}

type ReferenceFaceBridgeProps = Pick<
  ReferenceFaceRuntimeProps,
  | "onStandardInputsReady"
  | "onLoadingStateChange"
  | "onAnimateValueReady"
  | "onStandardInputChange"
  | "splitVertical"
  | "onToggleSplit"
>;

/**
 * Connects the reference face's device to the callbacks: its rig's inputs,
 * its loading state, the writes the main face's edits mirror onto it, and
 * the reset of its inputs. It renders the face's slot.
 */
function ReferenceFaceBridge({
  onStandardInputsReady,
  onLoadingStateChange,
  onAnimateValueReady,
  onStandardInputChange,
  splitVertical,
  onToggleSplit,
}: ReferenceFaceBridgeProps) {
  const { status, runtime, description } = useVizijRuntime();
  const ready = status === "ready";
  const onStandardInputChangeRef = useRef(onStandardInputChange);
  onStandardInputChangeRef.current = onStandardInputChange;

  const {
    inputs: standardInputs,
    byId: standardInputsById,
    byPath: standardInputsByPath,
  } = useMemo(
    () => buildRuntimeInputCatalogFromDescription(ready ? description : null),
    [description, ready],
  );

  const [overrideRoutes, setOverrideRoutes] = useState<
    Map<string, OverrideRoute>
  >(() => new Map());
  useEffect(() => {
    setOverrideRoutes(new Map());
    if (!runtime) {
      return;
    }
    let current = true;
    const prefix = runtime.path("override/");
    runtime.listKeys(prefix).then(
      (keys) => {
        if (current) {
          setOverrideRoutes(
            overrideRoutesByInputId(
              keys.map((key) => key.path),
              prefix,
            ),
          );
        }
      },
      (error: unknown) => {
        console.error(
          "[vizij-authoring] the reference face's override keys did not list",
          error,
        );
      },
    );
    return () => {
      current = false;
    };
  }, [runtime]);

  /** The route an input's value takes: its override keys when the rig reads
   * it there (a pose weight never is), else its own key. */
  const routeOf = useCallback(
    (input: StandardRigInput) => {
      const route = overrideRoutes.get(input.id);
      return route?.valuePath && !isPoseWeightInputPath(input.path)
        ? route
        : null;
    },
    [overrideRoutes],
  );

  const stageStandardInputPath = useCallback(
    (inputPath: string, value: number) => {
      if (!runtime) {
        return;
      }
      const normalizedInputPath = normalizeStandardRigInputPath(inputPath);
      const input = standardInputsByPath.get(normalizedInputPath);
      if (!input) {
        const relative =
          normalizedInputPath && normalizedInputPath !== "/custom/input"
            ? normalizedInputPath
            : inputPath;
        runtime.setValue(runtime.path(relative.replace(/^\/+/, "")), value);
        return;
      }
      const route = routeOf(input);
      if (route?.valuePath) {
        if (route.enabledPath) {
          runtime.setValue(route.enabledPath, 1);
        }
        runtime.setValue(route.valuePath, value);
      } else {
        runtime.setValue(runtime.path(input.path.replace(/^\/+/, "")), value);
      }
      onStandardInputChangeRef.current?.(input.id, value);
    },
    [routeOf, runtime, standardInputsByPath],
  );

  useEffect(() => {
    onLoadingStateChange?.(status === "loading", ready);
  }, [onLoadingStateChange, ready, status]);

  useEffect(() => {
    onStandardInputsReady?.(standardInputs, standardInputsById);
  }, [onStandardInputsReady, standardInputs, standardInputsById]);

  useEffect(() => {
    onAnimateValueReady?.(ready ? stageStandardInputPath : undefined);
  }, [onAnimateValueReady, ready, stageStandardInputPath]);

  const handleResetInputs = useCallback(() => {
    if (!runtime) {
      return;
    }
    const resettable = standardInputs.filter(
      (input) =>
        !isPoseControlInputPath(input.path) &&
        !isPoseOutputInputPath(input.path) &&
        input.id.trim().length > 0,
    );
    // Back to rest, overrides included: an input read through its override
    // returns to the rig's own composition with `enabled` at rest.
    const keys = resettable.flatMap((input) => {
      const route = routeOf(input);
      return route
        ? [route.valuePath, route.enabledPath].filter(
            (path): path is string => path !== null,
          )
        : [runtime.path(input.path.replace(/^\/+/, ""))];
    });
    void runtime
      .invoke("reset_keys", { keys: { strs: keys } })
      .catch((error: unknown) => {
        console.error(
          "[vizij-authoring] the reference face's inputs did not reset",
          error,
        );
      });
    resettable.forEach((input) => {
      onStandardInputChangeRef.current?.(
        input.id,
        Number.isFinite(input.defaultValue) ? input.defaultValue : 0,
      );
    });
  }, [routeOf, runtime, standardInputs]);

  return (
    <div
      data-testid="reference-face-runtime"
      className="h-full w-full overflow-hidden"
    >
      <RuntimeFaceFrame
        variant="fill"
        className="h-full w-full"
        overlay={
          <RuntimeFaceControlsOverlay
            onResetInputs={handleResetInputs}
            onToggleSplit={onToggleSplit}
            splitVertical={splitVertical}
            resetButtonLabel="Reset Reference Inputs"
            resetButtonTitle="Reset reference-face inputs to their default values"
            resetButtonTestId="reference-runtime-reset-inputs"
            readyFlagTestId="reference-runtime-ready-flag"
          />
        }
      />
    </div>
  );
}

type ReferenceFacePlaceholderProps = {
  splitVertical?: boolean;
  onToggleSplit?: () => void;
};

function ReferenceFacePlaceholder({
  splitVertical,
  onToggleSplit,
}: ReferenceFacePlaceholderProps) {
  return (
    <div className="h-full w-full relative bg-bg-panel overflow-hidden">
      {onToggleSplit && (
        <div className="absolute top-2 left-2 z-10">
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleSplit}
            title={
              splitVertical
                ? "Switch to horizontal split"
                : "Switch to vertical split"
            }
          >
            {splitVertical ? "⬌" : "⬍"}
          </Button>
        </div>
      )}
      <div className="flex h-full w-full items-center justify-center p-8 text-center">
        <p className="text-text-muted text-sm max-w-xs">
          Load a reference face GLB using the sidebar to begin.
        </p>
      </div>
    </div>
  );
}
