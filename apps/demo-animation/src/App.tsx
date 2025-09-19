import React from "react";
import {
  AnimationProvider,
  useAnimTarget,
  valueAsNumber,
  useAnimation,
} from "@vizij/animation-react";
import anim from "./anim";

function Panel() {
  const v = useAnimTarget("demo/scalar");
  const num = valueAsNumber(v);
  const animApi = useAnimation();
  const [error, setError] = React.useState<string | null>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error("Failed to read file"));
        r.onload = () => resolve(String(r.result ?? ""));
        r.readAsText(f);
      });
      const parsed = JSON.parse(text);
      // Reload animations in-place. Accept either a single StoredAnimation or an array.
      animApi.reload(parsed);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      e.currentTarget.value = "";
    }
  };

  return (
    <div
      style={{ fontFamily: "sans-serif", maxWidth: 600, margin: "2rem auto" }}
    >
      <h1>Vizij Animation Demo</h1>
      <p>
        Anim key: <code>demo/scalar</code>
      </p>
      <p>
        Value: <b>{num !== undefined ? num.toFixed(4) : "…"}</b>
      </p>

      <div style={{ marginTop: 18, marginBottom: 8 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <strong>Load StoredAnimation JSON</strong>
          <input
            type="file"
            accept=".json,application/json"
            onChange={onFileChange}
          />
        </label>
        {error ? (
          <div style={{ color: "salmon", marginTop: 8 }}>Error: {error}</div>
        ) : null}
      </div>

      <p style={{ opacity: 0.7 }}>
        This demo runs a simple StoredAnimation in WASM and streams the value to
        React.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <AnimationProvider
      animations={anim}
      prebind={(path) => path} // identity mapping of canonical target path to key
      autostart
      updateHz={60}
    >
      <Panel />
    </AnimationProvider>
  );
}
