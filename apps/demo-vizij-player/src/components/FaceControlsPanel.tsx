import { useEffect, useMemo, useState } from "react";
import type { RigInput } from "@vizij/runtime";
import { useVizijRuntime } from "@vizij/runtime-react";
import { formatPathLabel } from "../lib/bundleSummary";
import { IconButton } from "./IconButton";
import { RuntimeApiDisclosure } from "./RuntimeApiDisclosure";

/** A rig input as a slider: its path relative to the face, range and rest. */
type Control = {
  path: string;
  label: string;
  min: number;
  max: number;
  defaultValue: number;
};

const FEATURED_NEEDLES = [
  "smile",
  "brow",
  "jaw",
  "chin",
  "mouth",
  "lip",
  "squint",
  "cheek",
];
const FEATURED_COUNT = 8;

function controlOf(input: RigInput): Control | null {
  const min = input.min ?? -1;
  const max = input.max ?? 1;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return null;
  }
  return {
    path: input.path,
    label: input.label?.trim() || formatPathLabel(input.path),
    min,
    max,
    defaultValue: input.defaultValue ?? 0,
  };
}

/** `normalized` in `[-1, 1]` onto the control's range, 0 at its rest. */
function fromNormalized(control: Control, normalized: number): number {
  return normalized >= 0
    ? control.defaultValue + normalized * (control.max - control.defaultValue)
    : control.defaultValue + normalized * (control.defaultValue - control.min);
}

function formatExampleNumber(value: number) {
  return Number(value.toFixed(2)).toString();
}

/** Rig inputs the panel leaves to the face: the eye positions, which the
 * gaze follows, and the idle-motion tuning. */
const LEFT_TO_THE_FACE = /eye\/pos\/|(^|\/)vmotion\//;

/**
 * The face's rig inputs as sliders, from `describe(glb).rigInputs`: the
 * blink and a few featured scalars. Each slider writes its input at
 * `runtime.path(input.path)`.
 */
export function FaceControlsPanel() {
  const { runtime, description } = useVizijRuntime();
  const inputs = useMemo(() => description?.rigInputs ?? [], [description]);

  const { blink, featured } = useMemo(() => {
    const controls = inputs
      .map(controlOf)
      .filter(
        (control): control is Control =>
          control !== null && !LEFT_TO_THE_FACE.test(control.path),
      );
    const blink = controls.find((c) => /(^|\/)blink$/.test(c.path)) ?? null;
    const featured = controls
      .filter(
        (control) =>
          control !== blink &&
          !/(^|\/)poses\/|\/pose\/control\/|\/color\//.test(control.path),
      )
      .map((control) => {
        const lowered = `${control.label} ${control.path}`.toLowerCase();
        const rank = FEATURED_NEEDLES.findIndex((needle) =>
          lowered.includes(needle),
        );
        return { control, rank: rank === -1 ? FEATURED_NEEDLES.length : rank };
      })
      .sort(
        (left, right) =>
          left.rank - right.rank ||
          left.control.label.localeCompare(right.control.label),
      )
      .slice(0, FEATURED_COUNT)
      .map(({ control }) => control);
    return { blink, featured };
  }, [inputs]);

  const [blinkValue, setBlinkValue] = useState(0);
  const [values, setValues] = useState<Record<string, number>>({});

  useEffect(() => {
    setBlinkValue(blink?.defaultValue ?? 0);
    setValues(
      Object.fromEntries(featured.map((c) => [c.path, c.defaultValue])),
    );
  }, [blink, featured]);

  const write = (entries: Array<[Control, number]>) => {
    if (!runtime) return;
    runtime.writeValues(
      Object.fromEntries(
        entries.map(([control, value]) => [runtime.path(control.path), value]),
      ),
    );
  };

  const resetControls = () => {
    setBlinkValue(blink?.defaultValue ?? 0);
    setValues(
      Object.fromEntries(featured.map((c) => [c.path, c.defaultValue])),
    );
    write(
      [...(blink ? [blink] : []), ...featured].map((control) => [
        control,
        control.defaultValue,
      ]),
    );
  };

  const runtimeExamples = useMemo(() => {
    const examples: Array<{ label: string; code: string }> = [];
    if (blink) {
      examples.push({
        label: "Blink",
        code: `runtime.setValue(runtime.path(${JSON.stringify(blink.path)}), 1);`,
      });
    }
    if (featured[0]) {
      const control = featured[0];
      examples.push({
        label: "Rig input",
        code: `runtime.setValue(runtime.path(${JSON.stringify(control.path)}), ${formatExampleNumber(
          fromNormalized(control, 0.25),
        )});`,
      });
    }
    return examples;
  }, [blink, featured]);

  const noControls = !blink && featured.length === 0;

  return (
    <section className="panel" aria-labelledby="face-controls-title">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Rig inputs</p>
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
          <div className="panel-empty">This face's rig declares no inputs.</div>
        ) : null}

        {blink ? (
          <div className="control-card">
            <div className="control-card-header">
              <strong>Blink</strong>
              <span>{blink.path}</span>
            </div>
            <label className="range-field">
              <span>Intensity</span>
              <input
                type="range"
                min={blink.min}
                max={blink.max}
                step={0.01}
                value={blinkValue}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setBlinkValue(next);
                  write([[blink, next]]);
                }}
              />
              <output>{blinkValue.toFixed(2)}</output>
            </label>
          </div>
        ) : null}

        {featured.length > 0 ? (
          <div className="control-card">
            <div className="control-card-header">
              <strong>Featured scalar controls</strong>
              <span>From the rig's declared ranges and defaults.</span>
            </div>
            <div className="scalar-grid">
              {featured.map((control) => {
                const value = values[control.path] ?? control.defaultValue;
                return (
                  <label key={control.path} className="scalar-field">
                    <span>{control.label}</span>
                    <div className="scalar-field-row">
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={0.01}
                        value={value}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setValues((current) => ({
                            ...current,
                            [control.path]: next,
                          }));
                          write([[control, next]]);
                        }}
                      />
                      <output>{value.toFixed(2)}</output>
                    </div>
                    <small>{control.path}</small>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <RuntimeApiDisclosure
          title="Runtime control calls"
          description="The writes behind these sliders, on the face's Runtime."
          examples={runtimeExamples}
        />
      </div>
    </section>
  );
}
