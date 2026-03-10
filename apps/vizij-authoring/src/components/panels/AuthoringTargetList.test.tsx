import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthoringTargetList } from "./AuthoringTargetList";

describe("AuthoringTargetList", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the new action row above search and filters", () => {
    render(
      <AuthoringTargetList
        kindLabel="Animation"
        emptyDescription="Empty"
        items={[]}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "New Animation" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Search animations...")).toBeTruthy();
    expect(screen.getByRole("button", { name: "All" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Authored" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Imported" })).toBeTruthy();
  });

  it("keeps row actions separate from row selection", () => {
    const onSelect = vi.fn();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();

    render(
      <AuthoringTargetList
        kindLabel="Program"
        emptyDescription="Empty"
        items={[
          {
            id: "program:wave",
            label: "Wave",
            source: "authored",
            selected: true,
            isRuntimeActive: true,
            meta: "4 nodes",
          },
        ]}
        onCreate={vi.fn()}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onSelect={onSelect}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle("Copy program"));
    fireEvent.click(screen.getByTitle("Delete program"));

    expect(onDuplicate).toHaveBeenCalledWith("program:wave");
    expect(onDelete).toHaveBeenCalledWith("program:wave");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selects the row before invoking transport actions", () => {
    const onSelect = vi.fn();
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onStop = vi.fn();

    render(
      <AuthoringTargetList
        kindLabel="Program"
        emptyDescription="Empty"
        items={[
          {
            id: "program:wave",
            label: "Wave",
            source: "authored",
            selected: false,
            isRuntimeActive: true,
          },
        ]}
        onCreate={vi.fn()}
        onSelect={onSelect}
        onPlay={onPlay}
        onPause={onPause}
        onStop={onStop}
      />,
    );

    fireEvent.click(screen.getByTitle("Play program"));
    fireEvent.click(screen.getByTitle("Pause program"));
    fireEvent.click(screen.getByTitle("Stop program"));

    expect(onSelect).toHaveBeenNthCalledWith(1, "program:wave");
    expect(onSelect).toHaveBeenNthCalledWith(2, "program:wave");
    expect(onSelect).toHaveBeenNthCalledWith(3, "program:wave");
    expect(onPlay).toHaveBeenCalledWith("program:wave");
    expect(onPause).toHaveBeenCalledWith("program:wave");
    expect(onStop).toHaveBeenCalledWith("program:wave");
  });
});
