import { useCallback, useMemo, useRef, useState } from "react";
import { useAppState } from "../state/AppStateContext";

const GLB_ACCEPT = ".glb";
const JSON_ACCEPT = ".json";

type ImportAction = (file: File) => Promise<void>;

type MultiImportAction = (files: File[]) => Promise<void>;

function useFileImporter(
  action: ImportAction,
  onError: (message: string) => void,
) {
  return useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }
      try {
        await action(files[0]!);
      } catch (err) {
        console.error("demo-animating-faces: failed to import file", err);
        onError(err instanceof Error ? err.message : String(err));
      }
    },
    [action, onError],
  );
}

function useMultiFileImporter(
  action: MultiImportAction,
  onError: (message: string) => void,
) {
  return useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }
      const list = Array.from(files);
      try {
        await action(list);
      } catch (err) {
        console.error("demo-animating-faces: failed to import files", err);
        onError(err instanceof Error ? err.message : String(err));
      }
    },
    [action, onError],
  );
}

export function AssetLoaderPanel() {
  const {
    state,
    importGlb,
    importLowLevel,
    importHighLevel,
    removeHighLevel,
    setRigSelection,
    importAnimation,
    removeAnimation,
    clearAll,
  } = useAppState();
  const [error, setError] = useState<string | null>(null);
  const glbInputRef = useRef<HTMLInputElement | null>(null);
  const lowLevelInputRef = useRef<HTMLInputElement | null>(null);
  const highLevelInputRef = useRef<HTMLInputElement | null>(null);
  const animationInputRef = useRef<HTMLInputElement | null>(null);

  const handleError = useCallback((message: string) => {
    setError(message);
    window.setTimeout(() => setError(null), 5000);
  }, []);

  const handleGlbImport = useFileImporter(importGlb, handleError);
  const handleLowLevelImport = useFileImporter(importLowLevel, handleError);
  const handleHighLevelImport = useMultiFileImporter(async (files) => {
    for (const file of files) {
      await importHighLevel(file);
    }
  }, handleError);
  const handleAnimationImport = useMultiFileImporter(async (files) => {
    for (const file of files) {
      await importAnimation(file);
    }
  }, handleError);

  const glbSummary = useMemo(() => {
    if (!state.glb) {
      return "No GLB loaded";
    }
    const sizeKb = Math.round(state.glb.size / 102.4) / 10;
    return `${state.glb.label} • ${sizeKb} KB (${state.glb.fileName})`;
  }, [state.glb]);

  const lowLevelSummary = useMemo(() => {
    if (!state.lowLevel) {
      return "None";
    }
    return `${state.lowLevel.label} (${state.lowLevel.fileName})`;
  }, [state.lowLevel]);

  return (
    <section className="panel asset-panel" aria-labelledby="asset-panel-title">
      <header className="panel-header">
        <h2 id="asset-panel-title">Assets</h2>
        <button type="button" className="ghost" onClick={clearAll}>
          Clear All
        </button>
      </header>
      <div className="panel-body asset-body">
        <div className="asset-row">
          <div>
            <strong>GLB Asset</strong>
            <p>{glbSummary}</p>
          </div>
          <div className="actions">
            <input
              ref={glbInputRef}
              type="file"
              accept={GLB_ACCEPT}
              hidden
              onChange={(event) => {
                void handleGlbImport(event.target.files);
                if (glbInputRef.current) {
                  glbInputRef.current.value = "";
                }
              }}
            />
            <button type="button" onClick={() => glbInputRef.current?.click()}>
              Load GLB
            </button>
          </div>
        </div>

        <div className="asset-row">
          <div>
            <strong>Low-Level Rig</strong>
            <p>{lowLevelSummary}</p>
          </div>
          <div className="actions">
            <input
              ref={lowLevelInputRef}
              type="file"
              accept={JSON_ACCEPT}
              hidden
              onChange={(event) => {
                void handleLowLevelImport(event.target.files);
                if (lowLevelInputRef.current) {
                  lowLevelInputRef.current.value = "";
                }
              }}
            />
            <button
              type="button"
              onClick={() => lowLevelInputRef.current?.click()}
            >
              Load Graph
            </button>
          </div>
        </div>

        <div className="asset-row list">
          <div>
            <strong>High-Level Rigs</strong>
            <p>
              {state.highLevel.length > 0
                ? `${state.highLevel.length} loaded`
                : "None"}
            </p>
          </div>
          <div className="actions">
            <input
              ref={highLevelInputRef}
              type="file"
              accept={JSON_ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                void handleHighLevelImport(event.target.files);
                if (highLevelInputRef.current) {
                  highLevelInputRef.current.value = "";
                }
              }}
            />
            <button
              type="button"
              onClick={() => highLevelInputRef.current?.click()}
            >
              Add Rig
            </button>
          </div>
        </div>
        {state.highLevel.length > 0 ? (
          <ul className="asset-list">
            {state.highLevel.map((rig) => {
              const selected = state.selectedRigIds.includes(rig.id);
              return (
                <li key={rig.id}>
                  <label className="rig-toggle">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) =>
                        setRigSelection(rig.id, event.target.checked)
                      }
                    />
                    <span className="asset-label">
                      {rig.label}
                      <span className="asset-meta">{rig.fileName}</span>
                    </span>
                  </label>
                  <button type="button" onClick={() => removeHighLevel(rig.id)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="asset-row list">
          <div>
            <strong>Animations</strong>
            <p>
              {state.animations.length > 0
                ? `${state.animations.length} loaded`
                : "None"}
            </p>
          </div>
          <div className="actions">
            <input
              ref={animationInputRef}
              type="file"
              accept={JSON_ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                void handleAnimationImport(event.target.files);
                if (animationInputRef.current) {
                  animationInputRef.current.value = "";
                }
              }}
            />
            <button
              type="button"
              onClick={() => animationInputRef.current?.click()}
            >
              Add Animation
            </button>
          </div>
        </div>
        {state.animations.length > 0 ? (
          <ul className="asset-list">
            {state.animations.map((anim) => (
              <li key={anim.id}>
                <span className="asset-label">
                  {anim.label}
                  <span className="asset-meta">{anim.fileName}</span>
                </span>
                <button type="button" onClick={() => removeAnimation(anim.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? <div className="panel-error">{error}</div> : null}
      </div>
    </section>
  );
}
