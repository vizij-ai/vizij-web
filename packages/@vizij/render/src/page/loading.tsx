import type { ReactNode } from "react";
import type { LoadingStage } from "./progress";

/** A slot's loading view, as `<Vizij>`'s `loading` render prop receives it. */
export interface VizijLoading {
  stage: LoadingStage;
  /** The stage in words: "Downloading the runtime: 3.1 of 9.8 MB". */
  label: string;
  /** How much of the stage is done, from 0 to 1, for the stages that count
   * bytes against a known total; `null` (indeterminate) for the others. */
  fraction: number | null;
}

/** `stage` with its label and fraction. */
export function describeLoading(stage: LoadingStage): VizijLoading {
  return {
    stage,
    label: loadingLabel(stage),
    fraction: loadingFraction(stage),
  };
}

function loadingLabel(stage: LoadingStage): string {
  switch (stage.stage) {
    case "download":
      return withBytes("Downloading the runtime", stage.loaded, stage.total);
    case "compile":
      return "Compiling the runtime";
    case "start":
      return "Starting the runtime";
    case "mount":
      return "Starting the view";
    case "fetch":
      return withBytes("Loading the face", stage.loaded, stage.total);
    case "load":
      return "Loading the face";
    case "draw":
      return "Drawing the face";
    case "failed":
      return "Loading failed";
  }
}

function loadingFraction(stage: LoadingStage): number | null {
  if (stage.stage !== "download" && stage.stage !== "fetch") return null;
  if (stage.total === null || stage.total <= 0) return null;
  return Math.min(1, Math.max(0, stage.loaded / stage.total));
}

/** `what`, with the bytes received so far once there are any. */
function withBytes(what: string, loaded: number, total: number | null): string {
  if (total === null) {
    return loaded > 0 ? `${what}: ${megabytes(loaded)} MB` : what;
  }
  return `${what}: ${megabytes(loaded)} of ${megabytes(total)} MB`;
}

function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

/** The bar's sliding segment while the stage has no fraction; still for a
 * reader who asks for reduced motion. */
const INDETERMINATE_CSS = `
@keyframes vizij-loading-slide {
  from { transform: translateX(-100%); }
  to { transform: translateX(250%); }
}
[data-vizij-loading-indeterminate] {
  animation: vizij-loading-slide 1.4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  [data-vizij-loading-indeterminate] { animation: none; }
}
`;

/** The default loading image: Vizij's logo, in its own colours — a teal
 * circle under a translucent orange quadrilateral and amber triangle. */
export function DefaultLoadingImage(): ReactNode {
  return (
    <svg viewBox="0 0 1024 1024" width="64" height="64">
      <circle cx="447.6" cy="486.6" r="400.6" fill="#50c4b6" />
      <g fillOpacity="0.894">
        <path
          fill="#f56b29"
          d="M471.3 495.5L846.5 488A14.8 14.8 0 0 1 861.5 503.8L835.3 869.7A60.5 60.5 0 0 1 767.6 925.4L469.8 888.9A14.8 14.8 0 0 1 456.8 874.2L456.8 510.3A14.8 14.8 0 0 1 471.3 495.5Z"
        />
        <path
          fill="#ff9e00"
          d="M824.3 339L983.4 619.9A14.8 14.8 0 0 1 970.7 642L790 644.2A14.8 14.8 0 0 1 775 628.3L796.7 345.1A14.8 14.8 0 0 1 824.3 339Z"
        />
      </g>
    </svg>
  );
}

/**
 * The default loading view, centred in the slot: the image
 * (`<DefaultLoadingImage>` when `image` is `undefined`, none when `null`),
 * then a progress bar and the stage's label in the text colour; on a
 * failure, the label without the bar.
 */
export function DefaultLoading({
  loading,
  image,
}: {
  loading: VizijLoading;
  image: ReactNode | undefined;
}): ReactNode {
  const { stage, label, fraction } = loading;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        font: "13px/1.4 system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      {image !== null && (
        <div aria-hidden="true">{image ?? <DefaultLoadingImage />}</div>
      )}
      {stage.stage === "failed" ? (
        <div role="status">{label}</div>
      ) : (
        <>
          <div
            role="progressbar"
            aria-label="Loading the face"
            aria-valuetext={label}
            {...(fraction === null
              ? {}
              : {
                  "aria-valuemin": 0,
                  "aria-valuemax": 100,
                  "aria-valuenow": Math.round(fraction * 100),
                })}
            style={{
              position: "relative",
              width: 160,
              maxWidth: "60%",
              height: 4,
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "currentColor",
                opacity: 0.2,
              }}
            />
            {fraction === null ? (
              <div
                data-vizij-loading-indeterminate=""
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: "40%",
                  background: "currentColor",
                }}
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${fraction * 100}%`,
                  background: "currentColor",
                }}
              />
            )}
          </div>
          {/* The bar's value text already says it to assistive technology. */}
          <div aria-hidden="true" style={{ opacity: 0.8 }}>
            {label}
          </div>
          {fraction === null && <style>{INDETERMINATE_CSS}</style>}
        </>
      )}
    </div>
  );
}
