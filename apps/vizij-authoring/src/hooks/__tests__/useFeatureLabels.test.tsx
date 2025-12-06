import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { useFeatureLabels } from "../useFeatureLabels";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function renderFeatureLabels() {
  const container = document.createElement("div");
  const root = createRoot(container);
  const apiRef: { current: ReturnType<typeof useFeatureLabels> | null } = {
    current: null,
  };
  await new Promise<void>((resolve) => {
    const Harness = () => {
      apiRef.current = useFeatureLabels();
      resolve();
      return null;
    };
    act(() => {
      root.render(<Harness />);
    });
  });
  return {
    apiRef,
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
}

describe("useFeatureLabels", () => {
  it("adds and removes label overrides", async () => {
    const { apiRef, unmount } = await renderFeatureLabels();

    await act(async () => {
      apiRef.current?.handleUpdateFeatureLabel("eye", "Blink", "Custom Blink");
    });
    expect(apiRef.current?.featureLabelOverrides["eye"]).toBe("Custom Blink");

    await act(async () => {
      apiRef.current?.handleUpdateFeatureLabel("eye", "Blink", "Blink");
    });
    expect(apiRef.current?.featureLabelOverrides["eye"]).toBeUndefined();

    unmount();
  });

  it("toggles feature flags", async () => {
    const { apiRef, unmount } = await renderFeatureLabels();

    await act(async () => {
      apiRef.current?.handleFeatureFlagChange("irInspectorBeta", false);
    });
    expect(apiRef.current?.featureFlags.irInspectorBeta).toBe(false);

    unmount();
  });
});
