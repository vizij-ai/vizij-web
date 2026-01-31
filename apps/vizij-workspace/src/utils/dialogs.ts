type PromptHandler = (message: string, defaultValue?: string) => string | null;
type ConfirmHandler = (message: string) => boolean;
type AlertHandler = (message: string) => void;

interface DialogHandlers {
  prompt: PromptHandler;
  confirm: ConfirmHandler;
  alert: AlertHandler;
}

const defaultHandlers: DialogHandlers = {
  prompt: (message, defaultValue) => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.prompt?.(message, defaultValue) ?? null;
  },
  confirm: (message) => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.confirm?.(message) ?? false;
  },
  alert: (message) => {
    if (typeof window === "undefined") {
      return;
    }
    window.alert?.(message);
  },
};

let handlers = defaultHandlers;

export function setDialogHandlers(overrides: Partial<DialogHandlers>) {
  handlers = {
    ...defaultHandlers,
    ...overrides,
  };
}

export function promptDialog(message: string, defaultValue?: string) {
  return handlers.prompt(message, defaultValue);
}

export function confirmDialog(message: string) {
  return handlers.confirm(message);
}

export function alertDialog(message: string) {
  handlers.alert(message);
}
