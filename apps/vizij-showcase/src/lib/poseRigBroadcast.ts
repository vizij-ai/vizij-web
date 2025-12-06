type PoseTriggerEventDetail = {
  poseId?: string;
  relativePath?: string;
  weight: number;
};

const POSE_TRIGGER_EVENT = "vizij:pose-trigger";

type PoseTriggerHandler = (detail: PoseTriggerEventDetail) => void;

export function broadcastPoseTrigger(detail: PoseTriggerEventDetail) {
  if (typeof window === "undefined") {
    return;
  }
  const event = new CustomEvent<PoseTriggerEventDetail>(POSE_TRIGGER_EVENT, {
    detail,
  });
  window.dispatchEvent(event);
}

export function addPoseTriggerListener(handler: PoseTriggerHandler) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<PoseTriggerEventDetail>;
    if (!customEvent.detail) {
      return;
    }
    handler(customEvent.detail);
  };
  window.addEventListener(POSE_TRIGGER_EVENT, listener as EventListener);
  return () => {
    window.removeEventListener(POSE_TRIGGER_EVENT, listener as EventListener);
  };
}
