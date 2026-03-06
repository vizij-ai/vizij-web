const STORAGE_KEY = "vizij_openai_api_key";

export function getOpenaiApiKey(): string | null {
  const envKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (typeof envKey === "string" && envKey.trim()) {
    return envKey.trim();
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored?.trim() || null;
}

export function hasEnvOpenaiApiKey(): boolean {
  const envKey = import.meta.env.VITE_OPENAI_API_KEY;
  return typeof envKey === "string" && envKey.trim().length > 0;
}

export function setOpenaiApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function clearOpenaiApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}
