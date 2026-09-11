/**
 * Whether a keyboard shortcut should be ignored for this event.
 *
 * The timeline listens on the window so the shortcuts work while the author is
 * looking at the timeline rather than only when it holds focus — which is the
 * convention every DCC uses. That reach is also the hazard: this app has many
 * panels, and swallowing Space or Delete while someone is typing a pose name
 * or tabbing through buttons would be worse than having no shortcuts.
 *
 * Kept separate from the component because the interesting part is the list of
 * cases where a shortcut must *not* fire, and that list is worth testing
 * directly rather than through six rendered scenarios.
 */

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function shouldIgnoreTimelineShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "target" | "ctrlKey" | "metaKey" | "altKey"
  >,
): boolean {
  // A modifier means the chord belongs to something else — the browser, the
  // OS, or an app-level command — not to the timeline.
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return true;
  }

  const target = event.target;
  if (!target || typeof target !== "object") {
    return false;
  }
  const element = target as Partial<HTMLElement> & {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  };

  if (element.tagName && EDITABLE_TAGS.has(element.tagName)) {
    return true;
  }
  if (element.isContentEditable) {
    return true;
  }
  // A dialog is a separate context: Space and Delete belong to whatever the
  // author is doing in there, and the timeline behind it is not the subject.
  if (
    typeof element.closest === "function" &&
    element.closest("[role=dialog]")
  ) {
    return true;
  }
  // Space activates a focused button, and arrows move within a listbox or
  // radio group. Stealing those breaks the control the author is actually on.
  if (
    (event.key === " " || event.key === "Spacebar") &&
    typeof element.closest === "function" &&
    element.closest("button, [role=button], [role=radio], [role=tab]")
  ) {
    return true;
  }

  return false;
}

export type TimelineShortcut =
  | { kind: "toggle-play" }
  | { kind: "step"; direction: -1 | 1 }
  | { kind: "delete-keyframe" }
  | { kind: "go-to-start" }
  | { kind: "go-to-end" };

/** Maps a key to the timeline's intent, or null when it is not ours. */
export function resolveTimelineShortcut(key: string): TimelineShortcut | null {
  switch (key) {
    case " ":
    case "Spacebar":
      return { kind: "toggle-play" };
    case "ArrowLeft":
      return { kind: "step", direction: -1 };
    case "ArrowRight":
      return { kind: "step", direction: 1 };
    case "Delete":
    case "Backspace":
      return { kind: "delete-keyframe" };
    case "Home":
      return { kind: "go-to-start" };
    case "End":
      return { kind: "go-to-end" };
    default:
      return null;
  }
}
