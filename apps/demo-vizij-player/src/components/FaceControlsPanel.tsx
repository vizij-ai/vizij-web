import { useEffect, useMemo, useState } from "react";
import {
  buildRigInputPath,
  mapNormalizedControlValue,
  resolveFaceControls,
  useVizijRuntime,
  type FaceScalarControl,
} from "@vizij/runtime-react";
import { formatPathLabel } from "../lib/bundleSummary";
import { IconButton } from "./IconButton";
import { RuntimeApiDisclosure } from "./RuntimeApiDisclosure";

type InputMetadataLike = {
  path: string;
  label?: string;
  defaultValue?: number;
  range?: {
    min?: number;
    max?: number;
  };
};

type GenericControl = {
  absolutePath: string;
  relativePath: string;
  label: string;
  min: number;
  max: number;
  defaultValue: number;
};

type RankedGenericControl = GenericControl & {
  priority: number;
};

function formatExampleNumber(value: number) {
  return Number(value.toFixed(2)).toString();
}

function findConstraint(
  inputConstraints: Record<
    string,
    { min?: number; max?: number; defaultValue?: number }
  >,
  absolutePath: string,
  relativePath: string,
) {
  const normalizedRelative = relativePath.replace(/^\/+/, "");
  return (
    inputConstraints[absolutePath] ??
    inputConstraints[relativePath] ??
    inputConstraints[normalizedRelative] ??
    null
  );
}

function buildGenericControls(
  faceId: string | null,
  metadata: InputMetadataLike[],
  inputConstraints: Record<
    string,
    { min?: number; max?: number; defaultValue?: number }
  >,
  excludedPaths: Set<string>,
): GenericControl[] {
  if (!faceId) {
    return [];
  }

  const prioritizedNeedles = [
    "smile",
    "brow",
    "jaw",
    "chin",
    "mouth",
    "lip",
    "squint",
    "cheek",
  ];

  const candidates = metadata
    .map((entry) => {
      if (typeof entry.path !== "string" || entry.path.trim().length === 0) {
        return null;
      }
      const relativePath = entry.path.startsWith("/")
        ? entry.path
        : `/${entry.path.replace(/^\/+/, "")}`;
      const absolutePath = buildRigInputPath(faceId, relativePath);
      if (
        excludedPaths.has(absolutePath) ||
        relativePath.includes("/poses/") ||
        relativePath.includes("/pose/control/") ||
        relativePath.includes("/color/")
      ) {
        return null;
      }
      const constraint = findConstraint(
        inputConstraints,
        absolutePath,
        relativePath,
      );
      const min = Number.isFinite(Number(constraint?.min ?? entry.range?.min))
        ? Number(constraint?.min ?? entry.range?.min)
        : -1;
      const max = Number.isFinite(Number(constraint?.max ?? entry.range?.max))
        ? Number(constraint?.max ?? entry.range?.max)
        : 1;
      const defaultValue = Number.isFinite(
        Number(constraint?.defaultValue ?? entry.defaultValue),
      )
        ? Number(constraint?.defaultValue ?? entry.defaultValue)
        : 0;
      if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        return null;
      }
      const label =
        typeof entry.label === "string" && entry.label.trim().length > 0
          ? entry.label
          : formatPathLabel(relativePath);
      const lowered = `${label} ${relativePath}`.toLowerCase();
      const priority = prioritizedNeedles.findIndex((needle) =>
        lowered.includes(needle),
      );
      return {
        absolutePath,
        relativePath,
        label,
        min,
        max,
        defaultValue,
        priority: priority === -1 ? prioritizedNeedles.length + 1 : priority,
      };
    })
    .filter((candidate): candidate is RankedGenericControl =>
      Boolean(candidate),
    )
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.label.localeCompare(right.label);
    })
    .slice(0, 8);

  return candidates.map(({ priority: _priority, ...rest }) => rest);
}

export function FaceControlsPanel() {
  const { assetBundle, inputConstraints, setInput } = useVizijRuntime();
  const faceControls = useMemo(
    () =>
      resolveFaceControls(
        assetBundle,
        assetBundle.faceId ?? assetBundle.pose?.config?.faceId ?? null,
        inputConstraints,
      ),
    [assetBundle, inputConstraints],
  );

  const excludedPaths = useMemo(() => {
    const next = new Set<string>();
    const controls: Array<FaceScalarControl | null> = [
      faceControls.eyes.leftX,
      faceControls.eyes.leftY,
      faceControls.eyes.rightX,
      faceControls.eyes.rightY,
      faceControls.eyelids.leftUpper,
      faceControls.eyelids.rightUpper,
      faceControls.blink,
    ];
    controls.forEach((control) => {
      if (control?.path) {
        next.add(control.path);
      }
    });
    return next;
  }, [faceControls]);

  const genericControls = useMemo(
    () =>
      buildGenericControls(
        faceControls.faceId,
        assetBundle.rig?.inputMetadata ?? [],
        inputConstraints,
        excludedPaths,
      ),
    [
      assetBundle.rig?.inputMetadata,
      excludedPaths,
      faceControls.faceId,
      inputConstraints,
    ],
  );
  const defaultGenericValues = useMemo(
    () =>
      Object.fromEntries(
        genericControls.map((control) => [
          control.absolutePath,
          control.defaultValue,
        ]),
      ),
    [genericControls],
  );
  const controlsResetKey = useMemo(
    () =>
      JSON.stringify({
        blinkDefault: faceControls.blink?.defaultValue ?? 0,
        genericControls: genericControls.map((control) => [
          control.absolutePath,
          control.defaultValue,
        ]),
      }),
    [faceControls.blink?.defaultValue, genericControls],
  );

  const [gazeX, setGazeX] = useState(0);
  const [gazeY, setGazeY] = useState(0);
  const [blink, setBlink] = useState(faceControls.blink?.defaultValue ?? 0);
  const [genericValues, setGenericValues] = useState<Record<string, number>>(
    {},
  );

  useEffect(() => {
    setGazeX(0);
    setGazeY(0);
    setBlink(faceControls.blink?.defaultValue ?? 0);
    setGenericValues(defaultGenericValues);
  }, [
    controlsResetKey,
    defaultGenericValues,
    faceControls.blink?.defaultValue,
  ]);

  const applyToControls = (
    controls: Array<FaceScalarControl | null>,
    normalized: number,
  ) => {
    controls.forEach((control) => {
      if (!control) {
        return;
      }
      setInput(control.path, {
        float: mapNormalizedControlValue(control, normalized),
      });
    });
  };

  const resetControls = () => {
    setGazeX(0);
    setGazeY(0);
    setBlink(faceControls.blink?.defaultValue ?? 0);
    applyToControls([faceControls.eyes.leftX, faceControls.eyes.rightX], 0);
    applyToControls([faceControls.eyes.leftY, faceControls.eyes.rightY], 0);
    if (faceControls.blink) {
      setInput(faceControls.blink.path, {
        float: faceControls.blink.defaultValue,
      });
    }
    setGenericValues(defaultGenericValues);
    genericControls.forEach((control) => {
      setInput(control.absolutePath, { float: control.defaultValue });
    });
  };

  const noControls =
    !faceControls.eyes.leftX &&
    !faceControls.eyes.leftY &&
    !faceControls.eyes.rightX &&
    !faceControls.eyes.rightY &&
    !faceControls.blink &&
    genericControls.length === 0;

  const runtimeExamples = useMemo(() => {
    const examples: Array<{ label: string; code: string }> = [];

    if (faceControls.eyes.leftX || faceControls.eyes.rightX) {
      const gazeLines = [
        "const normalized = 0.35;",
        "// The slider fans out across any resolved horizontal gaze inputs.",
      ];
      if (faceControls.eyes.leftX) {
        gazeLines.push(
          `setInput(${JSON.stringify(faceControls.eyes.leftX.path)}, {`,
          "  float: mapNormalizedControlValue(faceControls.eyes.leftX, normalized),",
          "});",
        );
      }
      if (faceControls.eyes.rightX) {
        gazeLines.push(
          `setInput(${JSON.stringify(faceControls.eyes.rightX.path)}, {`,
          "  float: mapNormalizedControlValue(faceControls.eyes.rightX, normalized),",
          "});",
        );
      }
      examples.push({
        label: "Gaze input",
        code: gazeLines.join("\n"),
      });
    }

    if (faceControls.blink) {
      examples.push({
        label: "Blink scalar",
        code: [
          `const blinkPath = ${JSON.stringify(faceControls.blink.path)};`,
          `setInput(blinkPath, { float: ${formatExampleNumber(
            Math.min(
              faceControls.blink.max,
              faceControls.blink.defaultValue + 0.35,
            ),
          )} });`,
        ].join("\n"),
      });
    }

    if (genericControls[0]) {
      examples.push({
        label: "Authored control",
        code: [
          `const controlPath = ${JSON.stringify(genericControls[0].absolutePath)};`,
          `setInput(controlPath, { float: ${formatExampleNumber(
            Math.min(
              genericControls[0].max,
              genericControls[0].defaultValue +
                (genericControls[0].max - genericControls[0].min) * 0.25,
            ),
          )} });`,
        ].join("\n"),
      });
    }

    return examples;
  }, [faceControls, genericControls]);

  return (
    <section className="panel" aria-labelledby="face-controls-title">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Metadata-driven</p>
          <h2 id="face-controls-title">Face controls</h2>
        </div>
        <IconButton
          icon="reset"
          label="Reset controls"
          onClick={resetControls}
        />
      </header>
      <div className="panel-body">
        {noControls ? (
          <div className="panel-empty">
            This bundle does not expose authored control metadata.
          </div>
        ) : null}

        {faceControls.eyes.leftX || faceControls.eyes.rightX ? (
          <div className="control-card">
            <div className="control-card-header">
              <strong>Gaze steering</strong>
              <span>Normalized around each authored default.</span>
            </div>
            <label className="range-field">
              <span>Horizontal</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={gazeX}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setGazeX(nextValue);
                  applyToControls(
                    [faceControls.eyes.leftX, faceControls.eyes.rightX],
                    nextValue,
                  );
                }}
              />
              <output>{gazeX.toFixed(2)}</output>
            </label>
            <label className="range-field">
              <span>Vertical</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={gazeY}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setGazeY(nextValue);
                  applyToControls(
                    [faceControls.eyes.leftY, faceControls.eyes.rightY],
                    nextValue,
                  );
                }}
              />
              <output>{gazeY.toFixed(2)}</output>
            </label>
          </div>
        ) : null}

        {faceControls.blink ? (
          <div className="control-card">
            <div className="control-card-header">
              <strong>Blink</strong>
              <span>{faceControls.blink.path}</span>
            </div>
            <label className="range-field">
              <span>Intensity</span>
              <input
                type="range"
                min={faceControls.blink.min}
                max={faceControls.blink.max}
                step={0.01}
                value={blink}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setBlink(nextValue);
                  setInput(faceControls.blink!.path, { float: nextValue });
                }}
              />
              <output>{blink.toFixed(2)}</output>
            </label>
          </div>
        ) : null}

        {genericControls.length > 0 ? (
          <div className="control-card">
            <div className="control-card-header">
              <strong>Featured scalar controls</strong>
              <span>Lifted from authored input ranges and defaults.</span>
            </div>
            <div className="scalar-grid">
              {genericControls.map((control) => {
                const value =
                  genericValues[control.absolutePath] ?? control.defaultValue;
                return (
                  <label key={control.absolutePath} className="scalar-field">
                    <span>{control.label}</span>
                    <div className="scalar-field-row">
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={0.01}
                        value={value}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          setGenericValues((current) => ({
                            ...current,
                            [control.absolutePath]: nextValue,
                          }));
                          setInput(control.absolutePath, { float: nextValue });
                        }}
                      />
                      <output>{value.toFixed(2)}</output>
                    </div>
                    <small>{control.absolutePath}</small>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <RuntimeApiDisclosure
          title="Runtime control calls"
          description="Illustrative runtime-react calls for the control types surfaced in this face."
          examples={runtimeExamples}
        />
      </div>
    </section>
  );
}
