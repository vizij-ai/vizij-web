const textEncoder =
  typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(
          (value as Record<string, unknown>)[key],
        )}`,
    );
  return `{${entries.join(",")}}`;
}

function fallbackHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hash =
    ((h2 >>> 0).toString(16).padStart(8, "0") as string) +
    ((h1 >>> 0).toString(16).padStart(8, "0") as string);

  return hash;
}

async function sha256Hex(input: string): Promise<string> {
  if (!textEncoder || !globalThis.crypto?.subtle) {
    return fallbackHash(input);
  }
  try {
    const data = textEncoder.encode(input);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    console.warn("Failed to compute SHA-256 hash, using fallback.", error);
    return fallbackHash(input);
  }
}

export async function computeObjectHash(value: unknown): Promise<string> {
  const serialised = stableStringify(value);
  return sha256Hex(serialised);
}
