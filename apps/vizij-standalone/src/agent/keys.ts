/**
 * The agent's keys and settings: the Deepgram and OpenAI API keys, the TTS
 * deployment. Read, first found wins, from the desktop shell's CLI flags
 * (Tauri, when the page runs in it), the build's `VITE_*` environment, then
 * what the settings panel saved in `localStorage`.
 */

export interface AgentKeys {
  deepgram: string | null;
  openai: string | null;
  /** The TTS deployment; `null` for the runtime's default. */
  speechApiUrl: string | null;
  /** Open the microphone at load. */
  autoMic: boolean;
}

const STORAGE = {
  deepgram: "vizij_deepgram_api_key",
  openai: "vizij_openai_api_key",
  speechApiUrl: "vizij_speech_api_url",
} as const;

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key)?.trim() || null;
  } catch {
    return null;
  }
}

function env(name: string): string | null {
  const value = (import.meta as unknown as { env?: Record<string, unknown> })
    .env?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The desktop shell's flags, when the page runs in Tauri; empty otherwise. */
async function shellFlags(): Promise<Record<string, string>> {
  if (!("__TAURI_INTERNALS__" in window)) return {};
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<Record<string, string>>("get_speech_keys");
  } catch {
    return {};
  }
}

export async function loadKeys(): Promise<AgentKeys> {
  const flags = await shellFlags();
  return {
    deepgram:
      flags.deepgramKey ??
      env("VITE_DEEPGRAM_API_KEY") ??
      stored(STORAGE.deepgram),
    openai:
      flags.openaiKey ?? env("VITE_OPENAI_API_KEY") ?? stored(STORAGE.openai),
    speechApiUrl:
      flags.apiUrl ?? env("VITE_API_URL") ?? stored(STORAGE.speechApiUrl),
    autoMic: flags.autoMic === "true",
  };
}

/** Keep the keys the settings panel entered, for the next visit. */
export function saveKeys(
  keys: Pick<AgentKeys, "deepgram" | "openai" | "speechApiUrl">,
): void {
  try {
    for (const [name, value] of [
      [STORAGE.deepgram, keys.deepgram],
      [STORAGE.openai, keys.openai],
      [STORAGE.speechApiUrl, keys.speechApiUrl],
    ] as const) {
      if (value) localStorage.setItem(name, value.trim());
      else localStorage.removeItem(name);
    }
  } catch {
    // no storage: the keys last for the page
  }
}
