import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Vizij,
  loadGLTF,
  loadGLTFFromBlob,
  exportScene,
  useVizijStore,
  useVizijStoreSetter,
} from "@vizij/render";
import type { World, Group, VizijData } from "@vizij/render";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import { getLookup } from "@vizij/utils";
import { AnimatableValuesPanel } from "./components/AnimatableValuesPanel";
import {
  extractAnimatableComponents,
  buildAnimatableValue,
  type ComponentOverrideMap,
} from "./rig/animatableMetadata";
import {
  createDefaultBindings,
  createDefaultInputValues,
  reconcileBindings,
  updateBindingWithInput,
  remapValue,
  createDefaultRemap,
  type BindingMap,
  type AnimatableBinding,
  type StandardInputValues,
} from "./rig/state";
import {
  STANDARD_RIG_INPUTS_BY_ID,
  type StandardRigInput,
} from "./rig/standardRigInputs";
import { buildRigGraphSpec } from "./rig/graphBuilder";
import { loadRigState, saveRigState } from "./rig/persistence";

const SAMPLE_ASSETS = [
  {
    label: "Hugo sample",
    url: "/samples/Hugo.glb",
  },
  {
    label: "Quori sample",
    url: "/samples/Quori.glb",
  },
] as const;

const DEFAULT_NAMESPACE = "default";

function findRootId(world: World): string | null {
  const root = Object.values(world).find(
    (entry): entry is Group =>
      entry.type === "group" && Boolean(entry.rootBounds),
  );
  return root ? root.id : null;
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function cloneRawValue(value: RawValue): RawValue {
  if (value && typeof value === "object") {
    return JSON.parse(JSON.stringify(value)) as RawValue;
  }
  return value;
}

function rawValuesEqual(
  a: RawValue | undefined,
  b: RawValue | undefined,
): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return false;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function sanitizeFaceId(value: string): string {
  const normalised = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalised || "robot";
}

function normaliseAssetLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return "";
  }
  const withoutParams = trimmed.split(/[?#]/, 1)[0];
  const withForwardSlashes = withoutParams.replace(/\\/g, "/");
  const segments = withForwardSlashes.split("/");
  const last = segments[segments.length - 1] ?? trimmed;
  const withoutExtension = last.replace(/\.[^.]+$/, "");
  return withoutExtension || last;
}

function deriveAutoFaceId(
  sourceName: string | null,
  rootRenderable: Group | undefined,
): string | null {
  if (sourceName) {
    const normalised = normaliseAssetLabel(sourceName);
    if (normalised) {
      return sanitizeFaceId(normalised);
    }
  }
  if (rootRenderable?.name) {
    return sanitizeFaceId(rootRenderable.name);
  }
  if (rootRenderable?.id) {
    return sanitizeFaceId(rootRenderable.id);
  }
  return null;
}

type Traversable = {
  traverse: (callback: (object: Record<string, any>) => void) => void;
};

function applyDefaultsToRobotData(
  bodies: Traversable[],
  animatablesById: Record<string, AnimatableValue>,
): void {
  bodies.forEach((root) => {
    root.traverse((object: Record<string, any>) => {
      const robotData = object.userData?.gltfExtensions?.RobotData;
      if (!robotData || !robotData.features) {
        return;
      }
      Object.values(robotData.features).forEach((feature: unknown) => {
        if (
          feature &&
          typeof feature === "object" &&
          (feature as { animated?: boolean }).animated &&
          (feature as { value?: AnimatableValue }).value
        ) {
          const current = (feature as { value: AnimatableValue }).value;
          const updated = animatablesById[current.id];
          if (updated) {
            (feature as { value: AnimatableValue }).value = {
              ...updated,
              default: cloneRawValue(
                updated.default as RawValue,
              ) as AnimatableValue["default"],
            } as AnimatableValue;
          }
        }
      });
    });
  });
}

export default function App() {
  const [rootId, setRootId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [assetUrl, setAssetUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportFileName, setExportFileName] = useState("vizij-export.glb");
  const [graphFileName, setGraphFileName] = useState("vizij-export.graph.json");

  const addWorldElements = useVizijStore((state) => state.addWorldElements);
  const getExportableBodies = useVizijStore(
    (state) => state.getExportableBodies,
  );
  const world = useVizijStore((state) => state.world);
  const animatables = useVizijStore((state) => state.animatables);
  const setValue = useVizijStore((state) => state.setValue);
  const values = useVizijStore((state) => state.values);
  const elementSelection = useVizijStore((state) => state.elementSelection);
  const clearSelection = useVizijStore((state) => state.clearSelection);
  const setStoreState = useVizijStoreSetter();

  const [faceId, setFaceId] = useState<string>("robot");
  const [inputValues, setInputValues] = useState<StandardInputValues>(() =>
    createDefaultInputValues(),
  );
  const [bindings, setBindings] = useState<BindingMap>(() =>
    createDefaultBindings([]),
  );
  const drivenAnimatablesRef = useRef<Set<string>>(new Set());
  const lastAutoFaceIdRef = useRef<string | null>(null);
  const lastLoadedFaceIdRef = useRef<string | null>(null);
  const skipPersistRef = useRef(false);

  const animatableComponents = useMemo(
    () => extractAnimatableComponents(animatables),
    [animatables],
  );

  const componentsById = useMemo(() => {
    return new Map(
      animatableComponents.map((component) => [component.id, component]),
    );
  }, [animatableComponents]);

  const handleInputValueChange = useCallback(
    (inputId: string, value: number) => {
      setInputValues((previous) => ({
        ...previous,
        [inputId]: value,
      }));
    },
    [],
  );

  const handleBindingInputChange = useCallback(
    (targetId: string, nextInputId: string | null) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      const inputMeta: StandardRigInput | undefined =
        nextInputId !== null
          ? STANDARD_RIG_INPUTS_BY_ID.get(nextInputId)
          : undefined;
      setBindings((previous) => {
        const fallback: AnimatableBinding = {
          targetId,
          inputId: null,
          remap: createDefaultRemap(component),
        };
        const current = previous[targetId] ?? fallback;
        const updated = updateBindingWithInput(current, component, inputMeta);
        if (updated === current) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: updated,
        };
      });
    },
    [componentsById],
  );

  const handleBindingRemapChange = useCallback(
    (
      targetId: string,
      field: "inMin" | "inMax" | "outMin" | "outMax",
      value: number,
    ) => {
      setBindings((previous) => {
        const binding = previous[targetId];
        if (!binding) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: {
            ...binding,
            remap: {
              ...binding.remap,
              [field]: value,
            },
          },
        };
      });
    },
    [],
  );

  const handleResetBinding = useCallback(
    (targetId: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      setBindings((previous) => {
        if (!previous[targetId]) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: {
            targetId,
            inputId: null,
            remap: createDefaultRemap(component),
          },
        };
      });
    },
    [componentsById],
  );

  const handleFaceIdChange = useCallback((next: string) => {
    setFaceId(sanitizeFaceId(next));
  }, []);

  const handleFocusSelectionIndex = useCallback(
    (index: number) => {
      setStoreState((state: VizijData) => {
        const current = state.elementSelection ?? [];
        if (index <= 0 || index >= current.length) {
          return {};
        }
        const next = current.slice();
        const [selected] = next.splice(index, 1);
        next.unshift(selected);
        return { elementSelection: next };
      });
    },
    [setStoreState],
  );

  const handleClearSelection = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  useEffect(() => {
    setBindings((previous) =>
      reconcileBindings(previous, animatableComponents),
    );
  }, [animatableComponents]);

  useEffect(() => {
    if (!faceId) {
      return;
    }
    if (lastLoadedFaceIdRef.current === faceId) {
      return;
    }
    const persisted = loadRigState(faceId);
    skipPersistRef.current = true;
    if (persisted) {
      setInputValues(persisted.inputValues);
      setBindings(reconcileBindings(persisted.bindings, animatableComponents));
    } else {
      setInputValues(createDefaultInputValues());
      setBindings(createDefaultBindings(animatableComponents));
    }
    setTimeout(() => {
      skipPersistRef.current = false;
    }, 0);
    lastLoadedFaceIdRef.current = faceId;
  }, [animatableComponents, faceId]);

  useEffect(() => {
    if (
      !faceId ||
      skipPersistRef.current ||
      animatableComponents.length === 0
    ) {
      return;
    }
    saveRigState({
      faceId,
      bindings,
      inputValues,
    });
  }, [animatableComponents, bindings, faceId, inputValues]);

  const rootRenderable = rootId
    ? (world[rootId] as Group | undefined)
    : undefined;

  useEffect(() => {
    const auto = deriveAutoFaceId(sourceName, rootRenderable);
    if (!auto) {
      return;
    }
    if (
      lastAutoFaceIdRef.current === null ||
      faceId === lastAutoFaceIdRef.current ||
      !faceId
    ) {
      setFaceId(auto);
    }
    lastAutoFaceIdRef.current = auto;
  }, [faceId, rootRenderable, sourceName]);

  useEffect(() => {
    const overrides = new Map<string, ComponentOverrideMap | number>();
    animatableComponents.forEach((component) => {
      const binding = bindings[component.id];
      if (!binding || !binding.inputId) {
        return;
      }
      const inputMeta = STANDARD_RIG_INPUTS_BY_ID.get(binding.inputId);
      const sourceValue =
        inputValues[binding.inputId] ?? inputMeta?.defaultValue ?? 0;
      const outputValue = remapValue(sourceValue, binding.remap);
      const existing = overrides.get(component.animatableId);
      if (component.component) {
        const nextOverrides: ComponentOverrideMap =
          existing && typeof existing !== "number" ? { ...existing } : {};
        nextOverrides[component.component] = outputValue;
        overrides.set(component.animatableId, nextOverrides);
      } else {
        overrides.set(component.animatableId, outputValue);
      }
    });

    const nextDriven = new Set<string>();
    overrides.forEach((override, animId) => {
      const animatable = animatables[animId];
      if (!animatable) {
        return;
      }
      const rawValue = buildAnimatableValue(animatable, override);
      setValue(animId, DEFAULT_NAMESPACE, rawValue);
      nextDriven.add(animId);
    });

    drivenAnimatablesRef.current.forEach((animId) => {
      if (nextDriven.has(animId)) {
        return;
      }
      const animatable = animatables[animId];
      if (!animatable) {
        return;
      }
      const resetValue = buildAnimatableValue(animatable, undefined);
      setValue(animId, DEFAULT_NAMESPACE, resetValue);
    });

    drivenAnimatablesRef.current = nextDriven;
  }, [animatableComponents, animatables, bindings, inputValues, setValue]);

  const loadVizij = useCallback(
    async (
      loader: () => Promise<[World, Record<string, AnimatableValue>]>,
      label: string,
    ) => {
      setIsLoading(true);
      setError(null);
      setRootId(null);
      try {
        const [worldData, anims] = await loader();
        const nextRootId = findRootId(worldData);
        if (!nextRootId) {
          throw new Error("Unable to find a Vizij root in the provided asset.");
        }

        setStoreState({
          values: new Map(),
          elementSelection: [],
        });
        addWorldElements(worldData, anims, true);
        setRootId(nextRootId);
        setSourceName(label);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        console.error("demo-vizij-render: failed to load Vizij", err);
      } finally {
        setIsLoading(false);
      }
    },
    [addWorldElements, setStoreState],
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      await loadVizij(
        () => loadGLTFFromBlob(file, [DEFAULT_NAMESPACE], true),
        file.name,
      );
      event.target.value = "";
    },
    [loadVizij],
  );

  const handleUrlSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = assetUrl.trim();
      if (!trimmed) {
        return;
      }
      await loadVizij(
        () => loadGLTF(trimmed, [DEFAULT_NAMESPACE], true),
        trimmed,
      );
    },
    [assetUrl, loadVizij],
  );

  const handleLoadSample = useCallback(
    async (sampleUrl: string, label: string) => {
      setAssetUrl(sampleUrl);
      await loadVizij(
        () => loadGLTF(sampleUrl, [DEFAULT_NAMESPACE], true),
        label,
      );
    },
    [loadVizij],
  );

  const collectAnimatableExportState = useCallback(() => {
    const nextAnimatables = { ...animatables };
    const nextValues = new Map(values);
    let appliedOverrides = false;

    for (const [animId, animatable] of Object.entries(animatables)) {
      const lookupKey = getLookup(DEFAULT_NAMESPACE, animId);
      if (!nextValues.has(lookupKey)) {
        continue;
      }
      appliedOverrides = true;
      const override = nextValues.get(lookupKey);
      nextValues.delete(lookupKey);
      if (override !== undefined) {
        const overrideClone = cloneRawValue(override);
        if (!rawValuesEqual(animatable.default as RawValue, overrideClone)) {
          nextAnimatables[animId] = {
            ...animatable,
            default: overrideClone as unknown as typeof animatable.default,
          } as AnimatableValue;
        }
      }
    }

    return {
      appliedOverrides,
      nextAnimatables,
      nextValues,
      effectiveAnimatables: appliedOverrides ? nextAnimatables : animatables,
    };
  }, [animatables, values]);

  const handleExportGraph = useCallback(() => {
    const trimmedName = graphFileName.trim();
    const desiredName =
      trimmedName.length > 0 ? trimmedName : "vizij-export.graph.json";
    const fileName = desiredName.toLowerCase().endsWith(".json")
      ? desiredName
      : `${desiredName}.json`;

    const { effectiveAnimatables } = collectAnimatableExportState();

    const graphResult = buildRigGraphSpec({
      faceId,
      animatables: effectiveAnimatables,
      components: animatableComponents,
      bindings,
    });

    const baseName = fileName.replace(/\.json$/i, "");
    const specFileName = `${baseName.length > 0 ? baseName : "vizij-export.graph"}.json`;
    const summaryFileName = `${baseName.length > 0 ? baseName : "vizij-export.graph"}.summary.json`;

    const graphBlob = new Blob([JSON.stringify(graphResult.spec, null, 2)], {
      type: "application/json",
    });
    downloadBlob(graphBlob, specFileName);

    const summaryBlob = new Blob(
      [JSON.stringify(graphResult.summary, null, 2)],
      {
        type: "application/json",
      },
    );
    downloadBlob(summaryBlob, summaryFileName);
  }, [
    animatableComponents,
    bindings,
    collectAnimatableExportState,
    faceId,
    graphFileName,
  ]);

  const handleExportGlb = useCallback(async () => {
    const trimmedName = exportFileName.trim();
    const desiredName =
      trimmedName.length > 0 ? trimmedName : "vizij-export.glb";
    const downloadName = desiredName.toLowerCase().endsWith(".glb")
      ? desiredName
      : `${desiredName}.glb`;

    const {
      appliedOverrides,
      nextAnimatables,
      nextValues,
      effectiveAnimatables,
    } = collectAnimatableExportState();

    if (appliedOverrides) {
      setStoreState((prev) => ({
        ...prev,
        animatables: nextAnimatables,
        values: nextValues,
      }));
    }

    await waitForNextFrame();

    const bodies = getExportableBodies(rootId ? [rootId] : undefined);
    if (!bodies.length) {
      window.alert("Load a Vizij asset before exporting.");
      return;
    }

    applyDefaultsToRobotData(bodies, effectiveAnimatables);

    exportScene(bodies[0], downloadName);
  }, [
    collectAnimatableExportState,
    exportFileName,
    getExportableBodies,
    rootId,
    setStoreState,
  ]);

  const canExport = Boolean(rootId) && !isLoading;

  const statusMessage = useMemo(() => {
    if (isLoading) {
      return "Loading Vizij…";
    }
    if (error) {
      return `Failed to load Vizij: ${error}`;
    }
    if (rootId) {
      return `Loaded ${sourceName ?? "Vizij"}`;
    }
    return "Load a Vizij GLB to begin.";
  }, [error, isLoading, rootId, sourceName]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="sidebar__header">
          <h1>Vizij Renderer</h1>
          <p>Load a Vizij GLB, explore its structure, and export it again.</p>
        </header>

        <section className="sidebar__section">
          <div className="sidebar__panel">
            <div className="sidebar__panel-header">
              <h2 className="sidebar__panel-title">Load a Vizij</h2>
            </div>
            <label className="sidebar__label" htmlFor="vizij-file">
              Choose a local .glb file
            </label>
            <input
              id="vizij-file"
              type="file"
              accept=".glb,.gltf"
              onChange={handleFileChange}
              disabled={isLoading}
            />
            <form className="sidebar__form" onSubmit={handleUrlSubmit}>
              <label className="sidebar__label" htmlFor="vizij-url">
                Or load from URL
              </label>
              <div className="sidebar__form-row">
                <input
                  id="vizij-url"
                  type="url"
                  placeholder="https://example.com/robot.glb"
                  value={assetUrl}
                  onChange={(event) => setAssetUrl(event.target.value)}
                  disabled={isLoading}
                />
                <button type="submit" disabled={isLoading}>
                  Load
                </button>
              </div>
            </form>
            <div className="sidebar__samples">
              <h3>Quick samples</h3>
              {SAMPLE_ASSETS.map((sample) => (
                <button
                  key={sample.url}
                  type="button"
                  onClick={() => handleLoadSample(sample.url, sample.label)}
                  disabled={isLoading}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="sidebar__section">
          <div className="sidebar__panel">
            <div className="sidebar__panel-header">
              <h2 className="sidebar__panel-title">Export Vizij GLB</h2>
            </div>
            <p className="sidebar__panel-description">
              Save a Vizij GLB that bakes in the animatable overrides you
              currently have applied to the selected robot.
            </p>
            <label className="sidebar__label" htmlFor="vizij-graph-name">
              Graph file name
            </label>
            <div className="sidebar__form-row">
              <input
                id="vizij-graph-name"
                type="text"
                value={graphFileName}
                placeholder="vizij-export.graph.json"
                onChange={(event) => setGraphFileName(event.target.value)}
                disabled={!rootId || isLoading}
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => {
                  handleExportGraph();
                }}
                disabled={!canExport}
              >
                Export graph
              </button>
            </div>
            <label className="sidebar__label" htmlFor="vizij-export-name">
              GLB file name
            </label>
            <div className="sidebar__form-row">
              <input
                id="vizij-export-name"
                type="text"
                value={exportFileName}
                placeholder="vizij-export.glb"
                onChange={(event) => setExportFileName(event.target.value)}
                disabled={!rootId || isLoading}
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => {
                  void handleExportGlb();
                }}
                disabled={!canExport}
              >
                Export GLB
              </button>
            </div>
            <p className="sidebar__hint">
              Export the graph JSON separately from the Vizij GLB to share both
              bindings and geometry.
            </p>
          </div>
        </section>
      </aside>

      <main className="viewer">
        <header className="viewer__header">
          <div>
            <h2>{sourceName ?? "No Vizij loaded"}</h2>
            <p>{statusMessage}</p>
          </div>
          {rootRenderable && (
            <div className="viewer__root-meta">
              <span>Root: {rootRenderable.name || rootRenderable.id}</span>
              <span>Children: {rootRenderable.children.length}</span>
            </div>
          )}
        </header>
        <div className="viewer__canvas">
          {rootId ? (
            <Vizij
              rootId={rootId}
              namespace={DEFAULT_NAMESPACE}
              showSafeArea={false}
              onPointerMissed={(event) => {
                if (event.button === 0) {
                  handleClearSelection();
                }
              }}
            />
          ) : (
            <div className="viewer__placeholder">
              <p>Load a Vizij asset to render it here.</p>
            </div>
          )}
        </div>
      </main>

      <aside className="sidebar sidebar--right">
        <AnimatableValuesPanel
          namespace={DEFAULT_NAMESPACE}
          faceId={faceId}
          onFaceIdChange={handleFaceIdChange}
          selectionStack={elementSelection}
          onFocusSelectionIndex={handleFocusSelectionIndex}
          onClearSelection={handleClearSelection}
          components={animatableComponents}
          bindings={bindings}
          onBindingInputChange={handleBindingInputChange}
          onBindingRemapChange={handleBindingRemapChange}
          onResetBinding={handleResetBinding}
          inputValues={inputValues}
          onInputValueChange={handleInputValueChange}
        />
      </aside>
    </div>
  );
}
