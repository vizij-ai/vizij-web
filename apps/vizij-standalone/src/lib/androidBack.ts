// Bridge to the Android system back gesture/button. MainActivity dispatches an
// `android-back` DOM event for every back press and exposes a native
// `window.VizijAndroid.leaveApp()` hook; the web app listens for the event,
// routes it through the same handler as its visible Back button, and calls
// `leaveApp()` when there is nothing left to close (the OS then backgrounds
// the app). On desktop neither side exists: the event never fires and
// `leaveApp` is a no-op.

export const ANDROID_BACK_EVENT = "android-back";

declare global {
  interface Window {
    VizijAndroid?: { leaveApp: () => void };
  }
}

/** Hand the back action over to the OS (Android backgrounds the app). */
export function leaveApp(): void {
  window.VizijAndroid?.leaveApp();
}
