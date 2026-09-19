/**
 * Where the face comes from: the page's `?glb=` URL, the desktop shell's
 * `--glb` flag (a path or a URL, when the page runs in Tauri), a file the
 * user picks or drops, else the face this app ships.
 */

export const DEFAULT_GLB = "/faces/Quori_Current_Extended.glb";

export interface GlbSource {
  name: string;
  bytes: Uint8Array;
}

async function fetchGlb(url: string): Promise<GlbSource> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cannot fetch ${url}: ${res.status}`);
  return {
    name: url.split("/").pop() || url,
    bytes: new Uint8Array(await res.arrayBuffer()),
  };
}

/** The shell's `--glb`, read through Tauri; `null` outside the shell or
 * without the flag. */
async function shellGlb(): Promise<GlbSource | null> {
  if (!("__TAURI_INTERNALS__" in window)) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const source = await invoke<string | null>("get_glb_source");
  if (!source) return null;
  if (/^https?:\/\//.test(source)) return fetchGlb(source);
  const base64 = await invoke<string>("read_glb_file", { path: source });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { name: source.split(/[\\/]/).pop() || source, bytes };
}

/** The face to open at load. */
export async function initialGlb(): Promise<GlbSource> {
  const fromUrl = new URLSearchParams(location.search).get("glb");
  if (fromUrl) return fetchGlb(fromUrl);
  return (await shellGlb()) ?? fetchGlb(DEFAULT_GLB);
}

export async function fileGlb(file: File): Promise<GlbSource> {
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}
