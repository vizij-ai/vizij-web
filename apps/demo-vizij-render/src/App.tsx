import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
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
import type { World, Group, Feature, Selection } from "@vizij/render";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import { getLookup } from "@vizij/utils";
import { AnimatableValuesPanel } from "./components/AnimatableValuesPanel";
import { formatConstraints, formatRawValue } from "./utils/format";

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

type FeatureEntry = [string, Feature];

type AnimatedFeatureEntry = FeatureEntry & {
  1: Feature & { animated: true; value: string };
};

type StaticFeatureEntry = FeatureEntry & {
  1: Feature & { animated: false };
};

function findRootId(world: World): string | null {
  const root = Object.values(world).find(
    (entry): entry is Group =>
      entry.type === "group" && Boolean(entry.rootBounds),
  );
  return root ? root.id : null;
}

function isFeature(value: Feature | undefined): value is Feature {
  return Boolean(value);
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
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

  const addWorldElements = useVizijStore((state) => state.addWorldElements);
  const getExportableBodies = useVizijStore(
    (state) => state.getExportableBodies,
  );
  const world = useVizijStore((state) => state.world);
  const animatables = useVizijStore((state) => state.animatables);
  const values = useVizijStore((state) => state.values);
  const elementSelection = useVizijStore((state) => state.elementSelection);
  const setStoreState = useVizijStoreSetter();

  const [selectedElement, setSelectedElement] = useState<Selection | null>(
    null,
  );

  useEffect(() => {
    if (elementSelection.length > 0) {
      setSelectedElement(elementSelection[elementSelection.length - 1]);
    } else {
      setSelectedElement(null);
    }
  }, [elementSelection]);

  const selectedRenderable = selectedElement
    ? world[selectedElement.id]
    : undefined;

  const rootRenderable = rootId
    ? (world[rootId] as Group | undefined)
    : undefined;

  const featureEntries = useMemo(() => {
    if (!selectedElement) {
      return [] as FeatureEntry[];
    }
    const renderable = world[selectedElement.id];
    if (!renderable) {
      return [] as FeatureEntry[];
    }
    return (
      Object.entries(renderable.features) as [string, Feature | undefined][]
    )?.filter((entry): entry is FeatureEntry => isFeature(entry[1]));
  }, [selectedElement, world]);

  const animatedFeatures = useMemo(() => {
    if (!selectedElement) {
      return [] as AnimatedFeatureEntry[];
    }
    return featureEntries.filter(
      (entry): entry is AnimatedFeatureEntry => entry[1].animated,
    );
  }, [featureEntries, selectedElement]);

  const staticFeatures = useMemo(() => {
    return featureEntries.filter(
      (entry): entry is StaticFeatureEntry => !entry[1].animated,
    );
  }, [featureEntries]);

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

  const handleExport = useCallback(async () => {
    const trimmedName = exportFileName.trim();
    const desiredName =
      trimmedName.length > 0 ? trimmedName : "vizij-export.glb";
    const downloadName = desiredName.toLowerCase().endsWith(".glb")
      ? desiredName
      : `${desiredName}.glb`;

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

    const effectiveAnimatables = appliedOverrides
      ? nextAnimatables
      : animatables;

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
    animatables,
    exportFileName,
    getExportableBodies,
    rootId,
    setStoreState,
    values,
  ]);

  const selectionDetails = useMemo(() => {
    if (!selectedElement || !selectedRenderable) {
      return null;
    }

    const animatableDetails = animatedFeatures.map(([featureName, feature]) => {
      const animatable = animatables[feature.value];
      const currentValue = values.get(
        getLookup(selectedElement.namespace, feature.value),
      );
      const constraints = formatConstraints(animatable);
      return {
        featureName,
        animatable,
        currentValue,
        constraints,
      };
    });

    const staticDetails = staticFeatures.map(([featureName, feature]) => ({
      featureName,
      value: feature.value,
    }));

    return {
      name: selectedRenderable.name || selectedRenderable.id,
      type: selectedRenderable.type,
      tags: selectedRenderable.tags,
      animatableDetails,
      staticDetails,
    };
  }, [
    animatables,
    animatedFeatures,
    selectedElement,
    selectedRenderable,
    staticFeatures,
    values,
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
            <label className="sidebar__label" htmlFor="vizij-export-name">
              File name
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
                  void handleExport();
                }}
                disabled={!canExport}
              >
                Save
              </button>
            </div>
            <p className="sidebar__hint">
              We export the active Vizij rig with any edited animatable defaults
              so you can reload it elsewhere.
            </p>
          </div>
        </section>

        <section className="sidebar__section">
          <div className="sidebar__panel">
            <div className="sidebar__panel-header">
              <h2 className="sidebar__panel-title">Selected details</h2>
            </div>
            {!selectionDetails ? (
              <p className="sidebar__empty">
                Click a component in the viewport.
              </p>
            ) : (
              <div className="hover-details">
                <div className="hover-details__summary">
                  <h3>{selectionDetails.name}</h3>
                  <p className="hover-details__meta">
                    <span className="hover-details__pill">
                      {selectionDetails.type}
                    </span>
                    {selectionDetails.tags.length > 0 && (
                      <span>{selectionDetails.tags.join(", ")}</span>
                    )}
                    {selectedElement && (
                      <span className="hover-details__namespace">
                        Namespace: {selectedElement.namespace}
                      </span>
                    )}
                  </p>
                </div>
                <div className="hover-details__group">
                  <h4>Animatable properties</h4>
                  {selectionDetails.animatableDetails.length === 0 ? (
                    <p className="sidebar__empty">None</p>
                  ) : (
                    <ul>
                      {selectionDetails.animatableDetails.map(
                        ({
                          featureName,
                          animatable,
                          currentValue,
                          constraints,
                        }) => (
                          <li key={featureName}>
                            <div className="hover-details__row">
                              <strong>{featureName}</strong>
                              <span className="hover-details__type">
                                {animatable?.type ?? "unknown"}
                              </span>
                            </div>
                            {animatable?.name && (
                              <div className="hover-details__caption">
                                {animatable.name}
                              </div>
                            )}
                            <div className="hover-details__values">
                              <span>
                                Current:{" "}
                                {formatRawValue(
                                  currentValue ?? animatable?.default,
                                )}
                              </span>
                              <span>
                                Default: {formatRawValue(animatable?.default)}
                              </span>
                            </div>
                            {constraints && (
                              <div className="hover-details__caption">
                                Constraints: {constraints}
                              </div>
                            )}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
                <div className="hover-details__group">
                  <h4>Static properties</h4>
                  {selectionDetails.staticDetails.length === 0 ? (
                    <p className="sidebar__empty">None</p>
                  ) : (
                    <ul>
                      {selectionDetails.staticDetails.map(
                        ({ featureName, value }) => (
                          <li key={featureName}>
                            <div className="hover-details__row">
                              <strong>{featureName}</strong>
                              <span>{formatRawValue(value)}</span>
                            </div>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              </div>
            )}
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
            />
          ) : (
            <div className="viewer__placeholder">
              <p>Load a Vizij asset to render it here.</p>
            </div>
          )}
        </div>
      </main>

      <aside className="sidebar sidebar--right">
        <AnimatableValuesPanel namespace={DEFAULT_NAMESPACE} />
      </aside>
    </div>
  );
}
