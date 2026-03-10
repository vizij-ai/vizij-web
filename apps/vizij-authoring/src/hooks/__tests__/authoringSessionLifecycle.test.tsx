import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSessionResetEffect } from "../authoringSessionLifecycle";

describe("useSessionResetEffect", () => {
  it("ignores the initial session key and resets on later changes", () => {
    const onResetSession = vi.fn();
    const hook = renderHook(
      ({ sessionKey }: { sessionKey: string | null }) =>
        useSessionResetEffect(sessionKey, onResetSession),
      { initialProps: { sessionKey: "session-a" as string | null } },
    );

    expect(onResetSession).not.toHaveBeenCalled();

    hook.rerender({ sessionKey: "session-b" });
    expect(onResetSession).toHaveBeenCalledTimes(1);

    hook.rerender({ sessionKey: null });
    expect(onResetSession).toHaveBeenCalledTimes(2);
  });
});
