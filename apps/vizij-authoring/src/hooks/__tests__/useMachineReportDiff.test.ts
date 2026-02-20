import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  diffMachineReports,
  type MachineDiffResult,
  type MachineReport,
} from "@vizij/node-graph-authoring";
import { useMachineReportDiff } from "../useMachineReportDiff";

vi.mock("@vizij/node-graph-authoring", () => ({
  diffMachineReports: vi.fn(),
}));

const mockedDiffMachineReports = vi.mocked(diffMachineReports);

function createReport(overrides?: Partial<MachineReport>): MachineReport {
  return {
    reportVersion: 1,
    faceId: "face",
    summary: {
      faceId: "face",
      inputs: [],
      outputs: [],
      bindings: [],
    },
    issues: {
      fatal: [],
      byTarget: {},
    },
    irGraph: {
      nodes: [{ id: "n1", type: "input", params: { path: "rig/face/x" } }],
      edges: [],
      constants: [],
      metadata: { registryVersion: "v1" },
    },
    ...overrides,
  } as unknown as MachineReport;
}

describe("useMachineReportDiff", () => {
  beforeEach(() => {
    mockedDiffMachineReports.mockReset();
  });

  it("reports an error when comparing without a loaded report", () => {
    const { result } = renderHook(() =>
      useMachineReportDiff({
        open: true,
        report: null,
        diffLimit: 200,
      }),
    );

    act(() => {
      result.current.compareReports();
    });

    expect(result.current.diffError).toBe(
      "Generate a current IR snapshot before diffing.",
    );
  });

  it("reports parse error for invalid diff payload", () => {
    const report = createReport();
    const { result } = renderHook(() =>
      useMachineReportDiff({
        open: true,
        report,
        diffLimit: 200,
      }),
    );

    act(() => {
      result.current.setDiffText("{not-json");
    });
    act(() => {
      result.current.compareReports();
    });

    expect(result.current.diffError).toBe(
      "Pasted JSON did not look like a machine report.",
    );
    expect(mockedDiffMachineReports).not.toHaveBeenCalled();
  });

  it("computes diff result from valid report payload", () => {
    const report = createReport();
    const baseline = createReport({ faceId: "baseline" });
    const diffResult: MachineDiffResult = {
      equal: false,
      differences: [
        {
          kind: "mismatch",
          path: "/nodes/0/params/path",
          expected: "rig/face/x",
          actual: "rig/face/y",
        },
      ],
      limitReached: false,
    };
    mockedDiffMachineReports.mockReturnValue(diffResult);

    const { result } = renderHook(() =>
      useMachineReportDiff({
        open: true,
        report,
        diffLimit: 123,
      }),
    );

    act(() => {
      result.current.setDiffText(JSON.stringify(baseline));
    });
    act(() => {
      result.current.compareReports();
    });

    expect(mockedDiffMachineReports).toHaveBeenCalledWith(report, baseline, {
      limit: 123,
    });
    expect(result.current.diffResult).toEqual(diffResult);
    expect(result.current.diffError).toBeNull();
    expect(result.current.bugReportTemplate).toContain(
      "IR dual-run divergence report",
    );
  });

  it("loads diff payload from file and resets state when closed", async () => {
    const report = createReport();
    const hook = renderHook(
      ({ open }: { open: boolean }) =>
        useMachineReportDiff({
          open,
          report,
          diffLimit: 200,
        }),
      {
        initialProps: { open: true },
      },
    );

    await act(async () => {
      await hook.result.current.loadDiffTextFromFile({
        text: vi
          .fn()
          .mockResolvedValue(JSON.stringify(createReport({ faceId: "file" }))),
      } as unknown as File);
    });

    await waitFor(() => {
      expect(hook.result.current.diffText).toContain("file");
    });
    expect(hook.result.current.graphJson).toContain('"nodes"');

    hook.rerender({ open: false });

    expect(hook.result.current.diffText).toBe("");
    expect(hook.result.current.diffResult).toBeNull();
    expect(hook.result.current.diffError).toBeNull();
  });
});
