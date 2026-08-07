import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { TreeRoot } from "./TreeRoot";
import { TreeRow } from "./TreeRow";

/**
 * A three-level tree whose middle branch starts collapsed, so the tests can tell
 * "the row is not focusable" apart from "the row is not rendered".
 *
 *   alpha            (branch, expanded)
 *     alpha-one      (leaf)
 *     alpha-two      (branch, COLLAPSED — its child is unmounted)
 *       alpha-two-a  (leaf)
 *   beta             (leaf)
 */
function Fixture({
  onSelect,
  multiselectable,
}: {
  onSelect?: (id: string, event: { metaKey: boolean }) => void;
  multiselectable?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["alpha"]));
  const [selected, setSelected] = useState<string | null>(null);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const row = (
    id: string,
    hasChildren: boolean,
    depth: number,
    children?: React.ReactNode,
  ) => (
    <TreeRow
      key={id}
      label={id}
      depth={depth}
      hasChildren={hasChildren}
      isExpanded={expanded.has(id)}
      isSelected={selected === id}
      onToggle={() => toggle(id)}
      onSelect={(event) => {
        setSelected(id);
        onSelect?.(id, event);
      }}
    >
      {children}
    </TreeRow>
  );

  return (
    <TreeRoot aria-label="Fixture" multiselectable={multiselectable}>
      {row(
        "alpha",
        true,
        0,
        <>
          {row("alpha-one", false, 1)}
          {row("alpha-two", true, 1, row("alpha-two-a", false, 2))}
        </>,
      )}
      {row("beta", false, 0)}
    </TreeRoot>
  );
}

const item = (name: string) => screen.getByRole("treeitem", { name });

/** `jest-dom` is not a dependency here, so focus is asserted directly. */
const expectFocused = (element: HTMLElement) =>
  expect(document.activeElement).toBe(element);

/**
 * Keys go to whatever currently holds focus, the way a real keypress does —
 * targeting a row by name instead would let a test pass while focus was
 * somewhere else entirely, which is the whole thing these tests exist to check.
 */
const press = (key: string, init?: KeyboardEventInit) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });

/**
 * Tab into the tree. The root is the tab stop and forwards focus to a row.
 *
 * `act` because a bare `.focus()` is not wrapped the way `fireEvent` is, so the
 * re-render that drops the root's tab stop would not have happened by the time
 * the assertion runs.
 */
const tabIn = () =>
  act(() => {
    screen.getByRole("tree").focus();
  });

afterEach(() => {
  cleanup();
});

describe("TreeRoot", () => {
  it("exposes the tree structure, and only counts rows that are visible", () => {
    render(<Fixture />);
    expect(screen.queryByRole("tree", { name: "Fixture" })).not.toBeNull();
    // `alpha-two-a` is inside a collapsed branch, so it is not merely hidden —
    // it is unmounted. That is what makes the DOM query in `TreeRoot` equal to
    // the visible order rather than merely correlated with it.
    expect(screen.getAllByRole("treeitem")).toHaveLength(4);
    expect(item("alpha").getAttribute("aria-expanded")).toBe("true");
    expect(item("alpha-two").getAttribute("aria-expanded")).toBe("false");
    // A leaf must not claim `aria-expanded` at all — "false" would tell a
    // screen reader there is a collapsed subtree to open.
    expect(item("beta").hasAttribute("aria-expanded")).toBe(false);
    expect(item("alpha").getAttribute("aria-level")).toBe("1");
    expect(item("alpha-two").getAttribute("aria-level")).toBe("2");
  });

  it("is one tab stop for the whole tree, and hands focus to the first row", () => {
    render(<Fixture />);
    tabIn();
    expectFocused(item("alpha"));
    // The root gave up its tab stop, so Tab moves OUT of the tree rather than
    // cycling back to the container.
    expect(screen.getByRole("tree").getAttribute("tabindex")).toBe("-1");
  });

  it("hands focus to the selected row rather than the first, when there is one", () => {
    render(<Fixture />);
    tabIn();
    press("ArrowDown");
    press("Enter");
    expect(item("alpha-one").getAttribute("aria-selected")).toBe("true");

    // Leave the tree, then come back.
    (document.activeElement as HTMLElement).blur();
    tabIn();
    expectFocused(item("alpha-one"));
  });

  it("moves down and up through visible rows, skipping unmounted ones", () => {
    render(<Fixture />);
    tabIn();
    press("ArrowDown");
    expectFocused(item("alpha-one"));
    press("ArrowDown");
    expectFocused(item("alpha-two"));
    // `alpha-two` is collapsed, so its child is not in the DOM and the next row
    // is the one after the whole branch.
    press("ArrowDown");
    expectFocused(item("beta"));
    // Stops at the end rather than wrapping.
    press("ArrowDown");
    expectFocused(item("beta"));
    press("ArrowUp");
    expectFocused(item("alpha-two"));
  });

  it("Home and End jump to the first and last visible rows", () => {
    render(<Fixture />);
    tabIn();
    press("End");
    expectFocused(item("beta"));
    press("Home");
    expectFocused(item("alpha"));
  });

  it("ArrowRight expands a collapsed branch, then steps into it", () => {
    render(<Fixture />);
    tabIn();
    press("ArrowDown");
    press("ArrowDown");
    expectFocused(item("alpha-two"));

    press("ArrowRight");
    expect(item("alpha-two").getAttribute("aria-expanded")).toBe("true");
    // The first press opens the branch; focus has not moved yet.
    expectFocused(item("alpha-two"));

    press("ArrowRight");
    expectFocused(item("alpha-two-a"));
  });

  it("ArrowLeft collapses an open branch, then steps out to the parent", () => {
    render(<Fixture />);
    tabIn();
    press("ArrowDown");
    expectFocused(item("alpha-one"));
    // A leaf has nothing to collapse, so the first press goes straight up.
    press("ArrowLeft");
    expectFocused(item("alpha"));
    press("ArrowLeft");
    expect(item("alpha").getAttribute("aria-expanded")).toBe("false");
  });

  it("Enter and Space select, and carry the modifier keys a consumer reads", () => {
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    tabIn();
    press("ArrowDown");
    press("Enter");
    expect(onSelect).toHaveBeenLastCalledWith(
      "alpha-one",
      expect.objectContaining({ metaKey: false }),
    );
    expect(item("alpha-one").getAttribute("aria-selected")).toBe("true");

    // `HierarchyPanel` reads `metaKey`/`ctrlKey` off the select event for
    // additive selection. A keyboard event carries both natively, so additive
    // select works from the keyboard without fabricating a mouse event.
    press(" ", { metaKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(
      "alpha-one",
      expect.objectContaining({ metaKey: true }),
    );
  });

  it("announces multi-select only when the consumer supports it", () => {
    const { rerender } = render(<Fixture />);
    expect(screen.getByRole("tree").hasAttribute("aria-multiselectable")).toBe(
      false,
    );
    rerender(<Fixture multiselectable />);
    expect(screen.getByRole("tree").getAttribute("aria-multiselectable")).toBe(
      "true",
    );
  });

  it("leaves keys alone when they belong to an input inside a row", () => {
    render(
      <TreeRoot aria-label="With an input">
        <TreeRow
          label="row"
          depth={0}
          hasChildren={false}
          onToggle={() => {}}
          actions={<input aria-label="rename" defaultValue="abc" />}
        />
      </TreeRoot>,
    );
    const input = screen.getByRole("textbox", { name: "rename" });
    input.focus();
    // Home in a text field belongs to the caret, not to the tree.
    press("Home");
    expectFocused(input);
  });

  it("changes nothing for a TreeRow rendered outside a TreeRoot", () => {
    const { container } = render(
      <TreeRow
        label="bare"
        depth={0}
        hasChildren
        isExpanded={false}
        isSelected={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.queryByRole("treeitem")).toBeNull();
    expect(container.querySelector("[tabindex]")).toBeNull();
    // The expander stays a real, reachable button when there is no tree around
    // it to provide ArrowRight/ArrowLeft instead.
    expect(container.querySelector("button")?.hasAttribute("aria-hidden")).toBe(
      false,
    );
  });
});
