export type AuthoringDebugChannel = "export" | "runtime" | "timeline";

interface AuthoringDebugGlobals {
  __VIZIJ_AUTHORING_DEBUG__?: boolean;
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
    debugGlobals.__VIZIJ_EXPORT_DEBUG__ ||
      debugGlobals.__VIZIJ_RUNTIME_DEBUG__ ||
      debugGlobals.__VIZIJ_TIMELINE_DEBUG__,
  );
}
