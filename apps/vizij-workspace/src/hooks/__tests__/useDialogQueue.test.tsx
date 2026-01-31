import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useDialogQueue } from "../useDialogQueue";
import * as dialogs from "../../utils/dialogs";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../utils/dialogs", () => ({
  alertDialog: vi.fn(),
  confirmDialog: vi.fn(),
  promptDialog: vi.fn(),
}));

const mockedDialogs = {
  alertDialog: vi.mocked(dialogs.alertDialog),
  confirmDialog: vi.mocked(dialogs.confirmDialog),
  promptDialog: vi.mocked(dialogs.promptDialog),
};

async function renderQueueApi() {
  const container = document.createElement("div");
  const root = createRoot(container);
  return await new Promise<ReturnType<typeof useDialogQueue>>((resolve) => {
    const Harness = () => {
      const api = useDialogQueue();
      useEffect(() => {
        resolve(api);
      }, [api]);
      return null;
    };
    act(() => {
      root.render(<Harness />);
    });
  }).finally(() => {
    act(() => {
      root.unmount();
    });
  });
}

describe("useDialogQueue", () => {
  it("resolves confirm responses as promises", async () => {
    mockedDialogs.confirmDialog.mockReturnValueOnce(true);
    const api = await renderQueueApi();

    await expect(api.confirm("continue?")).resolves.toBe(true);
    expect(mockedDialogs.confirmDialog).toHaveBeenCalledWith("continue?");
  });

  it("queues alerts sequentially", async () => {
    const order: string[] = [];
    mockedDialogs.alertDialog.mockImplementation((message: string) => {
      order.push(message);
    });
    const api = await renderQueueApi();

    await act(async () => {
      await Promise.all([api.alert("first"), api.alert("second")]);
    });

    expect(order).toEqual(["first", "second"]);
  });

  it("passes prompt defaults through", async () => {
    mockedDialogs.promptDialog.mockImplementation(
      (message: string, defaultValue?: string | undefined) => {
        expect(defaultValue).toBe("seed");
        return `${message}:${defaultValue}`;
      },
    );
    const api = await renderQueueApi();

    await expect(api.prompt("name", "seed")).resolves.toBe("name:seed");
  });
});
