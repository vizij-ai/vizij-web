import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MorphTrianglesSummary } from "./importPasses";
import { MorphTrianglesNotice } from "./MorphTrianglesNotice";

afterEach(cleanup);

function renderSummary(summary: Partial<MorphTrianglesSummary>) {
  render(
    <MorphTrianglesNotice
      outcome={{
        status: "applied",
        summary: {
          changed: false,
          improved: [],
          remaining: [],
          unchecked: [],
          ...summary,
        },
      }}
      onDismiss={vi.fn()}
    />,
  );
  return screen.getByTestId("morph-triangles-notice").textContent ?? "";
}

describe("MorphTrianglesNotice", () => {
  it("names the improved parts and the shapes still drawn wrong", () => {
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

  it("does not claim nothing needed adjusting while a shape is still wrong", () => {
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

  it("explains a failed cleanup without claiming anything about the import, and dismisses", () => {
    const onDismiss = vi.fn();
    render(
      <MorphTrianglesNotice
        outcome={{ status: "failed", message: "not a GLB file" }}
        onDismiss={onDismiss}
      />,
    );
    const text = screen.getByTestId("morph-triangles-notice").textContent;
    expect(text).toMatch(/as they were exported: not a GLB file/);
    expect(text).not.toMatch(/load|import/i);
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
