import { useCallback, useRef } from "react";
import { alertDialog, confirmDialog, promptDialog } from "../utils/dialogs";

type AlertFn = (message: string) => Promise<void>;
type ConfirmFn = (message: string) => Promise<boolean>;
type PromptFn = (
  message: string,
  defaultValue?: string,
) => Promise<string | null>;

export interface DialogQueueApi {
  alert: AlertFn;
  confirm: ConfirmFn;
  prompt: PromptFn;
}

export function useDialogQueue(): DialogQueueApi {
  const queueRef = useRef(Promise.resolve());

  const enqueue = useCallback(<T>(task: () => T | Promise<T>) => {
    const next = queueRef.current.then(() => task());
    queueRef.current = next.then(() => undefined).catch(() => undefined);
    return next;
  }, []);

  const alert = useCallback<AlertFn>(
    (message) =>
      enqueue(async () => {
        await Promise.resolve(alertDialog(message));
      }),
    [enqueue],
  );

  const confirm = useCallback<ConfirmFn>(
    (message) => enqueue(async () => confirmDialog(message)),
    [enqueue],
  );

  const prompt = useCallback<PromptFn>(
    (message, defaultValue) =>
      enqueue(async () => promptDialog(message, defaultValue)),
    [enqueue],
  );

  return { alert, confirm, prompt };
}
