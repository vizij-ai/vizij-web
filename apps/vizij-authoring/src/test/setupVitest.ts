const originalWarn = console.warn;

console.warn = (...args: Parameters<typeof console.warn>) => {
  const [first] = args;
  if (
    typeof first === "string" &&
    first.includes("Multiple instances of Three.js being imported")
  ) {
    return;
  }
  originalWarn(...args);
};

/**
 * jsdom does not implement `PointerEvent`.
 *
 * `@base-ui/react` >= 1.7 dispatches a synthetic pointer-aware click from
 * `SwitchRoot` (via `utils/dispatchClickWithModifiers`), which does
 * `new ownerWindow(el).PointerEvent(...)`. Without this shim that throws
 * `PointerEvent is not a constructor` and the switch's `onCheckedChange` never
 * fires — which surfaces as a component bug in tests while working correctly in
 * a real browser.
 *
 * Modelled on MouseEvent, carrying only the pointer fields Base UI reads.
 */
if (typeof window !== "undefined" && !("PointerEvent" in window)) {
  class PointerEventShim extends MouseEvent {
    public readonly pointerId: number;
    public readonly width: number;
    public readonly height: number;
    public readonly pressure: number;
    public readonly tangentialPressure: number;
    public readonly tiltX: number;
    public readonly tiltY: number;
    public readonly twist: number;
    public readonly pointerType: string;
    public readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tangentialPressure = params.tangentialPressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.twist = params.twist ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? false;
    }
  }

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    writable: true,
    value: PointerEventShim,
  });
  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    writable: true,
    value: PointerEventShim,
  });
}

/**
 * jsdom does not implement `ResizeObserver`.
 *
 * `radix-ui`'s Slider measures its thumb with `@radix-ui/react-use-size`, which
 * constructs a `ResizeObserver` in a layout effect. Without this shim every test
 * that renders a `Slider` throws `ResizeObserver is not defined` during commit —
 * which takes down the whole test file, not just the slider assertion.
 *
 * A no-op is sufficient: the observer only feeds thumb-size state used to keep
 * the thumb inside the track's bounds, which has no bearing on assertions.
 */
if (typeof globalThis !== "undefined" && !("ResizeObserver" in globalThis)) {
  class ResizeObserverShim {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: ResizeObserverShim,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: ResizeObserverShim,
    });
  }
}

/**
 * jsdom does not implement pointer capture on elements.
 *
 * `radix-ui`'s Slider calls `setPointerCapture` unconditionally in its
 * `onPointerDown`. No current test drives a slider by pointer, but any that does
 * would throw, so these are stubbed to keep the failure mode "assertion" rather
 * than "TypeError".
 */
if (typeof Element !== "undefined" && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture() {};
  Element.prototype.releasePointerCapture = function releasePointerCapture() {};
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return false;
  };
}
