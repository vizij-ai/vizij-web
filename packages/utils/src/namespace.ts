/**
 * Generates a namespaced lookup key.
 *
 * @param namespace - The namespace identifier ("default" is treated specially)
 * @param id - The identifier to namespace
 * @returns A dot-separated namespaced key (e.g., "namespace.id")
 *
 * @example
 * ```typescript
 * getLookup("users", "123") // Returns: "users.123"
 * getLookup("default", "123") // Returns: "default.123"
 * ```
 */
export function getLookup(namespace: string, id: string): string {
  return `${namespace === "default" ? "default." : `${namespace}.`}${id}`;
}

/**
 * Extracts the namespace from a lookup key.
 *
 * @param lookup - The namespaced lookup key
 * @returns The namespace portion, or "default" if no namespace is present
 *
 * @example
 * ```typescript
 * getNamespace("users.123") // Returns: "users"
 * getNamespace("123") // Returns: "default"
 * ```
 */
export function getNamespace(lookup: string): string {
  if (lookup.includes(".")) {
    return lookup.split(".")[0];
  } else return "default";
}

/**
 * Extracts the identifier from a lookup key.
 *
 * @param lookup - The namespaced lookup key
 * @returns The identifier portion, or the entire key if no namespace is present
 *
 * @example
 * ```typescript
 * getId("users.123") // Returns: "123"
 * getId("123") // Returns: "123"
 * ```
 */
export function getId(lookup: string): string {
  if (lookup.includes(".")) {
    return lookup.split(".")[1];
  } else return lookup;
}
// still used
