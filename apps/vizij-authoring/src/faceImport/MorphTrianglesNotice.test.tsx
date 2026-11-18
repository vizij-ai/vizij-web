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
    { shape: "smile_shape", before: 0.41, after: 0.12 },
    { shape: "approval_shape", before: 0.23, after: 0.009 },
  ],
};

describe("MorphTrianglesNotice", () => {
  it("counts the changed parts and lists the shapes still folding", () => {
    render(
      <MorphTrianglesNotice
        outcome={{ status: "applied", report: { parts: [mouth] } }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/Re-triangulated 1 part so/)).toBeTruthy();
    const list = screen.getByTestId("morph-triangles-still-folding");
    expect(list.textContent).toBe("mouth: smile_shape 12%");
  });

  it("says so when nothing needed changing", () => {
    render(
      <MorphTrianglesNotice
        outcome={{ status: "applied", report: { parts: [] } }}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.getByText("No morph-target triangles needed changing."),
    ).toBeTruthy();
    expect(screen.queryByTestId("morph-triangles-still-folding")).toBeNull();
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
