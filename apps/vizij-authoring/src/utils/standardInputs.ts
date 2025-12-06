export function extractStandardInputSubgroups(
  path: string,
  root: string,
): string[] {
  if (!path) {
    return [];
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [];
  }
  const working = segments[0] === "standard" ? segments.slice(1) : segments;
  if (working.length === 0) {
    return [];
  }
  const rootIndex = root
    ? working.findIndex((segment) => segment === root)
    : -1;
  const tail = rootIndex >= 0 ? working.slice(rootIndex + 1) : working.slice(1);
  if (tail.length <= 1) {
    return tail;
  }
  return tail.slice(0, -1);
}
