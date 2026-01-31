import { downloadBlob } from "./download";

export function ensureExtension(
  value: string,
  defaultBase: string,
  extension: string,
): string {
  const suffix = extension.startsWith(".") ? extension : `.${extension}`;
  const trimmed = value.trim();
  if (!trimmed.length) {
    return `${defaultBase}${suffix}`;
  }
  return trimmed.toLowerCase().endsWith(suffix.toLowerCase())
    ? trimmed
    : `${trimmed}${suffix}`;
}

export async function readJsonFile<T>(file: File): Promise<T> {
  const text = await file.text();
  return JSON.parse(text) as T;
}

export function downloadJsonFile(payload: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, fileName);
}
