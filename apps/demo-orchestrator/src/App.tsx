import React from "react";
import {
  OrchestratorProvider,
  useOrchestrator,
  useOrchFrame,
  useOrchTarget,
  type ValueJSON,
} from "@vizij/orchestrator-react";

import {
  DEFAULT_ORCHESTRATION,
  type OrchestrationDocument,
} from "./demoSpecs";

const DEFAULT_DOC_TEXT = JSON.stringify(DEFAULT_ORCHESTRATION, null, 2);

function jsonStringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return String(err);
  }
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
      {path ? jsonStringifySafe(value ?? null) : "Set a path to observe blackboard values."}
    </pre>
  );
}

function Editor() {
  const {
    ready,
    createOrchestrator,
    registerGraph,
    registerAnimation,
    setInput,
    removeInput,
    listControllers,
    removeGraph,
    removeAnimation,
    step,
  } = useOrchestrator();
  const frame = useOrchFrame();

  const [docText, setDocText] = React.useState(DEFAULT_DOC_TEXT);
  const [status, setStatus] = React.useState("Loading orchestration…");
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [watchedPath, setWatchedPath] = React.useState(
    DEFAULT_ORCHESTRATION.watchPath ?? "",
  );

  const appliedInputsRef = React.useRef<string[]>([]);
  const requestRafRef = React.useRef<null | ((cb: FrameRequestCallback) => number)>(
    null,
  );
  const cancelRafRef = React.useRef<null | ((handle: number) => void)>(null);
  const rafHandleRef = React.useRef<number | null>(null);
  const lastTimestampRef = React.useRef<number | null>(null);

  const stopPlayback = React.useCallback(
    (message?: string) => {
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
    },
    [],
  );

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
    async (doc: OrchestrationDocument) => {
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

        const registeredGraphs = (doc.graphs ?? []).map((cfg) => registerGraph(cfg));
        const registeredAnims = (doc.animations ?? []).map((cfg) =>
          registerAnimation(cfg),
        );

        const nextInputs: string[] = [];
        if (doc.inputs) {
          Object.entries(doc.inputs).forEach(([path, value]) => {
            if (typeof path === "string" && path.length > 0 && value !== undefined) {
              setInput(path, value as ValueJSON);
              nextInputs.push(path);
            }
          });
        }
        appliedInputsRef.current = nextInputs;

        if (doc.watchPath !== undefined) {
          setWatchedPath(doc.watchPath ?? "");
        }

        setStatus(
          `Loaded ${registeredGraphs.length} graph(s) and ${registeredAnims.length} animation(s).`,
        );
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
    const pretty = JSON.stringify(parsed, null, 2);
    setDocText(pretty);
    void applyParsedDocument(parsed);
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
    stopPlayback("Orchestrator reset.");
    const existing = listControllers();
    existing.graphs.forEach((id) => removeGraph(id));
    existing.anims.forEach((id) => removeAnimation(id));
    appliedInputsRef.current.forEach((path) => {
      removeInput(path);
    });
    appliedInputsRef.current = [];
  }, [listControllers, removeAnimation, removeGraph, removeInput, stopPlayback]);

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
        const text = typeof reader.result === "string"
          ? reader.result
          : new TextDecoder().decode(reader.result as ArrayBuffer);
        try {
          const parsed = JSON.parse(text) as OrchestrationDocument;
          const pretty = JSON.stringify(parsed, null, 2);
          setDocText(pretty);
          void applyParsedDocument(parsed);
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
    setDocText(DEFAULT_DOC_TEXT);
    void applyParsedDocument(DEFAULT_ORCHESTRATION);
  }, [applyParsedDocument]);

  React.useEffect(() => {
    void applyParsedDocument(DEFAULT_ORCHESTRATION);
  }, [applyParsedDocument]);

  React.useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  const mergedWrites = frame?.merged_writes ?? [];

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
          Minimal wrapper around <code>@vizij/orchestrator-react</code> to load, edit,
          and play orchestrations.
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
          fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          fontSize: "0.9rem",
          padding: "1rem",
          background: "#fafafa",
        }}
      />

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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
      </div>
    </div>
  );
}

export default function App() {
  return (
    <OrchestratorProvider autostart={false}>
      <Editor />
    </OrchestratorProvider>
  );
}
