export type AuthoringDebugChannel =
  | "dialog"
  | "export"
  | "runtime"
  | "timeline";

interface AuthoringDebugGlobals {
  __VIZIJ_AUTHORING_DEBUG__?: boolean;
  __VIZIJ_DIALOG_DEBUG__?: boolean;
  __VIZIJ_EXPORT_DEBUG__?: boolean;
  __VIZIJ_RUNTIME_DEBUG__?: boolean;
  __VIZIJ_TIMELINE_DEBUG__?: boolean;
}

export function isAuthoringDebugEnabled(
  channel?: AuthoringDebugChannel,
): boolean {
  const debugGlobals = globalThis as AuthoringDebugGlobals;
  if (debugGlobals.__VIZIJ_AUTHORING_DEBUG__) {
    return true;
  }
  if (channel === "dialog") {
    return Boolean(debugGlobals.__VIZIJ_DIALOG_DEBUG__);
  }
  if (channel === "export") {
    return Boolean(debugGlobals.__VIZIJ_EXPORT_DEBUG__);
  }
  if (channel === "runtime") {
    return Boolean(debugGlobals.__VIZIJ_RUNTIME_DEBUG__);
  }
  if (channel === "timeline") {
    return Boolean(debugGlobals.__VIZIJ_TIMELINE_DEBUG__);
  }
  return Boolean(
    debugGlobals.__VIZIJ_DIALOG_DEBUG__ ||
      debugGlobals.__VIZIJ_EXPORT_DEBUG__ ||
      debugGlobals.__VIZIJ_RUNTIME_DEBUG__ ||
      debugGlobals.__VIZIJ_TIMELINE_DEBUG__,
  );
}

export function logAuthoringDebug(
  channel: AuthoringDebugChannel,
  label: string,
  payload?: Record<string, unknown>,
): void {
  if (!isAuthoringDebugEnabled(channel)) {
    return;
  }
  // eslint-disable-next-line no-console -- opt-in local authoring diagnostics
  console.log(label, payload ?? {});
}
