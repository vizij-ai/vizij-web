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
            runtimeState: "playing",
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
            id: "program:queued",
            label: "Queued",
            source: "authored",
            selected: false,
            runtimeState: "stopped",
          },
          {
            id: "program:live",
            label: "Live",
            source: "imported",
            selected: false,
            runtimeState: "playing",
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

    expect(onSelect).toHaveBeenNthCalledWith(1, "program:queued");
    expect(onSelect).toHaveBeenNthCalledWith(2, "program:live");
    expect(onSelect).toHaveBeenNthCalledWith(3, "program:live");
    expect(onPlay).toHaveBeenCalledWith("program:queued");
    expect(onPause).toHaveBeenCalledWith("program:live");
    expect(onStop).toHaveBeenCalledWith("program:live");
  });

  it("shows play for stopped rows and pause/stop only for the active row", () => {
    render(
      <AuthoringTargetList
        kindLabel="Program"
        emptyDescription="Empty"
        items={[
          {
            id: "program:live",
            label: "Live Program",
            source: "imported",
            selected: false,
            runtimeState: "playing",
          },
          {
            id: "program:selected",
            label: "Selected Program",
            source: "authored",
            selected: true,
            runtimeState: "stopped",
          },
        ]}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getAllByTitle("Play program")).toHaveLength(1);
    expect(screen.getAllByTitle("Pause program")).toHaveLength(1);
    expect(screen.getAllByTitle("Stop program")).toHaveLength(1);
    expect(screen.getByText("playing")).toBeTruthy();
    expect(screen.getByText("stopped")).toBeTruthy();
  });

  it("offers play, not a dead pause, while the active row is paused", () => {
    // A paused row used to render a *disabled* Pause button and no Play, so
    // pausing a clip left no way to resume it — the transport was a one-way
    // door. Play is the control that belongs on anything that is not playing.
    const onPlay = vi.fn();

    render(
      <AuthoringTargetList
        kindLabel="Program"
        emptyDescription="Empty"
        items={[
          {
            id: "program:paused",
            label: "Paused Program",
            source: "authored",
            selected: true,
            runtimeState: "paused",
          },
        ]}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onPlay={onPlay}
        onPause={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.queryByTitle("Pause program")).toBeNull();
    const play = screen.getByTitle("Play program") as HTMLButtonElement;
    expect(play.disabled).toBe(false);
    fireEvent.click(play);
    expect(onPlay).toHaveBeenCalledWith("program:paused");

    expect(
      (screen.getByTitle("Stop program") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("still offers stop, not play, while the active row is playing", () => {
    render(
      <AuthoringTargetList
        kindLabel="Program"
        emptyDescription="Empty"
        items={[
          {
            id: "program:playing",
            label: "Playing Program",
            source: "authored",
            selected: true,
            runtimeState: "playing",
          },
        ]}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.queryByTitle("Play program")).toBeNull();
    expect(
      (screen.getByTitle("Pause program") as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
