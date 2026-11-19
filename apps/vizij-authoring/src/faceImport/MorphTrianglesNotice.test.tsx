import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MorphTriangleCleanup } from "../state/AuthoringUiProvider";
import type { MorphTrianglesSummary } from "./importPasses";
import { MorphTrianglesNotice } from "./MorphTrianglesNotice";
import type { ImportNotice } from "./useImportPasses";

afterEach(cleanup);

function renderNotice(
  notice: ImportNotice,
  onReimport: (cleanup: MorphTriangleCleanup) => void = vi.fn(),
  onDismiss: () => void = vi.fn(),
) {
  render(
    <MorphTrianglesNotice
      notice={notice}
      onReimport={onReimport}
      onDismiss={onDismiss}
    />,
  );
  return screen.getByTestId("morph-triangles-notice").textContent ?? "";
}

function renderSummary(summary: Partial<MorphTrianglesSummary>) {
  return renderNotice({
    cleanup: "safe",
    outcome: {
      status: "applied",
      summary: {
        changed: false,
        improved: [],
        remaining: [],
        worsened: [],
        declined: [],
        unchecked: [],
        ...summary,
      },
    },
  });
}

describe("MorphTrianglesNotice", () => {
  it("names the improved parts and the poses still drawn wrong", () => {
    const text = renderSummary({
      changed: true,
      improved: ["mouth", "left_pupil"],
      remaining: [{ part: "mouth", shapes: ["neutral", "smile_shape"] }],
    });
    expect(screen.getByTestId("morph-triangles-headline").textContent).toBe(
      "Improved how these keep their outline across their morph targets: mouth, left_pupil.",
    );
    expect(
      Array.from(screen.getByTestId("morph-triangles-remaining").children).map(
        (li) => li.textContent,
      ),
    ).toEqual(["mouth: neutral, smile_shape"]);
    expect(text).not.toMatch(/%|fold/i);
  });

  it("names parts safe mode declined, with their poses that look filled in now", () => {
    const text = renderSummary({
      declined: [
        { part: "mouth", shapes: ["neutral", "smile_shape"] },
        { part: "left_eye_lid", shapes: [] },
      ],
    });
    expect(screen.getByTestId("morph-triangles-declined").textContent).toMatch(
      /Best-overall cleanup improves them; whatever still looks filled in after that needs reshaping in the source model\./,
    );
    expect(
      Array.from(
        screen.getByTestId("morph-triangles-declined-shapes").children,
      ).map((li) => li.textContent),
    ).toEqual(["mouth: neutral, smile_shape", "left_eye_lid: none"]);
    expect(text).not.toMatch(/Nothing/);
    expect(screen.queryByTestId("morph-triangles-remaining")).toBeNull();
  });

  it("does not call a change unnoticeable while something got worse", () => {
    renderSummary({
      changed: true,
      worsened: [{ part: "lid", shapes: ["blink + smile"] }],
    });
    expect(screen.queryByTestId("morph-triangles-headline")).toBeNull();
    expect(screen.getByTestId("morph-triangles-worsened").textContent).toBe(
      "lid: blink + smile",
    );
  });

  it("tells a cleanup that could not start from one that failed on the file", () => {
    expect(
      renderNotice({
        cleanup: "safe",
        outcome: { status: "failed", stage: "load", message: "offline" },
      }),
    ).toMatch(
      /The cleanup could not start, so the triangles are as they were exported: offline/,
    );
  });

  it("lists the blends the cleanup made worse", () => {
    renderSummary({
      changed: true,
      improved: ["mouth"],
      worsened: [{ part: "mouth", shapes: ["idle_shape + sad_shape"] }],
    });
    expect(screen.getByTestId("morph-triangles-worsened").textContent).toBe(
      "mouth: idle_shape + sad_shape",
    );
  });

  it("does not claim nothing needed adjusting while a pose is still wrong", () => {
    const text = renderSummary({
      remaining: [{ part: "mouth", shapes: ["neutral"] }],
    });
    expect(text).not.toMatch(/Nothing/);
    expect(screen.queryByTestId("morph-triangles-headline")).toBeNull();
  });

  it("does not claim nothing changed when triangles were rearranged", () => {
    const text = renderSummary({ changed: true });
    expect(text).not.toMatch(/Nothing/);
    expect(screen.getByTestId("morph-triangles-headline").textContent).toBe(
      "Rearranged some triangles, with no difference large enough to notice.",
    );
  });

  it("says nothing needed adjusting only when everything was checked", () => {
    expect(renderSummary({})).toMatch(/Nothing needed adjusting\./);
    cleanup();
    const text = renderSummary({
      unchecked: [{ part: "left_iris", reason: "is not a single polygon" }],
    });
    expect(text).toMatch(/Nothing that could be checked needed adjusting\./);
    expect(screen.getByTestId("morph-triangles-unchecked").textContent).toBe(
      "left_iris is not a single polygon",
    );
  });

  it("explains a failed cleanup without claiming anything about the import", () => {
    const text = renderNotice({
      cleanup: "safe",
      outcome: { status: "failed", stage: "file", message: "not a GLB file" },
    });
    expect(text).toMatch(/as they were exported: not a GLB file/);
    expect(text).not.toMatch(/loaded|imported/i);
  });

  it("says a re-import ran with the cleanup off", () => {
    expect(renderNotice({ cleanup: "off", outcome: null })).toMatch(
      /The morph target cleanup was off for this import, so the triangles are as they were exported\./,
    );
    expect(screen.queryByTestId("morph-triangles-reimport-off")).toBeNull();
    expect(screen.getByTestId("morph-triangles-reimport-safe")).toBeTruthy();
    expect(screen.getByTestId("morph-triangles-reimport-overall")).toBeTruthy();
  });

  it("re-imports with another cleanup only after confirming", () => {
    const onReimport = vi.fn();
    renderNotice(
      {
        cleanup: "safe",
        outcome: { status: "failed", stage: "file", message: "x" },
      },
      onReimport,
    );
    expect(screen.queryByTestId("morph-triangles-reimport-safe")).toBeNull();
    fireEvent.click(screen.getByTestId("morph-triangles-reimport-overall"));
    expect(onReimport).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("morph-triangles-reimport-confirm").textContent,
    ).toMatch(/changes made since this import are lost/);
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("morph-triangles-reimport-confirm")).toBeNull();
    expect(onReimport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("morph-triangles-reimport-overall"));
    expect(
      screen.getByTestId("morph-triangles-reimport-confirm").textContent,
    ).toMatch(/Later imports use this choice too\./);
    fireEvent.click(screen.getByTestId("morph-triangles-reimport-go"));
    expect(onReimport).toHaveBeenCalledWith("overall");
  });

  it("dismisses", () => {
    const onDismiss = vi.fn();
    renderNotice({ cleanup: "off", outcome: null }, vi.fn(), onDismiss);
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
