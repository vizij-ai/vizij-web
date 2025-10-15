import React from "react";
import {
  OrchestratorProvider,
  useOrchestrator,
  useOrchFrame,
  useOrchTarget,
  samples as orchestratorSamples,
  type ValueJSON,
  type GraphRegistrationInput,
  type AnimationRegistrationConfig,
  type CreateOrchOptions,
} from "@vizij/orchestrator-react";

type OrchestrationDocument = {
  label?: string;
  createOptions?: CreateOrchOptions;
  inputs?: Record<string, ValueJSON>;
  graphs?: GraphRegistrationInput[];
  animations?: AnimationRegistrationConfig[];
  watchPath?: string | null;
};

function prettyPrintDocument(doc: OrchestrationDocument): string {
  return JSON.stringify(doc, null, 2);
}

function cloneDocument(doc: OrchestrationDocument): OrchestrationDocument {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(doc) as OrchestrationDocument;
    } catch {
      // fall through to JSON clone
    }
  }
  return JSON.parse(JSON.stringify(doc)) as OrchestrationDocument;
}

function jsonStringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return String(err);
  }
}

type OrchestrationBundle = Awaited<
  ReturnType<typeof orchestratorSamples.loadBundle>
>;

function bundleToDocument(
  sampleId: string,
  bundle: OrchestrationBundle,
): OrchestrationDocument {
  const { descriptor, animation, graphSpec } = bundle;

  const inputs =
    Array.isArray((descriptor as any)?.initial_inputs) &&
    (descriptor as any).initial_inputs.length > 0
      ? Object.fromEntries(
          (descriptor as any).initial_inputs.map(
            ({ path, value }: { path: string; value: unknown }) => [
              path,
              value as ValueJSON,
            ],
          ),
        )
      : undefined;

  const graphConfig: GraphRegistrationInput = {
    id: `${sampleId}-graph`,
    spec: graphSpec.spec,
  };
  if ((graphSpec as any)?.subs) {
    (graphConfig as any).subs = (graphSpec as any).subs;
  }

  const animations: AnimationRegistrationConfig[] = [
    {
      setup: {
        animation,
        player: {
          name: `${sampleId}-player`,
          loop_mode: "loop",
        },
      },
    },
  ];

  const descriptorWatch =
    typeof (descriptor as any)?.watchPath === "string"
      ? ((descriptor as any).watchPath as string)
      : null;

  const graphOutput =
    graphSpec &&
    (graphSpec as any)?.subs &&
    Array.isArray((graphSpec as any).subs?.outputs) &&
    (graphSpec as any).subs.outputs.length > 0
      ? (((graphSpec as any).subs.outputs[0] as string) ?? null)
      : null;

  const stepExpectPath =
    Array.isArray((descriptor as any)?.steps) &&
    (descriptor as any).steps.length > 0
      ? ((descriptor as any).steps
          .map((step: any) =>
            step && step.expect ? Object.keys(step.expect) : [],
          )
          .flat()
          .find((key: string) => typeof key === "string") ?? null)
      : null;

  return {
    label: (descriptor as any)?.description ?? sampleId,
    inputs,
    graphs: [graphConfig],
    animations,
    watchPath: descriptorWatch ?? graphOutput ?? stepExpectPath ?? null,
  };
}

type NormalizedGraphConfig = {
  id: string;
  spec: any;
  subs?: any;
};

type EditorProps = {
  initialDoc: OrchestrationDocument;
  sampleOptions: string[];
  selectedSample: string | null;
  baselineSampleId: string | null;
  onSelectSample: (id: string) => Promise<void>;
  onCustomDoc: () => void;
  loadingSamples: boolean;
  initialLoadError?: string | null;
};

function normalizeGraphConfig(
  entry: unknown,
  index: number,
): NormalizedGraphConfig {
  if (typeof entry === "string") {
    return { id: `graph_${index}`, spec: entry };
  }
  if (entry && typeof entry === "object") {
    if ("spec" in (entry as any)) {
      const spec = (entry as any).spec;
      const id =
        typeof (entry as any).id === "string"
          ? (entry as any).id
          : `graph_${index}`;
      const subs =
        typeof (entry as any).subs === "object"
          ? (entry as any).subs
          : undefined;
      const config: NormalizedGraphConfig = { id, spec };
      if (subs) config.subs = subs;
      return config;
    }
    return { id: `graph_${index}`, spec: entry };
  }
  throw new Error("Invalid graph entry in orchestration document.");
}

function WatchedValue({ path }: { path: string | null }) {
  const value = useOrchTarget(path);
  return (
    <pre
      style={{
        margin: 0,
        background: "#101215",
        color: "#f5f5f5",
        padding: "0.75rem",
        borderRadius: 6,
        overflowX: "auto",
        minHeight: "6rem",
        fontSize: "0.85rem",
      }}
    >
      {path
        ? jsonStringifySafe(value ?? null)
        : "Set a path to observe blackboard values."}
    </pre>
  );
}

function Editor({
  initialDoc,
  sampleOptions,
  selectedSample,
  baselineSampleId,
  onSelectSample,
  onCustomDoc,
  loadingSamples,
  initialLoadError,
}: EditorProps) {
  const {
    ready,
    createOrchestrator,
    registerGraph,
    registerMergedGraph,
    registerAnimation,
    setInput,
    removeInput,
    listControllers,
    removeGraph,
    removeAnimation,
    step,
  } = useOrchestrator();
  const frame = useOrchFrame();
  const lastAppliedDocRef = React.useRef<OrchestrationDocument | null>(null);

  const [docText, setDocText] = React.useState(() =>
    prettyPrintDocument(initialDoc),
  );
  const [status, setStatus] = React.useState("Loading orchestration…");
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [watchedPath, setWatchedPath] = React.useState(
    initialDoc.watchPath ?? "",
  );
  const [useMergedGraphs, setUseMergedGraphs] = React.useState(false);
  const [mergeStrategy, setMergeStrategy] = React.useState<
    "namespace" | "blend"
  >("namespace");
  const [isSampleLoading, setIsSampleLoading] = React.useState(false);

  const appliedInputsRef = React.useRef<string[]>([]);
  const requestRafRef = React.useRef<
    null | ((cb: FrameRequestCallback) => number)
  >(null);
  const cancelRafRef = React.useRef<null | ((handle: number) => void)>(null);
  const rafHandleRef = React.useRef<number | null>(null);
  const lastTimestampRef = React.useRef<number | null>(null);

  const stopPlayback = React.useCallback((message?: string) => {
    const cancel = cancelRafRef.current;
    if (cancel && rafHandleRef.current != null) {
      cancel(rafHandleRef.current);
    }
    rafHandleRef.current = null;
    lastTimestampRef.current = null;
    requestRafRef.current = null;
    cancelRafRef.current = null;
    setIsPlaying(false);
    if (message) {
      setStatus(message);
    }
  }, []);

  const playbackLoop = React.useCallback(
    (timestamp: number) => {
      if (!requestRafRef.current) {
        stopPlayback("requestAnimationFrame unavailable. Playback stopped.");
        return;
      }
      const last = lastTimestampRef.current ?? timestamp;
      const dt = Math.max(0, (timestamp - last) / 1000);
      lastTimestampRef.current = timestamp;
      step(dt || 0);
      rafHandleRef.current = requestRafRef.current(playbackLoop);
    },
    [step, stopPlayback],
  );

  const applyParsedDocument = React.useCallback(
    async (
      doc: OrchestrationDocument,
      opts?: {
        source?: "sample" | "custom";
        sampleId?: string | null;
        updateEditorState?: boolean;
      },
    ) => {
      setStatus("Applying orchestration…");
      try {
        await createOrchestrator(doc.createOptions);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus(`Failed to create orchestrator: ${message}`);
        return;
      }

      stopPlayback();

      try {
        const existing = listControllers();
        existing.graphs.forEach((id) => removeGraph(id));
        existing.anims.forEach((id) => removeAnimation(id));
        appliedInputsRef.current.forEach((path) => {
          removeInput(path);
        });
        appliedInputsRef.current = [];

        const normalizedGraphs = (doc.graphs ?? []).map((cfg, index) =>
          normalizeGraphConfig(cfg, index),
        );
        let registeredGraphIds: string[] = [];
        if (useMergedGraphs) {
          if (normalizedGraphs.length === 0) {
            setStatus(
              "No graphs available to merge. Add graphs before enabling merged mode.",
            );
          } else {
            const mergedId = registerMergedGraph({
              graphs: normalizedGraphs,
              strategy: {
                outputs: mergeStrategy,
                intermediate: mergeStrategy,
              },
            });
            registeredGraphIds = [mergedId];
          }
        } else {
          registeredGraphIds = normalizedGraphs.map((cfg) =>
            registerGraph(cfg),
          );
        }
        const registeredAnims = (doc.animations ?? []).map((cfg) =>
          registerAnimation(cfg),
        );

        const nextInputs: string[] = [];
        if (doc.inputs) {
          Object.entries(doc.inputs).forEach(([path, value]) => {
            if (
              typeof path === "string" &&
              path.length > 0 &&
              value !== undefined
            ) {
              setInput(path, value as ValueJSON);
              nextInputs.push(path);
            }
          });
        }
        appliedInputsRef.current = nextInputs;

        if (doc.watchPath !== undefined) {
          setWatchedPath(doc.watchPath ?? "");
        }

        lastAppliedDocRef.current = cloneDocument(doc);
        if (opts?.updateEditorState !== false) {
          setDocText(prettyPrintDocument(doc));
        }

        if (useMergedGraphs) {
          setStatus(
            `Loaded merged graph (${registeredGraphIds[0] ?? "none"}) and ${registeredAnims.length} animation(s).`,
          );
        } else {
          setStatus(
            `Loaded ${registeredGraphIds.length} graph(s) and ${registeredAnims.length} animation(s).`,
          );
        }
        if (opts?.source === "custom") {
          onCustomDoc();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus(`Failed to load orchestration: ${message}`);
      }
    },
    [
      createOrchestrator,
      listControllers,
      registerAnimation,
      registerGraph,
      removeAnimation,
      removeGraph,
      removeInput,
      setInput,
      setWatchedPath,
      stopPlayback,
      mergeStrategy,
      registerMergedGraph,
      useMergedGraphs,
      onCustomDoc,
    ],
  );

  const handleApply = React.useCallback(() => {
    let parsed: OrchestrationDocument;
    try {
      parsed = JSON.parse(docText) as OrchestrationDocument;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Invalid JSON: ${message}`);
      return;
    }
    const pretty = prettyPrintDocument(parsed);
    setDocText(pretty);
    void applyParsedDocument(parsed, { source: "custom" });
  }, [docText, applyParsedDocument]);

  const handlePlay = React.useCallback(() => {
    if (isPlaying) {
      return;
    }
    if (!ready) {
      setStatus("Create the orchestrator before playing.");
      return;
    }
    const globalObj: typeof globalThis & {
      requestAnimationFrame?: (cb: FrameRequestCallback) => number;
      cancelAnimationFrame?: (handle: number) => void;
    } = typeof window !== "undefined" ? window : globalThis;

    const request = globalObj.requestAnimationFrame?.bind(globalObj) ?? null;
    const cancel = globalObj.cancelAnimationFrame?.bind(globalObj) ?? null;

    if (!request || !cancel) {
      setStatus("requestAnimationFrame is unavailable in this environment.");
      return;
    }

    requestRafRef.current = request;
    cancelRafRef.current = cancel;
    lastTimestampRef.current = null;
    setIsPlaying(true);
    setStatus("Playback running…");
    rafHandleRef.current = request(playbackLoop);
  }, [isPlaying, playbackLoop, ready]);

  const handlePause = React.useCallback(() => {
    if (!isPlaying) {
      return;
    }
    stopPlayback("Playback paused.");
  }, [isPlaying, stopPlayback]);

  const handleReset = React.useCallback(() => {
    const fallbackDoc = lastAppliedDocRef.current ?? cloneDocument(initialDoc);
    const docClone = cloneDocument(fallbackDoc);
    setDocText(prettyPrintDocument(docClone));
    void applyParsedDocument(docClone, {
      source: selectedSample ? "sample" : "custom",
      sampleId: selectedSample ?? baselineSampleId ?? null,
    });
  }, [applyParsedDocument, initialDoc, selectedSample, baselineSampleId]);

  const handleStep = React.useCallback(() => {
    const result = step(1 / 60);
    if (result) {
      setStatus(`Stepped epoch ${result.epoch}`);
    } else {
      setStatus("No orchestrator instance yet. Create one before stepping.");
    }
  }, [step]);

  const handleFileChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text =
          typeof reader.result === "string"
            ? reader.result
            : new TextDecoder().decode(reader.result as ArrayBuffer);
        try {
          const parsed = JSON.parse(text) as OrchestrationDocument;
          const pretty = JSON.stringify(parsed, null, 2);
          setDocText(pretty);
          void applyParsedDocument(parsed, { source: "custom" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setStatus(`Failed to load file: ${message}`);
        }
      };
      reader.onerror = () => {
        setStatus("Failed to read orchestration file.");
      };
      reader.readAsText(file);
      event.target.value = "";
    },
    [applyParsedDocument],
  );

  const handleSave = React.useCallback(() => {
    let pretty = docText;
    try {
      const parsed = JSON.parse(docText);
      pretty = JSON.stringify(parsed, null, 2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Cannot save orchestration: ${message}`);
      return;
    }
    const blob = new Blob([pretty], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "orchestration.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus("Saved orchestration.json");
  }, [docText]);

  const handleLoadExample = React.useCallback(() => {
    const baselineClone = cloneDocument(initialDoc);
    setDocText(prettyPrintDocument(baselineClone));
    void applyParsedDocument(baselineClone, {
      source: "sample",
      sampleId: baselineSampleId ?? null,
    });
  }, [applyParsedDocument, initialDoc, baselineSampleId]);

  const sampleSelectValue = selectedSample ?? "__custom__";

  const handleSampleSelect = React.useCallback(
    async (event: React.ChangeEvent<HTMLSelectElement>) => {
      const id = event.target.value;
      if (!id || id === "__custom__" || id === selectedSample) {
        return;
      }
      setStatus(`Loading sample "${id}"…`);
      setIsSampleLoading(true);
      try {
        await onSelectSample(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus(`Failed to load sample "${id}": ${message}`);
      } finally {
        setIsSampleLoading(false);
      }
    },
    [onSelectSample, selectedSample],
  );

  React.useEffect(() => {
    const baselineClone = cloneDocument(initialDoc);
    lastAppliedDocRef.current = baselineClone;
    void applyParsedDocument(baselineClone, {
      source: "sample",
      sampleId: baselineSampleId ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDoc, baselineSampleId]);

  React.useEffect(() => {
    if (initialLoadError) {
      setStatus(initialLoadError);
    }
  }, [initialLoadError]);

  React.useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  const mergedWrites = frame?.merged_writes ?? [];
  const rawConflicts = frame?.conflicts ?? [];
  const filteredConflicts = rawConflicts.filter((entry) => {
    if (!entry) return false;
    const { previous_source, new_source } = entry;
    if (previous_source == null) {
      return true;
    }
    return previous_source !== new_source;
  });
  const suppressedConflicts = rawConflicts.length - filteredConflicts.length;

  return (
    <div
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        margin: "2rem auto",
        maxWidth: 960,
        padding: "0 1rem 2rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      <header>
        <h1 style={{ margin: "0 0 0.5rem" }}>Orchestrator Playground</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Minimal wrapper around <code>@vizij/orchestrator-react</code> to load,
          edit, and play orchestrations.
        </p>
      </header>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" onClick={handleApply}>
          Apply orchestration
        </button>
        <button type="button" onClick={handlePlay} disabled={!ready}>
          Play
        </button>
        <button type="button" onClick={handlePause} disabled={!isPlaying}>
          Pause
        </button>
        <button type="button" onClick={handleReset}>
          Reset
        </button>
        <button type="button" onClick={handleStep}>
          Step (1/60s)
        </button>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            cursor: "pointer",
            border: "1px solid #ccc",
            borderRadius: 4,
            padding: "0.4rem 0.75rem",
            fontSize: "0.9rem",
          }}
        >
          Load JSON
          <input
            type="file"
            accept="application/json"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </label>
        <button type="button" onClick={handleSave}>
          Save JSON
        </button>
        <button type="button" onClick={handleLoadExample}>
          Load example
        </button>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          Sample
          <select
            value={sampleSelectValue}
            onChange={handleSampleSelect}
            disabled={
              loadingSamples || isSampleLoading || sampleOptions.length === 0
            }
          >
            <option value="__custom__">
              {loadingSamples
                ? "Loading samples…"
                : sampleOptions.length === 0
                  ? "No samples available"
                  : "Custom (editor/file)"}
            </option>
            {sampleOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        {isSampleLoading ? (
          <span style={{ color: "#94a3b8" }}>Loading sample…</span>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: "0.5rem",
        }}
      >
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <input
            type="checkbox"
            checked={useMergedGraphs}
            onChange={(event) => setUseMergedGraphs(event.target.checked)}
          />
          <span>Register graphs via `registerMergedGraph`</span>
        </label>
        {useMergedGraphs ? (
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>Conflict strategy</span>
            <select
              value={mergeStrategy}
              onChange={(event) =>
                setMergeStrategy(event.target.value as "namespace" | "blend")
              }
            >
              <option value="namespace">namespace</option>
              <option value="blend">blend</option>
            </select>
          </label>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          fontSize: "0.9rem",
        }}
      >
        <span>
          <strong>Status:</strong> {status}
        </span>
        <span>
          <strong>Ready:</strong> {ready ? "yes" : "no"}
        </span>
        <span>
          <strong>Playing:</strong> {isPlaying ? "yes" : "no"}
        </span>
        <span>
          <strong>Last frame:</strong> {frame ? `epoch ${frame.epoch}` : "none"}
        </span>
      </div>

      <textarea
        value={docText}
        onChange={(event) => setDocText(event.target.value)}
        spellCheck={false}
        style={{
          width: "100%",
          minHeight: "18rem",
          borderRadius: 6,
          border: "1px solid #d0d0d0",
          fontFamily:
            "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          fontSize: "0.9rem",
          padding: "1rem",
          background: "#fafafa",
        }}
      />

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        <div>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <span style={{ fontWeight: 600 }}>Watch blackboard path</span>
            <input
              type="text"
              value={watchedPath}
              onChange={(event) => setWatchedPath(event.target.value)}
              placeholder="example/path"
              style={{
                borderRadius: 4,
                border: "1px solid #ccc",
                padding: "0.5rem",
                fontSize: "0.9rem",
              }}
            />
          </label>
          <div style={{ marginTop: "0.75rem" }}>
            <WatchedValue path={watchedPath ? watchedPath : null} />
          </div>
        </div>

        <div>
          <h2 style={{ margin: "0 0 0.5rem" }}>Merged writes</h2>
          <pre
            style={{
              margin: 0,
              background: "#101215",
              color: "#f5f5f5",
              padding: "0.75rem",
              borderRadius: 6,
              overflowX: "auto",
              minHeight: "6rem",
              fontSize: "0.85rem",
            }}
          >
            {jsonStringifySafe(mergedWrites)}
          </pre>
        </div>
        <div>
          <h2 style={{ margin: "0 0 0.5rem" }}>Conflicts</h2>
          {suppressedConflicts > 0 ? (
            <p
              style={{
                margin: "0 0 0.5rem",
                fontSize: "0.8rem",
                color: "#64748b",
              }}
            >
              Filtered {suppressedConflicts} self-updates (same controller).
            </p>
          ) : null}
          <pre
            style={{
              margin: 0,
              background: "#101215",
              color: "#f5f5f5",
              padding: "0.75rem",
              borderRadius: 6,
              overflowX: "auto",
              minHeight: "6rem",
              fontSize: "0.85rem",
            }}
          >
            {jsonStringifySafe(filteredConflicts)}
          </pre>
        </div>
        <div>
          <h2 style={{ margin: "0 0 0.5rem" }}>Frame events</h2>
          <pre
            style={{
              margin: 0,
              background: "#101215",
              color: "#f5f5f5",
              padding: "0.75rem",
              borderRadius: 6,
              overflowX: "auto",
              minHeight: "6rem",
              fontSize: "0.85rem",
            }}
          >
            {jsonStringifySafe(frame?.events ?? [])}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [baselineDoc, setBaselineDoc] =
    React.useState<OrchestrationDocument | null>(null);
  const [sampleOptions, setSampleOptions] = React.useState<string[]>([]);
  const [selectedSample, setSelectedSample] = React.useState<string | null>(
    null,
  );
  const [baselineSampleId, setBaselineSampleId] = React.useState<string | null>(
    null,
  );
  const [loadingSamples, setLoadingSamples] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadSampleDoc = React.useCallback(async (id: string) => {
    const bundle = await orchestratorSamples.loadBundle(id);
    return bundleToDocument(id, bundle);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const names = await orchestratorSamples.list();
        if (cancelled || !mountedRef.current) return;
        const sorted = names.slice().sort((a, b) => a.localeCompare(b));
        setSampleOptions(sorted);
        if (sorted.length > 0) {
          const preferred = sorted.includes("scalar-ramp-pipeline")
            ? "scalar-ramp-pipeline"
            : sorted[0];
          const doc = await loadSampleDoc(preferred);
          if (cancelled || !mountedRef.current) return;
          setBaselineDoc(cloneDocument(doc));
          setSelectedSample(preferred);
          setBaselineSampleId(preferred);
        } else {
          const emptyDoc: OrchestrationDocument = {
            label: "Empty orchestration",
            inputs: {},
            graphs: [],
            animations: [],
            watchPath: null,
          };
          setBaselineDoc(emptyDoc);
          setSelectedSample(null);
          setBaselineSampleId(null);
        }
      } catch (err: any) {
        if (cancelled || !mountedRef.current) return;
        const message =
          err instanceof Error ? err.message : String(err ?? "unknown");
        setLoadError(`Failed to load orchestration samples: ${message}`);
        const emptyDoc: OrchestrationDocument = {
          label: "Empty orchestration",
          inputs: {},
          graphs: [],
          animations: [],
          watchPath: null,
        };
        setBaselineDoc(emptyDoc);
        setSampleOptions([]);
        setSelectedSample(null);
        setBaselineSampleId(null);
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoadingSamples(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSampleDoc]);

  const handleSelectSample = React.useCallback(
    async (id: string) => {
      const doc = await loadSampleDoc(id);
      if (!mountedRef.current) return;
      setBaselineDoc(cloneDocument(doc));
      setSelectedSample(id);
      setBaselineSampleId(id);
    },
    [loadSampleDoc],
  );

  const handleCustomDoc = React.useCallback(() => {
    setSelectedSample(null);
  }, []);

  if (!baselineDoc) {
    return (
      <div
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          maxWidth: 640,
          margin: "2rem auto",
          padding: "0 1rem",
        }}
      >
        <h1 style={{ margin: "0 0 1rem" }}>Orchestrator Playground</h1>
        <p style={{ color: "#94a3b8" }}>
          {loadingSamples
            ? "Loading orchestration samples…"
            : (loadError ??
              "Unable to load orchestration samples. Check the console for details.")}
        </p>
      </div>
    );
  }

  return (
    <OrchestratorProvider autostart={false}>
      <Editor
        initialDoc={baselineDoc}
        sampleOptions={sampleOptions}
        selectedSample={selectedSample}
        baselineSampleId={baselineSampleId}
        onSelectSample={handleSelectSample}
        onCustomDoc={handleCustomDoc}
        loadingSamples={loadingSamples}
        initialLoadError={loadError}
      />
    </OrchestratorProvider>
  );
}
