import { Collapsible as BaseCollapsible } from "@base-ui/react";
import { ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "../../utils/cn";

interface InstructionCalloutProps {
  label: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  size?: "default" | "compact";
  isOpen?: boolean;
  trigger?: "self" | "external";
  contentId?: string;
  onToggle?: (nextOpen: boolean) => void;
  icon?: ReactNode;
}

export function InstructionCallout({
  label,
  summary,
  children,
  defaultOpen = false,
  size = "default",
  isOpen,
  trigger = "self",
  contentId,
  onToggle,
  icon,
}: InstructionCalloutProps) {
  const generatedId = useId();
  const resolvedContentId = contentId ?? generatedId;
  const isControlled = typeof isOpen === "boolean";
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isControlled ? isOpen : internalOpen;
  const isExternalTrigger = trigger === "external";

  const handleOpenChange = (next: boolean) => {
    if (isControlled) {
      onToggle?.(next);
      return;
    }
    setInternalOpen(next);
    onToggle?.(next);
  };

  const handleToggle = () => handleOpenChange(!open);

  // If externally triggered, we just render the content based on open state
  if (isExternalTrigger) {
    return (
      <section
        className={cn(
          "flex flex-col gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 mb-4",
          size === "compact" ? "p-3" : "p-4",
          !open && "hidden",
        )}
        data-open={open ? "true" : undefined}
      >
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2">
            {icon && <span className="text-blue-400">{icon}</span>}
            <span className="text-xs font-bold text-blue-100 uppercase tracking-wide">
              {label}
            </span>
          </div>
          {summary ? (
            <span className="text-[11px] text-blue-200/60 leading-tight">
              {summary}
            </span>
          ) : null}
        </div>
        <div
          id={resolvedContentId}
          className="mt-2 text-blue-100/80 text-xs leading-relaxed"
        >
          {children}
        </div>
      </section>
    );
  }

  return (
    <BaseCollapsible.Root
      defaultOpen={defaultOpen}
      open={isControlled ? isOpen : undefined}
      onOpenChange={handleOpenChange}
      className={cn(
        "rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden mb-4 transition-all duration-200 group",
        "data-[state=open]:bg-slate-900 data-[state=open]:border-slate-700",
      )}
    >
      <BaseCollapsible.Trigger
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-800/50 group"
      >
        <div className="flex items-center gap-3">
          {icon && (
            <div
              className={cn(
                "text-slate-500 transition-colors",
                "group-data-[state=open]:text-blue-400",
              )}
            >
              {icon}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                "text-[11px] font-bold uppercase tracking-wider transition-colors",
                "group-data-[state=open]:text-slate-200",
                "group-data-[state=closed]:text-slate-400 group-data-[state=closed]:group-hover:text-slate-300",
              )}
            >
              {label}
            </span>
            {summary ? (
              <span className="text-[10px] text-slate-500 font-medium">
                {summary}
              </span>
            ) : null}
          </div>
        </div>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-slate-500 transition-transform duration-200",
            "group-data-[state=open]:rotate-90 group-data-[state=open]:text-blue-400",
          )}
        />
      </BaseCollapsible.Trigger>

      <BaseCollapsible.Panel
        id={resolvedContentId}
        className="data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-top-1 duration-200 px-4 pb-4 pt-1 text-[11px] text-slate-400 leading-relaxed space-y-2 prose prose-invert prose-xs max-w-none border-t border-slate-800/50 mt-1"
      >
        {children}
      </BaseCollapsible.Panel>
    </BaseCollapsible.Root>
  );
}
