import { Disclosure, DisclosureButton, DisclosurePanel, Transition } from "@headlessui/react";
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
}: InstructionCalloutProps) {
  const generatedId = useId();
  const resolvedContentId = contentId ?? generatedId;
  const isControlled = typeof isOpen === "boolean";
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isControlled ? isOpen : internalOpen;
  const isExternalTrigger = trigger === "external";

  const handleToggle = () => {
    if (isControlled) {
      onToggle?.(!open);
      return;
    }
    setInternalOpen((current) => {
      const next = !current;
      onToggle?.(next);
      return next;
    });
  };

  // If externally triggered, we just render the content based on open state
  // This is a slight deviation from strict Disclosure usage but maintains API compatibility
  if (isExternalTrigger) {
    return (
      <section
        className={cn(
          "flex flex-col gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 mb-4",
          size === "compact" ? "p-3" : "p-4",
          !open && "hidden"
        )}
        data-open={open ? "true" : undefined}
      >
        <div className="flex flex-col items-start gap-1">
          <span className="text-xs font-bold text-blue-100 uppercase tracking-wide">{label}</span>
          {summary ? (
            <span className="text-[11px] text-blue-200/60 leading-tight">{summary}</span>
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
    <Disclosure defaultOpen={defaultOpen}>
      {({ open: disclosureOpen }) => {
        // syncing internal state if uncontrolled for API compat
        // Ideally we'd move fully to Disclosure, but keeping compat for now
        const isOpenState = isControlled ? open : disclosureOpen;

        return (
          <div className={cn(
            "rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden mb-4 transition-all duration-200",
            isOpenState && "bg-slate-900 border-slate-700"
          )}>
            <DisclosureButton
              as="button"
              onClick={isControlled ? handleToggle : undefined}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-800/50 group"
            >
              <div className="flex flex-col gap-0.5">
                <span className={cn(
                  "text-[11px] font-bold uppercase tracking-wider transition-colors",
                  isOpenState ? "text-slate-200" : "text-slate-400 group-hover:text-slate-300"
                )}>
                  {label}
                </span>
                {summary ? (
                  <span className="text-[10px] text-slate-500 font-medium">
                    {summary}
                  </span>
                ) : null}
              </div>
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 text-slate-500 transition-transform duration-200",
                  isOpenState && "rotate-90 text-blue-400"
                )}
              />
            </DisclosureButton>

            {/* 
                        Note: If controlled, we can't easily use Transition with DisclosurePanel 
                        because Disclosure wants to own the state. 
                        For now, if controlled, we simply render based on `open`.
                        If uncontrolled, we use standard Disclosure behavior.
                     */}
            {isControlled ? (
              <div
                id={resolvedContentId}
                className={cn(
                  "px-4 pb-4 pt-1 text-[11px] text-slate-400 leading-relaxed space-y-2 prose prose-invert prose-xs max-w-none border-t border-slate-800/50 mt-1",
                  !open && "hidden"
                )}
              >
                {children}
              </div>
            ) : (
              <Transition
                enter="transition duration-100 ease-out"
                enterFrom="transform scale-95 opacity-0"
                enterTo="transform scale-100 opacity-100"
                leave="transition duration-75 ease-out"
                leaveFrom="transform scale-100 opacity-100"
                leaveTo="transform scale-95 opacity-0"
              >
                <DisclosurePanel className="px-4 pb-4 pt-1 text-[11px] text-slate-400 leading-relaxed space-y-2 prose prose-invert prose-xs max-w-none border-t border-slate-800/50 mt-1">
                  {children}
                </DisclosurePanel>
              </Transition>
            )}
          </div>
        )
      }}
    </Disclosure>
  );
}
