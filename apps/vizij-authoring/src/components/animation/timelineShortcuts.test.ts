import { describe, expect, it } from "vitest";
import {
  resolveTimelineShortcut,
  shouldIgnoreTimelineShortcut,
} from "./timelineShortcuts";

function event(
  key: string,
  target: unknown = null,
  modifiers: Partial<{
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
  }> = {},
) {
  return {
    key,
    target,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...modifiers,
  } as Parameters<typeof shouldIgnoreTimelineShortcut>[0];
}

function element(tagName: string, closestMatches: string[] = []) {
  return {
    tagName,
    isContentEditable: false,
    closest: (selector: string) =>
      closestMatches.some((match) => selector.includes(match))
        ? { tagName: "DIV" }
        : null,
  };
}

describe("shouldIgnoreTimelineShortcut", () => {
  it("fires on the page body, where the author is looking at the timeline", () => {
    expect(shouldIgnoreTimelineShortcut(event(" ", element("BODY")))).toBe(
      false,
    );
    expect(
      shouldIgnoreTimelineShortcut(event("ArrowRight", element("DIV"))),
    ).toBe(false);
  });

  it("never steals a key from a text field", () => {
    // Typing a pose name or a time must not scrub the playhead.
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(
        shouldIgnoreTimelineShortcut(event("Delete", element(tag))),
        tag,
      ).toBe(true);
    }
  });

  it("never steals a key from a contenteditable region", () => {
    expect(
      shouldIgnoreTimelineShortcut(
        event(" ", { tagName: "DIV", isContentEditable: true }),
      ),
    ).toBe(true);
  });

  it("stays out of dialogs", () => {
    expect(
      shouldIgnoreTimelineShortcut(
        event("Delete", element("DIV", ["[role=dialog]"])),
      ),
    ).toBe(true);
  });

  it("lets Space activate the button the author is focused on", () => {
    expect(
      shouldIgnoreTimelineShortcut(event(" ", element("DIV", ["button"]))),
    ).toBe(true);
    // But an arrow key over a button is still a step: buttons do not use it.
    expect(
      shouldIgnoreTimelineShortcut(
        event("ArrowRight", element("DIV", ["button"])),
      ),
    ).toBe(false);
  });

  it("leaves modifier chords to the browser and the app", () => {
    for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(
        shouldIgnoreTimelineShortcut(
          event(" ", element("BODY"), { [modifier]: true }),
        ),
        modifier,
      ).toBe(true);
    }
  });

  it("tolerates an event with no usable target", () => {
    expect(shouldIgnoreTimelineShortcut(event(" ", null))).toBe(false);
    expect(shouldIgnoreTimelineShortcut(event(" ", "nope"))).toBe(false);
  });
});

describe("resolveTimelineShortcut", () => {
  it("maps the transport keys animators expect", () => {
    expect(resolveTimelineShortcut(" ")).toEqual({ kind: "toggle-play" });
    expect(resolveTimelineShortcut("ArrowLeft")).toEqual({
      kind: "step",
      direction: -1,
    });
    expect(resolveTimelineShortcut("ArrowRight")).toEqual({
      kind: "step",
      direction: 1,
    });
    expect(resolveTimelineShortcut("Home")).toEqual({ kind: "go-to-start" });
    expect(resolveTimelineShortcut("End")).toEqual({ kind: "go-to-end" });
  });

  it("treats Backspace as Delete, since both mean remove", () => {
    expect(resolveTimelineShortcut("Delete")).toEqual({
      kind: "delete-keyframe",
    });
    expect(resolveTimelineShortcut("Backspace")).toEqual({
      kind: "delete-keyframe",
    });
  });

  it("claims nothing it was not asked for", () => {
    for (const key of ["a", "Enter", "Tab", "Escape", "ArrowUp", "F5"]) {
      expect(resolveTimelineShortcut(key), key).toBeNull();
    }
  });
});
