import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MorphTrianglesReport } from "@vizij/import";
import { MorphTrianglesNotice } from "./MorphTrianglesNotice";

vi.mock("@vizij/import", () => ({
  stillFolding: (report: MorphTrianglesReport, threshold = 0.01) =>
    report.parts
      .map((part) => ({
        part,
        folds: part.folds.filter((f) => (f.after ?? 0) > threshold),
      }))
      .filter((entry) => entry.folds.length > 0),
}));

afterEach(cleanup);

const mouth = {
  mesh: 5,
  meshName: "mouth",
  primitive: 0,
  vertices: 65,
  outcome: "retriangulated" as const,
  skipReason: null,
  folds: [
    { shape: "rest", before: 0.46, after: 0.21 },
    { shape: "smile_shape", before: 0.41, after: 0.12 },
    { shape: "approval_shape", before: 0.23, after: 0.009 },
    // Above the pass's own threshold, below what the notice names.
    { shape: "talking_shape", before: 0.11, after: 0.012 },
  ],
};

/** One eyelid exported as two pieces, both still wrong at rest. */
const lidPiece = (vertices: number) => ({
  mesh: 0,
  meshName: "left_eye_lid",
  primitive: 0,
  vertices,
  outcome: "retriangulated" as const,
  skipReason: null,
  folds: [{ shape: "rest", before: 0.3, after: 0.3 }],
});

describe("MorphTrianglesNotice", () => {
  it("names the adjusted parts and the shapes still drawn wrongly", () => {
    render(
      <MorphTrianglesNotice
        outcome={{
          status: "applied",
          report: { parts: [mouth, lidPiece(4), lidPiece(6)] },
        }}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "Adjusted so their morph targets keep their outline instead of filling in: mouth.",
      ),
    ).toBeTruthy();
    const items = Array.from(
      screen.getByTestId("morph-triangles-remaining").children,
    ).map((li) => li.textContent);
    expect(items).toEqual([
      "mouth: neutral, smile_shape",
      "left_eye_lid: neutral",
    ]);
    expect(
      screen.getByTestId("morph-triangles-notice").textContent,
    ).not.toMatch(/%|fold/i);
  });

  it("says so when nothing needed changing", () => {
    render(
      <MorphTrianglesNotice
        outcome={{ status: "applied", report: { parts: [] } }}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Nothing needed a visible adjustment."),
    ).toBeTruthy();
    expect(screen.queryByTestId("morph-triangles-remaining")).toBeNull();
  });

  it("explains a failed pass and dismisses", () => {
    const onDismiss = vi.fn();
    render(
      <MorphTrianglesNotice
        outcome={{ status: "failed", message: "not a GLB file" }}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/not a GLB file/)).toBeTruthy();
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
