import { stringifyMapped } from "./json";

/**
 * Downloads a JSON object as a file.
 *
 * @param data - The data to be converted to JSON and downloaded.
 * @param filename - The name of the file to be downloaded.
 */
export function downloadJSONFile(data: unknown, filename: string): void {
  const json = stringifyMapped(data);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, filename);
}

/**
 * Downloads a Blob as a file.
 *
 * @param blob - The Blob to be downloaded.
 * @param filename - The name of the file to be downloaded.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); // Append the anchor to the body to ensure it is part of the document
  a.click();
  document.body.removeChild(a); // Remove the anchor from the document after clicking
  URL.revokeObjectURL(url);
}
