# @vizij/animation-react

React context and hooks for the Vizij animation controller WASM module.

## Dev

Install a version of `@vizij/animation-wasm` (from npm) or link it locally:

```bash
# inside vizij-rs/npm/@vizij/animation-wasm
npm link

# inside vizij-web
npm link @vizij/animation-wasm
```

## Use

```tsx
import { AnimationProvider, useAnimation } from "@vizij/animation-react";

function Panel() {
  const { ready, outputs, setFrequency } = useAnimation();
  if (!ready) return <p>Loading…</p>;
  return (
    <div>
      <p>value: {outputs?.value.toFixed(3)}</p>
      <input
        type="range"
        min={0}
        max={5}
        step={0.1}
        onChange={(e) => setFrequency(parseFloat(e.target.value))}
      />
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
```
