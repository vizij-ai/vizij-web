/**
 * The page: a face in the Bevy view over its own Arora runtime, and an agent
 * talking through it — the ear (Deepgram), the mind (OpenAI), the mouth (the
 * runtime's `say` skill, lips driven by its viseme players). The agent writes
 * nothing but standard names: the ROS4HRI expression the mind chose and the
 * `say` run; the face's own rig paths are its own business.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation, type State } from "./agent/conversation";
import { loadKeys, saveKeys, type AgentKeys } from "./agent/keys";
import {
  DEFAULT_SYSTEM_PROMPT,
  EXPRESSIONS,
  Thinker,
  type Reply,
} from "./agent/think";
import { mountCanvas, showFace, unlockAudio, type FaceHandle } from "./face";
import { fileGlb, initialGlb, type GlbSource } from "./glb";

const AGENT_NAME = "Vizij";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<FaceHandle | null>(null);
  const conversationRef = useRef<Conversation | null>(null);

  const [keys, setKeys] = useState<AgentKeys | null>(null);
  const [faceName, setFaceName] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("loading");
  const [state, setState] = useState<State>("idle");
  const [transcript, setTranscript] = useState<{
    text: string;
    final: boolean;
  } | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [typed, setTyped] = useState("");

  // Show a face: the previous one goes, the agent is rebuilt over the new one.
  const show = useCallback(async (source: GlbSource, current: AgentKeys) => {
    const slot = slotRef.current;
    if (!slot) return;
    conversationRef.current?.dispose();
    conversationRef.current = null;
    faceRef.current?.unload();
    faceRef.current = null;
    setStatus(`loading ${source.name}`);
    setError(null);
    try {
      const face = await showFace(source.bytes, slot, {
        speechApiUrl: current.speechApiUrl,
      });
      faceRef.current = face;
      setFaceName(source.name);
      const thinker = current.openai
        ? new Thinker(
            current.openai,
            DEFAULT_SYSTEM_PROMPT.replace("{{name}}", AGENT_NAME),
          )
        : null;
      const conversation = new Conversation(
        face,
        thinker,
        {
          onState: setState,
          onTranscript: (text, final) => setTranscript({ text, final }),
          onReply: (reply) => setReplies((all) => [...all.slice(-9), reply]),
          onError: setError,
        },
        current.deepgram,
      );
      conversationRef.current = conversation;
      setStatus("ready");
      if (current.autoMic && conversation.canListen) {
        await unlockAudio();
        await conversation.listen();
      }
    } catch (err) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Boot: the canvas, the keys, the first face.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      await mountCanvas(canvas);
      const loaded = await loadKeys();
      if (cancelled) return;
      setKeys(loaded);
      try {
        const source = await initialGlb();
        if (!cancelled) await show(source, loaded);
      } catch (err) {
        setStatus("no face");
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show]);

  // The face follows its slot when the window resizes.
  useEffect(() => {
    const onResize = () => {
      const slot = slotRef.current;
      if (slot) faceRef.current?.place(slot);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const pick = async (file: File | undefined) => {
    if (!file || !keys) return;
    await show(await fileGlb(file), keys);
  };

  const toggleMic = async () => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    // The same gesture unlocks the page's audio.
    await unlockAudio();
    if (conversation.listening) conversation.mute();
    else await conversation.listen();
  };

  const sayTyped = async () => {
    const conversation = conversationRef.current;
    const text = typed.trim();
    if (!conversation || !text) return;
    setTyped("");
    await unlockAudio();
    await conversation.turn(text);
  };

  const express = (name: string) => faceRef.current?.express(name);

  return (
    <div
      className="relative h-full w-full bg-neutral-950 text-neutral-100"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void pick(e.dataTransfer.files[0]);
      }}
    >
      {/* The one canvas of the page; the face draws in its slot. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div ref={slotRef} className="absolute inset-0" />

      <header className="pointer-events-none absolute left-0 top-0 flex w-full items-center justify-between p-3 text-sm">
        <div className="pointer-events-auto flex items-center gap-3">
          <span className="font-semibold">{faceName ?? "Vizij"}</span>
          <span className="text-neutral-400">{status}</span>
          <label className="cursor-pointer rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700">
            open a face…
            <input
              type="file"
              accept=".glb"
              className="hidden"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
        </div>
        <button
          className="pointer-events-auto rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          keys
        </button>
      </header>

      <footer className="pointer-events-none absolute bottom-0 left-0 flex w-full flex-col gap-2 p-3 text-sm">
        {error && (
          <div className="pointer-events-auto rounded bg-red-900/80 px-3 py-2">
            {error}
          </div>
        )}
        {transcript && (
          <div
            className={`px-3 ${transcript.final ? "text-neutral-100" : "text-neutral-400"}`}
          >
            {transcript.text}
          </div>
        )}
        {replies.length > 0 && (
          <div className="px-3 text-emerald-200">
            {replies[replies.length - 1].text}
          </div>
        )}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <button
            className={`rounded px-3 py-1 ${
              state === "listening" ? "bg-emerald-700" : "bg-neutral-800"
            } hover:bg-neutral-700 disabled:opacity-40`}
            disabled={!conversationRef.current?.canListen || status !== "ready"}
            onClick={() => void toggleMic()}
            title={
              keys?.deepgram
                ? "microphone"
                : "a Deepgram key is needed to listen"
            }
          >
            {state === "listening"
              ? "listening…"
              : state === "thinking"
                ? "thinking…"
                : "mic"}
          </button>
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sayTyped();
            }}
          >
            <input
              className="min-w-40 flex-1 rounded bg-neutral-800 px-3 py-1 outline-none"
              placeholder={
                keys?.openai ? "say something to the agent" : "text to say"
              }
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={status !== "ready"}
            />
            <button
              className="rounded bg-neutral-800 px-3 py-1 hover:bg-neutral-700"
              type="submit"
            >
              {keys?.openai ? "ask" : "say"}
            </button>
          </form>
          {state === "speaking" && (
            <button
              className="rounded bg-neutral-800 px-3 py-1 hover:bg-neutral-700"
              onClick={() => void conversationRef.current?.interrupt()}
            >
              stop
            </button>
          )}
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-1">
          {EXPRESSIONS.map((name) => (
            <button
              key={name}
              className="rounded bg-neutral-800/70 px-2 py-0.5 text-xs hover:bg-neutral-700"
              onClick={() => express(name)}
              disabled={status !== "ready"}
            >
              {name}
            </button>
          ))}
        </div>
      </footer>

      {settingsOpen && keys && (
        <Settings
          keys={keys}
          onClose={() => setSettingsOpen(false)}
          onSave={(next) => {
            saveKeys(next);
            setKeys(next);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Settings({
  keys,
  onSave,
  onClose,
}: {
  keys: AgentKeys;
  onSave: (keys: AgentKeys) => void;
  onClose: () => void;
}) {
  const [deepgram, setDeepgram] = useState(keys.deepgram ?? "");
  const [openai, setOpenai] = useState(keys.openai ?? "");
  const [speechApiUrl, setSpeechApiUrl] = useState(keys.speechApiUrl ?? "");
  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder: string,
  ) => (
    <label className="flex flex-col gap-1 text-xs text-neutral-300">
      {label}
      <input
        className="rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none"
        type="password"
        value={value}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
  return (
    <div className="absolute right-3 top-12 flex w-80 flex-col gap-3 rounded bg-neutral-900 p-4 text-sm shadow-lg">
      {field("Deepgram API key (the ear)", deepgram, setDeepgram, "dg_…")}
      {field("OpenAI API key (the mind)", openai, setOpenai, "sk-…")}
      {field(
        "TTS deployment (the runtime's default when empty)",
        speechApiUrl,
        setSpeechApiUrl,
        "https://…",
      )}
      <p className="text-xs text-neutral-500">
        Kept in this browser only. A new face picks them up; the current one
        keeps the ones it started with.
      </p>
      <div className="flex justify-end gap-2">
        <button
          className="rounded px-3 py-1 hover:bg-neutral-800"
          onClick={onClose}
        >
          cancel
        </button>
        <button
          className="rounded bg-emerald-700 px-3 py-1 hover:bg-emerald-600"
          onClick={() =>
            onSave({
              ...keys,
              deepgram: deepgram.trim() || null,
              openai: openai.trim() || null,
              speechApiUrl: speechApiUrl.trim() || null,
            })
          }
        >
          save
        </button>
      </div>
    </div>
  );
}
