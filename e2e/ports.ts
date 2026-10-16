/**
 * `base` shifted by `VIZIJ_E2E_PORT_OFFSET` (default 0). Every port this suite
 * serves on goes through it, so that checkouts running the suite at the same
 * time each serve on their own ports.
 */
export function offsetPort(base: number): number {
  const raw = process.env.VIZIJ_E2E_PORT_OFFSET ?? "0";
  const port = base + Number(raw);
  if (!/^\d+$/.test(raw) || port > 65_535) {
    throw new Error(
      `VIZIJ_E2E_PORT_OFFSET must be a non-negative integer that keeps port ${base} within 65535, got "${raw}"`,
    );
  }
  return port;
}
