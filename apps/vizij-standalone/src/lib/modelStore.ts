// Cross-platform persistence for the loaded GLB model.
//
// When the user picks a `.glb`, its bytes are copied into the app's private
// data directory (appLocalDataDir) so the model survives restarts and can be
// auto-loaded on the next launch. Works on every Tauri platform: on desktop the
// picker yields an absolute path, on Android a `content://` URI — `plugin-fs`
// reads both. Absolute paths (appLocalDataDir + filename) are used throughout so
// no BaseDirectory plumbing is required; the `**` fs scope covers them.

import { appLocalDataDir, basename, join } from "@tauri-apps/api/path";
import { exists, mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";

const MODEL_FILE = "model.glb";
const META_FILE = "model.json";

export interface SavedModelMeta {
  /** Original filename of the picked model, for display + MIME detection. */
  fileName: string;
  /** Epoch millis when the model was saved. */
  savedAt: number;
}

/** True when running inside a Tauri webview (desktop or mobile). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function modelPath(): Promise<string> {
  return join(await appLocalDataDir(), MODEL_FILE);
}

async function metaPath(): Promise<string> {
  return join(await appLocalDataDir(), META_FILE);
}

function mimeFor(fileName: string): string {
  return fileName.toLowerCase().endsWith(".glb")
    ? "model/gltf-binary"
    : "model/gltf+json";
}

/**
 * Copy a picked GLB into app-private storage so it auto-loads next launch.
 * `selected` is an absolute path (desktop) or a `content://` URI (Android).
 */
export async function saveModel(selected: string): Promise<SavedModelMeta> {
  const bytes = await readFile(selected);

  // Ensure the app data directory exists before writing into it.
  const dir = await appLocalDataDir();
  await mkdir(dir, { recursive: true }).catch(() => {
    // Already exists — ignore.
  });

  await writeFile(await modelPath(), bytes);

  let fileName: string;
  try {
    fileName = await basename(selected);
  } catch {
    fileName = selected.split(/[\\/]/).pop() || MODEL_FILE;
  }

  const meta: SavedModelMeta = { fileName, savedAt: Date.now() };
  await writeFile(
    await metaPath(),
    new TextEncoder().encode(JSON.stringify(meta)),
  );
  return meta;
}

/** Read the saved model's metadata, or null if none has been saved. */
export async function getSavedModelMeta(): Promise<SavedModelMeta | null> {
  try {
    const path = await metaPath();
    if (!(await exists(path))) return null;
    const bytes = await readFile(path);
    return JSON.parse(new TextDecoder().decode(bytes)) as SavedModelMeta;
  } catch {
    return null;
  }
}

/**
 * Load the previously-saved GLB from app-private storage as a `File`,
 * or null if none exists (or reading fails).
 */
export async function loadSavedModel(): Promise<File | null> {
  try {
    const path = await modelPath();
    if (!(await exists(path))) return null;
    const bytes = await readFile(path);
    const meta = await getSavedModelMeta();
    const fileName = meta?.fileName ?? MODEL_FILE;
    return new File([bytes], fileName, { type: mimeFor(fileName) });
  } catch {
    return null;
  }
}
