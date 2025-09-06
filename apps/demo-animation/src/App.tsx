import { AnimationProvider, useAnimation } from "@vizij/animation-react";
import { useState } from "react";

function Panel() {
  const { ready, outputs, setFrequency, setAmplitude } = useAnimation();
  const [freq, setFreq] = useState(1);
  const [amp, setAmp] = useState(1);
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 600, margin: "2rem auto" }}>
      <h1>Vizij Animation Demo</h1>
      <p>Ready: <b>{String(ready)}</b></p>
      <p>Value: <b>{outputs ? outputs.value.toFixed(4) : "…"}</b></p>
      <label>
        Frequency (Hz): {freq.toFixed(1)}
        <input
          type="range"
          min={0}
          max={5}
          step={0.1}
          value={freq}
          onChange={(e) => {
            const f = parseFloat(e.target.value);
            setFreq(f);
            setFrequency(f);
          }}
          style={{ width: "100%" }}
        />
      </label>
      <label>
        Amplitude (float): {amp.toFixed(1)}
        <input
          type="range"
          min={-5}
          max={5}
          step={0.1}
          value={amp}
          onChange={(e) => {
            const a = parseFloat(e.target.value);
            setAmp(a);
            setAmplitude(a);
          }}
          style={{ width: "100%" }}
        />
      </label>
      <p style={{ opacity: 0.7 }}>
        This demo runs a tiny sine-wave animation in WASM and streams the value to React.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <AnimationProvider>
      <Panel />
    </AnimationProvider>
  );
}
