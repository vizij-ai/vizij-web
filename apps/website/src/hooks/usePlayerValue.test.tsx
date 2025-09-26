import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { act, createElement, type FC } from "react";
import { createRoot, type Root } from "react-dom/client";

import { usePlayerValue } from "./usePlayerValue";

const listeners = new Set<() => void>();
let snapshotValue: unknown;

vi.mock("@vizij/animation-react", () => ({
  useAnimation: () => ({
    subscribeToPlayerKey: (
      _player: number | string,
      _key: string,
      listener: () => void,
    ) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getPlayerKeySnapshot: () => snapshotValue,
  }),
}));

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("usePlayerValue", () => {
  let root: Root;
  let container: HTMLDivElement;
  let latest: unknown;

  const TestComponent: FC<{ player?: number | string }> = ({ player }) => {
    latest = usePlayerValue(player, "key");
    return null;
  };

  const render = (player?: number | string) => {
    act(() => {
      root.render(createElement(TestComponent, { player }));
    });
  };

  beforeEach(() => {
    listeners.clear();
    snapshotValue = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latest = undefined;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    listeners.clear();
  });

  it("returns undefined when no player is provided", () => {
    render(undefined);

    expect(latest).toBeUndefined();
    expect(listeners.size).toBe(0);
  });

  it("subscribes and updates when the store changes", () => {
    snapshotValue = "initial";
    render("player-1");

    expect(latest).toBe("initial");
    expect(listeners.size).toBe(1);

    snapshotValue = "next";
    act(() => {
      listeners.forEach((listener) => listener());
    });

    expect(latest).toBe("next");
  });

  it("cleans up subscriptions when player changes", () => {
    snapshotValue = 1;
    render("player-1");
    expect(listeners.size).toBe(1);

    render(undefined);
    expect(listeners.size).toBe(0);
  });
});
