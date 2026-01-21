export const RUNTIME_STATUS_EVENT = "vizij:runtime-status";

export type RuntimeDebugStatus = {
  namespace: string;
  label?: string;
  visible: boolean;
  driver: boolean;
  autostart: boolean;
  hiddenStepHz: number;
  stepHz?: number;
  timestamp: number;
};

export function broadcastRuntimeStatus(status: RuntimeDebugStatus) {
  if (typeof window === "undefined") return;
  const event = new CustomEvent<RuntimeDebugStatus>(RUNTIME_STATUS_EVENT, {
    detail: status,
  });
  window.dispatchEvent(event);
}

export function addRuntimeStatusListener(
  handler: (status: RuntimeDebugStatus) => void,
) {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const custom = event as CustomEvent<RuntimeDebugStatus>;
    if (!custom.detail) return;
    handler(custom.detail);
  };
  window.addEventListener(RUNTIME_STATUS_EVENT, listener as EventListener);
  return () =>
    window.removeEventListener(RUNTIME_STATUS_EVENT, listener as EventListener);
}
