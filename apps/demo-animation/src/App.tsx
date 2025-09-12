import { AnimationProvider, useAnimTarget, valueAsNumber } from "@vizij/animation-react";
import anim from "./anim";

function Panel() {
  const v = useAnimTarget("demo/scalar");
  const num = valueAsNumber(v);

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 600, margin: "2rem auto" }}>
      <h1>Vizij Animation Demo</h1>
      <p>Anim key: <code>demo/scalar</code></p>
      <p>Value: <b>{num !== undefined ? num.toFixed(4) : "…"}</b></p>
      <p style={{ opacity: 0.7 }}>
        This demo runs a simple StoredAnimation in WASM and streams the value to React.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <AnimationProvider
      animations={anim}
      prebind={(path) => path}  // identity mapping of canonical target path to key
      autostart
      updateHz={60}
    >
      <Panel />
    </AnimationProvider>
  );
}
