# `tutorial-agent-face` Runtime Walkthrough

`tutorial-agent-face` starts from the same runtime-react base as `tutorial-fullscreen-face`, then adds a live speech/agent control loop on top.

It is the clearest example in this repo of a face being driven by:

- authored pose metadata
- direct rig input writes
- runtime face-control helpers
- live model output
- tool-driven emotion/gaze actions

## 1. Runtime Bootstrap

The runtime layer is still small:

```tsx
const assetBundle: VizijAssetBundle = {
  namespace: "tutorial-agent-face",
  glb: {
    kind: "url",
    src: faceAssetUrl,
    aggressiveImport: true,
  },
  pose: {
    stageNeutralFilter: (_id, path) => !path.includes("/color/"),
  },
};

export function FaceApp() {
  return (
    <VizijRuntimeProvider assetBundle={assetBundle} autostart>
      <AgentFaceRuntime />
    </VizijRuntimeProvider>
  );
}
```

The runtime package still owns face loading, controller registration, and rendering. The rest of the app focuses on behavior layered on top of the resolved runtime state.

## 2. Runtime State As The Source Of Truth

Inside `AgentFaceRuntime`, the app reads:

```tsx
const { ready, loading, error, stagePoseNeutral, assetBundle } =
  useVizijRuntime();
```

The important detail is that the app uses the resolved `assetBundle` from runtime context. That means:

- pose config comes from the embedded bundle after load
- the UI does not need hard-coded face metadata
- the same interaction hooks stay aligned with whichever face bundle is loaded

As soon as the runtime is ready, the app calls `stagePoseNeutral()` so all later speech/emotion overlays start from a known baseline.

## 3. Interaction Layers Built On The Runtime

### Mouse + idle gaze

- [`useMouseGaze`](./src/hooks/useMouseGaze.ts) stages direct eye inputs from pointer movement.
- [`useIdleGazeBehavior`](./src/hooks/useIdleGazeBehavior.ts) keeps the face alive when the pointer and tool-driven gaze are inactive.

### Pose hotkeys + warmup

- [`usePoseHotkeys`](./src/hooks/usePoseHotkeys.ts) derives canonical pose-weight paths with `buildPoseWeightPathMap()`.
- It also uses runtime-react helper utilities to prioritize current emotion-style poses without hard-coding face-specific names.
- [`usePoseWarmup`](./src/hooks/usePoseWarmup.ts) briefly touches the resolved bindings so the face is ready before a conversation begins.

### Speech and mouth behavior

- [`useVisemeMouth`](./src/hooks/useVisemeMouth.ts) drives mouth shapes from live text/audio timing.
- [`useSpeechAnticipation`](./src/hooks/useSpeechAnticipation.ts) cues the face before model speech starts.
- [`useVolumeChin`](./src/hooks/useVolumeChin.ts) maps audio energy to a chin control path.

Every one of these hooks ultimately drives the face through runtime-react methods such as `setInput()` or `animateValue()`.

## 4. Tool-Driven Face Control

[`src/hooks/useAgentFaceTools.ts`](./src/hooks/useAgentFaceTools.ts) is the main runtime-react-specific piece of the live agent layer.

It uses:

- `resolveFaceControls()`
- `mapNormalizedControlValue()`
- `mapUnitControlValue()`
- `useVizijRuntime()`

That allows the app to:

- discover gaze/blink/eyelid control paths from runtime metadata
- convert normalized tool arguments into control-specific ranges
- animate eyes and eyelids without hard-coding one rig layout

The hook exposes Gemini tool declarations such as:

- `set_gaze(...)`
- `express_emotion(...)`

Those tool calls are then translated into runtime-react writes and animations.

## 5. Live Model Loop

[`useGeminiLive`](./src/hooks/useGeminiLive.ts) owns the Gemini session. `FaceApp.tsx` composes it with the runtime-driven behavior hooks:

```tsx
const { tools, handleFunctionCalls, gazeActive } = useAgentFaceTools({
  enabled: ready,
  bindings,
});

const {
  status: geminiStatus,
  connect,
  disconnect,
  userTranscript,
  agentTranscript,
} = useGeminiLive(audioManager, voiceName, {
  onModelSpeechStart: cueSpeechStart,
  onModelSpeechEnd: clearTimers,
  enableTools: toolsEnabled,
  tools,
  handleFunctionCalls: toolsEnabled ? handleFunctionCalls : undefined,
  systemInstruction: SYSTEM_INSTRUCTION,
});
```

The runtime-react contract here is straightforward:

- the model layer decides what should happen
- runtime-react is the mechanism that actually moves the face

## 6. Why This App Uses Runtime Helpers Instead Of Hard-Coded Paths

This app could have hard-coded every expression and gaze path, but it would drift as soon as the face export changed.

Instead it relies on runtime-resolved data:

- `assetBundle.pose?.config` for pose metadata
- `buildPoseWeightPathMap()` for canonical pose input paths
- pose groups as blend-group structure, not as path segments
- `resolveFaceControls()` plus `inputConstraints` for gaze/blink discovery
- runtime-react rig-input alias detection for pose-control bridging when the exported graph shape changes

That is the main documentation takeaway for dependent apps:

Prefer building behavior from the runtime’s resolved bundle and helper utilities, not from hard-coded face-specific paths.

## 7. What To Reuse In Other Apps

If you are building your own conversational face, the most reusable pieces are:

- bundle-first provider setup from `FaceApp.tsx`
- semantic pose ordering from `usePoseHotkeys.ts`
- runtime-aware gaze discovery from `useAgentFaceTools.ts`
- direct rig input staging from the gaze/viseme hooks

If you only need the baseline runtime stack, use `tutorial-fullscreen-face` instead.
