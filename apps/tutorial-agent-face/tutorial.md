# `tutorial-agent-face` Runtime Walkthrough

`tutorial-agent-face` puts a live conversational agent in a Vizij face. It
starts from the same base as `tutorial-fullscreen-face` — one canvas, one
`VizijRuntimeProvider`, one face — and adds Gemini Live as the agent and its
voice, lips from the agent's audio, and tools the agent calls to move the
face. Everything the app does to the face goes through the face's Arora API,
on the keys of the Vizij face standard.

## 1. The face and its program

```tsx
export function FaceApp() {
  return (
    <>
      <VizijCanvas style={CANVAS_STYLE} />
      <VizijRuntimeProvider glb={faceAssetUrl}>
        <AgentFaceRuntime />
      </VizijRuntimeProvider>
    </>
  );
}
```

The face is Quori. Its bundle carries a program, "Speaks", which runs from
load: it keeps the face alive — idle eye movements, lids, brows, the mouth's
shape — and reacts to two kinds of input the app writes:

- **the conversation state**: the keys `speaking`, `user_speaking` and
  `thinking` under `standard/vizij/conversation/`, each 1 or 0;
- **the gaze target**, `standard/vizij/gaze/target/{x,y}` in `[0, 1]` across
  the face (origin top-left, y down) and its `weight`: at 0 the program looks
  where it likes, at 1 the eyes hold the target.

The app plays along with the program: it never writes the eye positions the
program writes, and steers the eyes only through the gaze target.

## 2. The conversation state

[`useConversationState`](./src/hooks/useConversationState.ts) writes who is
speaking and whether the agent is thinking, as `useGeminiLive` reports them:

```ts
runtime.writeValues({
  [runtime.path("standard/vizij/conversation/speaking")]: modelSpeaking ? 1 : 0,
  [runtime.path("standard/vizij/conversation/user_speaking")]: userSpeaking
    ? 1
    : 0,
  [runtime.path("standard/vizij/conversation/thinking")]: thinking ? 1 : 0,
});
```

## 3. The lips

Gemini Live speaks with its own voice. [`useVisemeMouth`](./src/hooks/useVisemeMouth.ts)
builds a viseme timeline from the audio being played and its transcript —
text only, audio features plus text, or a Viterbi alignment of the two (the
"Mouth source" selector) — reads it at the playhead plus a lead, and plays
each new viseme through the device:

```ts
runtime.invoke("play_viseme", { shape, weight: 0.7 });
```

`shape` is one of the face standard's 15 visemes
([`standardVisemes.ts`](./src/standardVisemes.ts) maps the aligner's
Polly-style ids onto them, as the device's own text-to-speech does). The
device's viseme players own the envelope and the crossfade: a new viseme
takes the lips over from the previous one.

## 4. The gaze

[`useGazeTarget`](./src/hooks/useGazeTarget.ts) steers the eyes through the
gaze target: `look(x, y, seconds)` eases the target there and the weight up
to 1, `release(seconds)` eases the weight back to 0, handing the eyes back to
the program. It is used by:

- the agent's `set_gaze(x, y, holdSeconds, …)` tool, which holds the target
  for `holdSeconds` then releases it;
- [`useSpeechAnticipation`](./src/hooks/useSpeechAnticipation.ts), a blink
  and a glance down-left just before the agent speaks;
- [`useMouseGaze`](./src/hooks/useMouseGaze.ts), the eyes following the
  pointer while the debug controls are open.

## 5. Expressions

[`useShowExpression`](./src/hooks/useExpressions.ts) fades one face standard
expression's weight, `standard/vizij/expression/<name>`, up to a peak and back,
with `useAnimateValue`. The names come from the face standard's profile
(`profile("vizij-face")`). It backs the agent's `express_emotion` tool (its
options are those names; free-form words map onto them in
[`utils/emotions.ts`](./src/utils/emotions.ts)), the debug panel's emotion
buttons, and the debug hotkeys.

## 6. The agent loop

[`useGeminiLive`](./src/hooks/useGeminiLive.ts) owns the Gemini session.
`FaceApp.tsx` hands it the tools from
[`useAgentFaceTools`](./src/hooks/useAgentFaceTools.ts) and the speech
callbacks:

```tsx
const { tools, handleFunctionCalls } = useAgentFaceTools({
  enabled: ready,
  expressions,
  allowEmotionTools: debugControlsOpen,
});

const {
  status,
  userTranscript,
  agentTranscript,
  userSpeaking,
  thinking,
  modelSpeaking,
  connect,
  disconnect,
} = useGeminiLive(audioManager, voiceName, {
  onModelSpeechStart: cueSpeechStart,
  onModelSpeechEnd: clearTimers,
  enableTools: toolsEnabled,
  tools,
  handleFunctionCalls: toolsEnabled ? handleFunctionCalls : undefined,
  systemInstruction,
  initialUserTurn,
});
```

The model decides what happens; the face's standard keys and methods are how
it happens.

## 7. What to reuse

- the provider and the canvas from `FaceApp.tsx`;
- `useConversationState` and `useGazeTarget` for any face whose program reads
  the conversation state and the gaze target;
- `useVisemeMouth` for a voice the device does not produce itself — a voice
  the device speaks goes through its `say` method, which drives the lips on
  its own.
