/**
 * The native-store key for a device-store path: the key the WebSocket, ROS 2
 * and Studio bridges expose that value under.
 *
 * Leading slashes are dropped, each run of slashes becomes one, and the
 * runtime namespace prefix is removed, so spellings of a path that differ only
 * in slashes or the namespace name one key. The runtime joins its namespace to
 * a path with `/`, so a path authored with a leading slash reaches the device
 * store as `{namespace}//{path}`; it publishes as `{path}`, the same key a
 * client writes and the key catalog lists.
 *
 * A key keeps no empty segment, which the ROS 2 bridge needs: it exposes a key
 * as the topic `/{namespace}/keys/{key}`, and a topic name with an empty
 * segment is invalid.
 */
export function toStoreKey(path: string, namespace?: string): string {
  const collapsed = path.replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!namespace) return collapsed;
  return collapsed.startsWith(`${namespace}/`)
    ? collapsed.slice(namespace.length + 1)
    : collapsed;
}
