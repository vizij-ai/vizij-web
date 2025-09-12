import React, { useState, useEffect } from "react";
import type { Config } from "@vizij/animation-wasm";

function NumberField({
  label,
  value,
  onChange,
  min,
  step = 1,
  width = 120,
}: {
  label: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  min?: number;
  step?: number;
  width?: number | string;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 160, opacity: 0.75, fontSize: 12 }}>{label}</span>
      <input
        type="number"
        value={value ?? ""}
        min={min}
        step={step}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : Number(v));
        }}
        style={{ width }}
      />
    </label>
  );
}

export default function ConfigPanel({
  value,
  onChange,
}: {
  value: Config | undefined;
  onChange: (cfg: Config | undefined) => void;
}) {
  const [local, setLocal] = useState<Config>({
    scratch_samples: 2048,
    scratch_values_scalar: 1024,
    scratch_values_vec: 1024,
    scratch_values_quat: 256,
    max_events_per_tick: 1024,
    features: { reserved0: false },
    ...value,
  });

  useEffect(() => {
    setLocal((prev: Config) => ({ ...prev, ...value }));
  }, [value]);

  const apply = () => {
    // Normalize undefined empty features
    const normalized: Config = {
      ...local,
      features: local.features ? { reserved0: !!local.features.reserved0 } : undefined,
    };
    onChange(normalized);
  };

  const reset = () => {
    const def: Config = {
      scratch_samples: 2048,
      scratch_values_scalar: 1024,
      scratch_values_vec: 1024,
      scratch_values_quat: 256,
      max_events_per_tick: 1024,
      features: { reserved0: false },
    };
    setLocal(def);
    onChange(def);
  };

  return (
    <section style={{ background: "#16191d", border: "1px solid #2a2d31", borderRadius: 8, padding: 10 }}>
      <b>Engine Config</b>
      <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 8 }}>
        Edit engine configuration. Applying will re-initialize the engine.
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <NumberField
          label="scratch_samples"
          value={local.scratch_samples}
          onChange={(n) => setLocal((p: Config) => ({ ...p, scratch_samples: n }))}
          min={0}
          step={64}
        />
        <NumberField
          label="scratch_values_scalar"
          value={local.scratch_values_scalar}
          onChange={(n) => setLocal((p: Config) => ({ ...p, scratch_values_scalar: n }))}
          min={0}
          step={64}
        />
        <NumberField
          label="scratch_values_vec"
          value={local.scratch_values_vec}
          onChange={(n) => setLocal((p: Config) => ({ ...p, scratch_values_vec: n }))}
          min={0}
          step={64}
        />
        <NumberField
          label="scratch_values_quat"
          value={local.scratch_values_quat}
          onChange={(n) => setLocal((p: Config) => ({ ...p, scratch_values_quat: n }))}
          min={0}
          step={16}
        />
        <NumberField
          label="max_events_per_tick"
          value={local.max_events_per_tick}
          onChange={(n) => setLocal((p: Config) => ({ ...p, max_events_per_tick: n }))}
          min={0}
          step={64}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 160, opacity: 0.75, fontSize: 12 }}>features.reserved0</span>
          <input
            type="checkbox"
            checked={!!local.features?.reserved0}
            onChange={(e) =>
              setLocal((p: Config) => ({
                ...p,
                features: { ...(p.features ?? {}), reserved0: e.target.checked },
              }))
            }
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={apply}>Apply</button>
        <button onClick={reset}>Reset Defaults</button>
        <button onClick={() => onChange(undefined)} title="Use engine defaults (undefined)">Use Undefined</button>
      </div>
    </section>
  );
}
