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
      outcome: { status: "failed", message: "not a GLB file" },
    });
    expect(text).toMatch(/as they were exported: not a GLB file/);
    expect(text).not.toMatch(/loaded|imported/i);
  });

  it("says a re-import without cleanup took the file as picked", () => {
    expect(renderNotice({ cleanup: "off", outcome: null })).toMatch(
      /Imported as picked, without the morph target cleanup\./,
    );
    expect(screen.queryByTestId("morph-triangles-reimport-off")).toBeNull();
    expect(screen.getByTestId("morph-triangles-reimport-safe")).toBeTruthy();
    expect(screen.getByTestId("morph-triangles-reimport-overall")).toBeTruthy();
  });

  it("re-imports with another cleanup only after confirming", () => {
    const onReimport = vi.fn();
    renderNotice(
      { cleanup: "safe", outcome: { status: "failed", message: "x" } },
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

    fireEvent.click(screen.getByTestId("morph-triangles-reimport-off"));
    fireEvent.click(screen.getByTestId("morph-triangles-reimport-go"));
    expect(onReimport).toHaveBeenCalledWith("off");
  });

  it("dismisses", () => {
    const onDismiss = vi.fn();
    renderNotice({ cleanup: "off", outcome: null }, vi.fn(), onDismiss);
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
