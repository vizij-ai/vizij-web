import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportFailureStack } from "./ImportFailureStack";

describe("ImportFailureStack", () => {
  it("renders nothing when no failures are provided", () => {
    const { container } = render(<ImportFailureStack failures={[]} />);
    expect(container.textContent).toBe("");
  });

  it("renders failure alerts with retry and dismiss actions", () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ImportFailureStack
        failures={[
          {
            id: "asset",
            title: "Asset import failed",
            message: "Bad file",
            retryLabel: "Retry Import",
            onRetry,
            onDismiss,
          },
        ]}
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Asset import failed")).toBeTruthy();
    expect(screen.getByText("Bad file")).toBeTruthy();

    fireEvent.click(screen.getByText("Retry Import"));
    fireEvent.click(screen.getByText("Dismiss"));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
