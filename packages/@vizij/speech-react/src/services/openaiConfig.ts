const STORAGE_KEY = "vizij_openai_api_key";

export function getOpenaiApiKey(): string | null {
  try {
    const envKey = (import.meta as any).env?.VITE_OPENAI_API_KEY;
    if (typeof envKey === "string" && envKey.trim()) {
      return envKey.trim();
    }
  } catch {
    // import.meta.env not available
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

export function hasEnvOpenaiApiKey(): boolean {
  try {
    const envKey = (import.meta as any).env?.VITE_OPENAI_API_KEY;
    return typeof envKey === "string" && envKey.trim().length > 0;
  } catch {
    return false;
  }
}

export function setOpenaiApiKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } catch {
    // localStorage not available
  }
}

export function clearOpenaiApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage not available
  }
}
