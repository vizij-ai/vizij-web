# @vizij/speech-react

`@vizij/speech-react` packages the speech-facing hooks used by Vizij React apps: speech-to-text, lightweight conversation state, TTS/viseme playback, and a few pose/path helpers that line up with `@vizij/runtime-react`.

This package is not a standalone face runtime. It assumes your app already has a Vizij runtime surface and wants to layer speech behavior on top.

## What It Exports

### Hooks

- `useSpeechRecognition()`
- `useConversation()`
- `useSpeechPlayback()`

### Services

- `fetchVisemeData()`
- Deepgram key helpers:
  - `getDeepgramApiKey()`
  - `hasEnvDeepgramApiKey()`
  - `setDeepgramApiKey()`
  - `clearDeepgramApiKey()`
- OpenAI key helpers:
  - `getOpenaiApiKey()`
  - `hasEnvOpenaiApiKey()`
  - `setOpenaiApiKey()`
  - `clearOpenaiApiKey()`

### Runtime-aligned helpers

- `buildRigInputPath()`
- `buildPoseWeightInputPathSegment()`
- `resolvePoseMembership()`
- `POSE_WEIGHT_INPUT_PATH_PREFIX`
- viseme helpers and voice metadata

## Relationship To `@vizij/runtime-react`

`@vizij/speech-react` is designed to run above `@vizij/runtime-react`, while its shared pose/path contracts come from `@vizij/studio-support`:

- `PoseDefinition` and `PoseGroupDefinition`
- canonical pose-weight and rig input paths
- the same pose/group config used by the bundle, while still staging per-pose paths rather than group-based paths
- runtime-ready stage/animate callbacks provided by the host app

The intended layering is:

1. `@vizij/runtime-react` owns face loading, orchestrator registration, and runtime control.
2. Your app adapts runtime methods such as `setInput()` and `animateValue()` to the callback shape expected by `useSpeechPlayback()`.
3. `@vizij/speech-react` handles STT, optional LLM turn generation, and viseme/emotion playback against those runtime callbacks.

`apps/vizij-standalone` is the best local reference for this pattern.

## Example Integration

```tsx
import { useVizijRuntime } from "@vizij/runtime-react";
import { useSpeechPlayback } from "@vizij/speech-react";

function RuntimeSpeechLayer() {
  const { ready, faceId, assetBundle, setInput, animateValue } =
    useVizijRuntime();

  const speech = useSpeechPlayback({
    faceId: faceId ?? "face",
    poses: assetBundle.pose?.config?.poses ?? [],
    poseGroups: assetBundle.pose?.config?.poseGroups ?? [],
    runtimeReady: ready,
    stageRuntimeInput: (path, value) => {
      setInput(path, { float: value });
    },
    animateRuntimeValue: (path, value, duration) => {
      void animateValue(path, { float: value }, { duration });
    },
    apiBaseUrl: "https://your-api-base.example.com",
  });

  return (
    <>
      <audio
        ref={speech.audioRef}
        onPlay={speech.handleAudioPlay}
        onPause={speech.handleAudioPause}
        onEnded={speech.handleAudioEnded}
      />
      <button onClick={() => void speech.handleSpeak()}>
        {speech.status === "speaking" ? "Speaking…" : "Speak"}
      </button>
    </>
  );
}
```

## Hook Notes

### `useSpeechRecognition`

- browser microphone capture + Deepgram streaming
- returns `listening`, `interimTranscript`, `error`, `supported`, `startListening()`, and `stopListening()`

### `useConversation`

- minimal chat state around OpenAI Chat Completions
- current default model is `gpt-4o-mini`
- returns `sendMessage()`, `history`, `clearHistory()`, `isProcessing`, and `error`

### `useSpeechPlayback`

- fetches TTS + viseme timing from the configured API
- resolves the current speech-driven pose ids from the available pose data, then stages canonical runtime pose-weight paths
- drives the host runtime through `stageRuntimeInput` and `animateRuntimeValue`
- returns speech status, selected voice/group state, hidden audio element wiring, and `handleSpeak()` / `handleStop()`

## Development

```bash
pnpm --filter "@vizij/speech-react" build
pnpm --filter "@vizij/speech-react" typecheck
```

For an end-to-end validation target, use [`apps/vizij-standalone`](../../apps/vizij-standalone/README.md), which exercises STT, LLM, TTS, viseme playback, and runtime-react integration together.
