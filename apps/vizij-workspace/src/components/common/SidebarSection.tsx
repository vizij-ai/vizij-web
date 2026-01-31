import { Disclosure, DisclosureButton, DisclosurePanel, Transition } from "@headlessui/react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type SidebarInstructions = {
  label: string;
  summary?: string;
  content: ReactNode;
  size?: "default" | "compact";
};

interface SidebarSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  instructions?: SidebarInstructions;
  defaultInstructionsOpen?: boolean;
}

export function SidebarSection({
  title,
  description,
  children,
  instructions,
  defaultInstructionsOpen = false,
}: SidebarSectionProps) {
  const hasInstructions = Boolean(instructions);

  return (
    <section className="flex flex-col gap-3 mb-6 last:mb-0">
      <header className="flex flex-col gap-1 px-1">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-slate-400 leading-relaxed">
            {description}
          </p>
        )}
      </header>

      {hasInstructions && instructions && (
        <Disclosure defaultOpen={defaultInstructionsOpen}>
          {({ open }) => (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
              <DisclosureButton className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-slate-800/50">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    {instructions.label}
                  </span>
                  {instructions.summary && (
                    <span className="text-[10px] text-slate-500 font-medium">
                      {instructions.summary}
                    </span>
                  )}
                </div>
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-slate-500 transition-transform duration-200",
                    open && "rotate-90 text-blue-400"
                  )}
                />
              </DisclosureButton>
              <Transition
                enter="transition duration-100 ease-out"
                enterFrom="transform scale-95 opacity-0"
                enterTo="transform scale-100 opacity-100"
                leave="transition duration-75 ease-out"
                leaveFrom="transform scale-100 opacity-100"
                leaveTo="transform scale-95 opacity-0"
              >
                <DisclosurePanel className="px-4 pb-4 pt-1">
                  <div className="text-[11px] text-slate-400 leading-relaxed space-y-2 prose prose-invert prose-xs max-w-none">
                    {instructions.content}
                  </div>
                </DisclosurePanel>
              </Transition>
            </div>
          )}
        </Disclosure>
      )}

      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
