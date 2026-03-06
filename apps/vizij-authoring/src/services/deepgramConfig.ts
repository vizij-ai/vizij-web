const STORAGE_KEY = "vizij_deepgram_api_key";

export function getDeepgramApiKey(): string | null {
  const envKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
  if (typeof envKey === "string" && envKey.trim()) {
    return envKey.trim();
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored?.trim() || null;
}

export function hasEnvDeepgramApiKey(): boolean {
  const envKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
  return typeof envKey === "string" && envKey.trim().length > 0;
}

export function setDeepgramApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function clearDeepgramApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}
