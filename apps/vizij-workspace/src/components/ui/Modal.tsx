import { type ReactNode } from "react";
import { Dialog as BaseDialog } from "@base-ui/react";
import { X } from "lucide-react";
import { cn } from "../../utils/cn";
import { Button } from "./Button";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
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

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  maxWidth = "2xl",
}: ModalProps) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md transition-all duration-300 data-[state=open]:opacity-100 data-[state=closed]:opacity-0" />
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0 overflow-y-auto"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <BaseDialog.Popup
            className={cn(
              "relative w-full transform rounded-2xl bg-bg-card border border-border-default text-left shadow-2xl transition-all duration-300 data-[state=open]:opacity-100 data-[state=open]:scale-100 data-[state=open]:translate-y-0 data-[state=closed]:opacity-0 data-[state=closed]:scale-95 data-[state=closed]:translate-y-4 sm:my-8",
              maxWidthClasses[maxWidth],
              className,
            )}
          >
            <header className="flex justify-between items-center px-6 py-4 bg-bg-panel/50 border-b border-border-default/50">
              <BaseDialog.Title className="m-0 text-lg font-bold text-text-primary uppercase tracking-widest font-heading">
                {title}
              </BaseDialog.Title>
              <BaseDialog.Close
                render={(props) => (
                  <Button
                    {...props}
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 opacity-70 hover:opacity-100"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                )}
              />
            </header>
            <div className="px-6 py-6 text-text-secondary max-h-[80vh] overflow-y-auto">
              {children}
            </div>
          </BaseDialog.Popup>
        </div>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
