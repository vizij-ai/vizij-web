import React from "react";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import {
  OrchestratorProvider,
  useOrchestrator,
  useOrchFrame,
  useOrchTarget,
} from "../src";
import type { OrchestratorFrame, ValueJSON } from "../src/types";

type OrchestratorMock = {
  registerGraph: Mock;
  registerAnimation: Mock;
  prebind: Mock;
  setInput: Mock;
  removeInput: Mock;
  step: Mock<(dt: number) => OrchestratorFrame | null>;
  listControllers: Mock<() => { graphs: string[]; anims: string[] }>;
  removeGraph: Mock;
  removeAnimation: Mock;
};

const orchestratorInstances: OrchestratorMock[] = [];
const stepResultRef: { current: OrchestratorFrame | null } = {
  current: null,
};

const makeFrame = (
  overrides: Partial<OrchestratorFrame> = {},
): OrchestratorFrame => ({
  epoch: 1,
  dt: 1 / 60,
  merged_writes: [],
  conflicts: [],
  timings_ms: { total_ms: 0 },
  events: [],
  ...overrides,
});

const makeInstance = (): OrchestratorMock => {
  const graphs: string[] = [];
  const anims: string[] = [];

  const instance: OrchestratorMock = {
    registerGraph: vi.fn((cfg: object | string) => {
      const id = `graph-${graphs.length + 1}`;
      graphs.push(id);
      return id;
    }),
    registerAnimation: vi.fn((cfg: object) => {
      const id = `anim-${anims.length + 1}`;
      anims.push(id);
      return id;
    }),
    prebind: vi.fn(),
    setInput: vi.fn(),
    removeInput: vi.fn(() => true),
    step: vi.fn(() => stepResultRef.current),
    listControllers: vi.fn(() => ({ graphs: [...graphs], anims: [...anims] })),
    removeGraph: vi.fn((id: string) => {
      const idx = graphs.indexOf(id);
      if (idx >= 0) {
        graphs.splice(idx, 1);
        return true;
      }
      return false;
    }),
    removeAnimation: vi.fn((id: string) => {
      const idx = anims.indexOf(id);
      if (idx >= 0) {
        anims.splice(idx, 1);
        return true;
      }
      return false;
    }),
  };
  orchestratorInstances.push(instance);
  return instance;
};

vi.mock(
  "@vizij/orchestrator-wasm",
  () => ({
    init: vi.fn(async () => {}),
    createOrchestrator: vi.fn(async () => makeInstance()),
    Orchestrator: vi.fn(() => makeInstance()),
  }),
  { virtual: true },
);

const Harness: React.FC = () => {
  const ctx = useOrchestrator();
  const frame = useOrchFrame();
  const latest = useOrchTarget("demo/output/value");

  return (
    <div>
      <span data-testid="ready">{ctx.ready ? "ready" : "pending"}</span>
      <span data-testid="epoch">{frame?.epoch ?? "none"}</span>
      <span data-testid="target">
        {latest === undefined ? "undefined" : JSON.stringify(latest)}
      </span>
      <button data-testid="step" type="button" onClick={() => ctx.step(1 / 60)}>
        step
      </button>
      <button
        data-testid="set-input"
        type="button"
        onClick={() =>
          ctx.setInput("demo/input/value", { float: 2 } satisfies ValueJSON)
        }
      >
        set input
      </button>
    </div>
  );
};

describe("OrchestratorProvider", () => {
  beforeEach(() => {
    orchestratorInstances.length = 0;
    stepResultRef.current = null;
    vi.clearAllMocks();
  });

  const renderHarness = () =>
    render(
      <OrchestratorProvider autostart={false}>
        <Harness />
      </OrchestratorProvider>,
    );

  it("marks context as ready once orchestrator is created", async () => {
    renderHarness();
    expect(screen.getByTestId("ready").textContent).toBe("pending");

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("ready");
      expect(orchestratorInstances).toHaveLength(1);
    });
  });

  it("forwards setInput calls to the wasm orchestrator", async () => {
    renderHarness();
    await waitFor(() =>
      expect(screen.getByTestId("ready").textContent).toBe("ready"),
    );

    fireEvent.click(screen.getByTestId("set-input"));

    const instance = orchestratorInstances[0];
    expect(instance.setInput).toHaveBeenCalledWith(
      "demo/input/value",
      { float: 2 },
      undefined,
    );
  });

  it("steps the orchestrator and updates frame + hook subscribers", async () => {
    stepResultRef.current = makeFrame({
      epoch: 3,
      merged_writes: [
        {
          path: "demo/output/value",
          value: { float: 0.5 },
        },
      ],
      timings_ms: { total_ms: 1.23 },
    });

    renderHarness();
    await waitFor(() =>
      expect(screen.getByTestId("ready").textContent).toBe("ready"),
    );

    fireEvent.click(screen.getByTestId("step"));

    await waitFor(() => {
      expect(screen.getByTestId("epoch").textContent).toBe("3");
      expect(screen.getByTestId("target").textContent).toContain("0.5");
    });

    const instance = orchestratorInstances[0];
    expect(instance.step).toHaveBeenCalledWith(1 / 60);
  });
});
