import { type ReactNode } from "react";
import { Dialog as RadixDialog } from "radix-ui";
import { IconX } from "@tabler/icons-react";
import { cn } from "../../utils/cn";
import { Button } from "./Button";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
  backdropClassName?: string;
  containerClassName?: string;
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
};

/**
 * Modal dialog, built on `radix-ui`'s Dialog.
 *
 * radix rather than `@semio/ui`: semio's `Modal` renders its own submit/cancel
 * footer (this app's modals put their actions in `children`), has no width
 * control against the eight `maxWidth` steps used here, and its close button is
 * `<Button leftIcon={<IconX/>}/>` with no `altText` — i.e. no accessible name,
 * which would break `getByRole("button", { name: "Close" })` across nine modals.
 *
 * **z-index reconciled.** The backdrop and content were `z-50` while the menubar
 * row is `z-[3800]`, so the menubar painted *above* the modal backdrop and stayed
 * clickable behind an open dialog. Overlays now sit at `z-[4100]`, above the whole
 * menu ladder (menubar row 3800 < bar 3900 < menu popups 4000), so a modal covers
 * the application as it should. This is a deliberate visual change.
 *
 * The enter/exit transitions animate for the first time: the
 * `data-[state=open]` / `data-[state=closed]` classes were Radix-flavoured while
 * running on Base UI (which emits `data-open`/`data-closed`), so every modal
 * appeared instantly. radix emits `data-state`, so they now apply — though the
 * `closed` half is mostly moot because radix unmounts on close.
 *
 * Outside-click-to-close is now radix's own (`Dialog.Content` is modal by
 * default), replacing a hand-rolled `e.target === e.currentTarget` handler on the
 * centering wrapper. The wrapper itself is kept so the existing centering,
 * `sm:my-8` offset and `overflow-y-auto` scroll behaviour are unchanged.
 *
 * `aria-describedby={undefined}` suppresses radix's dev warning about a missing
 * `Dialog.Description`; these modals describe themselves through their content.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  maxWidth = "2xl",
  backdropClassName,
  containerClassName,
}: ModalProps) {
  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            "fixed inset-0 z-[4100] bg-zinc-950/80 backdrop-blur-md transition-all duration-300 data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
            backdropClassName,
          )}
        />
        <div
          className={cn(
            "fixed inset-0 z-[4100] flex items-center justify-center p-4 sm:p-0 overflow-y-auto pointer-events-none",
            containerClassName,
          )}
        >
          <RadixDialog.Content
            aria-describedby={undefined}
            className={cn(
              "pointer-events-auto relative w-full transform rounded-2xl bg-bg-card border border-border-default text-left shadow-2xl transition-all duration-300 data-[state=open]:opacity-100 data-[state=open]:scale-100 data-[state=open]:translate-y-0 data-[state=closed]:opacity-0 data-[state=closed]:scale-95 data-[state=closed]:translate-y-4 sm:my-8",
              maxWidthClasses[maxWidth],
              className,
            )}
          >
            <header className="flex justify-between items-center px-6 py-4 bg-bg-panel/50 border-b border-border-default/50">
              <RadixDialog.Title className="m-0 text-lg font-bold text-text-primary uppercase tracking-widest">
                {title}
              </RadixDialog.Title>
              <RadixDialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 opacity-70 hover:opacity-100"
                  aria-label="Close"
                >
                  <IconX className="w-5 h-5" />
                </Button>
              </RadixDialog.Close>
            </header>
            <div className="px-6 py-6 text-text-secondary max-h-[80vh] overflow-y-auto">
              {children}
            </div>
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
