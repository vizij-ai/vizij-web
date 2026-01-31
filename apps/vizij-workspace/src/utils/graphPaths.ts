export function normalizeGraphPath(
  path: string | null | undefined,
): string | null {
  if (!path) {
    return null;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
}
