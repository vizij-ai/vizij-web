import { useRef } from "react";
import type { CSSProperties } from "react";
import type { DemoFaceSource } from "../state/types";
import { DEMO_SAMPLES } from "../data/samples";

type SourceLibraryProps = {
  selectedSource: DemoFaceSource | null;
  onSelectSample: (id: (typeof DEMO_SAMPLES)[number]["id"]) => void;
  onUpload: (file: File) => void;
  onClearSource: () => void;
};

function CapabilityBadge({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <span className={`capability-badge ${enabled ? "is-enabled" : "is-muted"}`}>
      {label}
    </span>
  );
}

export function SourceLibrary({
  selectedSource,
  onSelectSample,
  onUpload,
  onClearSource,
}: SourceLibraryProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section className="panel source-library" aria-labelledby="source-library">
      <header className="panel-header panel-header-stack">
        <div>
          <p className="eyebrow">Bundle-first launch</p>
          <h2 id="source-library">Curated face library</h2>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => inputRef.current?.click()}
          >
            Upload bundled GLB
          </button>
          <button
            type="button"
            className="ghost"
            onClick={onClearSource}
            disabled={!selectedSource}
          >
            Reset
          </button>
        </div>
      </header>
      <div className="panel-body source-library-body">
        <p className="library-copy">
          Start with a known face export or load your own bundled GLB. The app
          will orient around whatever rigs, poses, clips, and procedural
          programs are embedded in that single asset.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".glb"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onUpload(file);
            }
            if (inputRef.current) {
              inputRef.current.value = "";
            }
          }}
        />

        <div className="sample-grid">
          {DEMO_SAMPLES.map((sample) => {
            const active =
              selectedSource?.kind === "sample" &&
              selectedSource.id === sample.id;
            return (
              <article
                key={sample.id}
                className={`sample-card ${active ? "is-active" : ""}`}
                style={{ "--sample-accent": sample.accent } as CSSProperties}
              >
                <div className="sample-card-topline">{sample.eyebrow}</div>
                <div className="sample-card-header">
                  <h3>{sample.label}</h3>
                  <span className="sample-count">
                    {sample.counts.poses} poses
                  </span>
                </div>
                <p>{sample.description}</p>
                <div className="badge-row">
                  <CapabilityBadge
                    label={`Rigs ${sample.counts.rigs}`}
                    enabled={sample.capabilities.rig}
                  />
                  <CapabilityBadge
                    label={`Poses ${sample.counts.poses}`}
                    enabled={sample.capabilities.poses}
                  />
                  <CapabilityBadge
                    label={`Clips ${sample.counts.animations}`}
                    enabled={sample.capabilities.animations}
                  />
                  <CapabilityBadge
                    label={`Programs ${sample.counts.programs}`}
                    enabled={sample.capabilities.programs}
                  />
                  <CapabilityBadge
                    label={`Groups ${sample.counts.poseGroups}`}
                    enabled={sample.counts.poseGroups > 0}
                  />
                </div>
                <button
                  type="button"
                  className={active ? "secondary" : undefined}
                  onClick={() => onSelectSample(sample.id)}
                >
                  {active ? "Loaded" : "Load sample"}
                </button>
              </article>
            );
          })}
        </div>

        {selectedSource?.kind === "upload" ? (
          <div className="upload-card">
            <div>
              <p className="eyebrow">Current upload</p>
              <h3>{selectedSource.label}</h3>
              <p>{selectedSource.fileName}</p>
            </div>
            <button type="button" onClick={() => inputRef.current?.click()}>
              Replace upload
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
