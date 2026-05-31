export function namespaceTypedPath(path: string, namespace: string): string {
  const trimmed = typeof path === "string" ? path.trim() : "";
  if (!trimmed) {
    return trimmed;
  }
  const prefix = `${namespace}/`;
  if (trimmed.startsWith(prefix)) {
    return trimmed;
  }
  if (trimmed.startsWith("debug/")) {
    const rest = trimmed.slice("debug/".length);
    const namespacedRest = namespaceTypedPath(rest, namespace);
    return namespacedRest.startsWith("debug/")
      ? namespacedRest
      : `debug/${namespacedRest}`;
  }
  return `${prefix}${trimmed}`;
}

export function stripNamespace(path: string, namespace: string): string {
  const prefix = `${namespace}/`;
  if (path.startsWith(prefix)) {
    return path.slice(prefix.length);
  }
  const debugPrefix = `debug/${prefix}`;
  if (path.startsWith(debugPrefix)) {
    return path.slice(debugPrefix.length);
  }
  if (path.startsWith("debug/")) {
    return path.slice("debug/".length);
  }
  return path;
}

export function namespaceControllerId(
  id: string | undefined,
  namespace: string,
  kind: "graph" | "animation" | "merged" = "graph",
): string | undefined {
  if (!id) {
    return undefined;
  }
  const trimmed = id.trim();
  if (!trimmed) {
    return undefined;
  }
  const prefix = `${namespace}/${kind}/`;
  if (trimmed.startsWith(prefix)) {
    return trimmed;
  }
  return `${prefix}${trimmed}`;
}
