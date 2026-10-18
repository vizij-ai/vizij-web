import { useCallback, useEffect, useRef, useState } from "react";
import { runStatus, unlockAudio, type RunHandle } from "@vizij/runtime";
import { useOptionalVizijRuntime, useVizijChanges } from "@vizij/runtime-react";

/** What the face reports while it speaks, relative to the face: the
 * utterance and its current viseme, both `str`. */
const SPEECH = "standard/vizij/speech";
const VISEME = "standard/vizij/viseme";

/** One viseme of an utterance: the face standard's shape, and when the face
 * took it, in milliseconds from the moment the run started. */
export interface VisemeEntry {
  viseme: string;
  at: number;
}

export type SayStatus = "idle" | "preparing" | "speaking";

const textOf = (value: unknown): string | null =>
  value && typeof value === "object" && "str" in value
    ? String((value as { str: unknown }).str)
    : null;

/**
 * The main face speaking through its device's `say` method: the text goes to
 * the text-to-speech service, the audio plays through the page, and the
 * face's lips follow through its standard adaptation. While a run plays, its
 * viseme timeline grows from the visemes the face reports, frame by frame,
 * and `utterance` is what the face says. `stop` halts the run.
 */
export function useSay() {
  const face = useOptionalVizijRuntime();
  const runtime = face?.runtime ?? null;
  const [status, setStatus] = useState<SayStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [utterance, setUtterance] = useState("");
  const [visemes, setVisemes] = useState<VisemeEntry[]>([]);
  const runRef = useRef<{ handle: RunHandle; startedAt: number } | null>(null);

  const finish = useCallback(() => {
    runRef.current = null;
    setStatus("idle");
  }, []);

  useVizijChanges((changes) => {
    const run = runRef.current;
    if (!run || !runtime) {
      return;
    }
    const visemeKey = runtime.path(VISEME);
    const speechKey = runtime.path(SPEECH);
    if (visemeKey in changes) {
      const viseme = textOf(changes[visemeKey]);
      if (viseme) {
        const at = performance.now() - run.startedAt;
        setVisemes((previous) =>
          previous[previous.length - 1]?.viseme === viseme
            ? previous
            : [...previous, { viseme, at }],
        );
      }
    }
    if (speechKey in changes) {
      setUtterance(textOf(changes[speechKey]) ?? "");
    }
    if (run.handle.status in changes) {
      const state = runStatus(changes[run.handle.status]);
      if (state && state !== "running") {
        finish();
      }
    }
  });

  // A reloaded face drops the runs of the device it replaced.
  useEffect(() => {
    finish();
  }, [finish, runtime]);

  const stop = useCallback(() => {
    const run = runRef.current;
    if (!run || !runtime) {
      return;
    }
    void runtime.halt(run.handle.run).catch((err: unknown) => {
      console.error("[vizij-authoring] the face did not stop speaking", err);
    });
  }, [runtime]);

  const speak = useCallback(
    async (text: string, voice: string) => {
      const trimmed = text.trim();
      if (!runtime || !trimmed) {
        if (!trimmed) {
          setError("Please enter something to say.");
        }
        return;
      }
      const previous = runRef.current;
      if (previous) {
        await runtime.halt(previous.handle.run);
      }
      setError(null);
      setVisemes([]);
      setUtterance("");
      setStatus("preparing");
      try {
        await unlockAudio();
        const handle = (await runtime.invoke("say", {
          text: trimmed,
          voice,
        })) as RunHandle;
        runRef.current = { handle, startedAt: performance.now() };
        setStatus("speaking");
      } catch (err) {
        runRef.current = null;
        setStatus("idle");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [runtime],
  );

  return { status, error, utterance, visemes, speak, stop };
}
