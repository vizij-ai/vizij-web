import { Collapsible as BaseCollapsible } from "@base-ui/react";
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
        <BaseCollapsible.Root defaultOpen={defaultInstructionsOpen} className="group">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
            <BaseCollapsible.Trigger className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-slate-800/50">
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
                  "group-data-[state=open]:rotate-90 group-data-[state=open]:text-blue-400",
                )}
              />
            </BaseCollapsible.Trigger>
            <BaseCollapsible.Panel className="px-4 pb-4 pt-1 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 duration-100">
              <div className="text-[11px] text-slate-400 leading-relaxed space-y-2 prose prose-invert prose-xs max-w-none">
                {instructions.content}
              </div>
            </BaseCollapsible.Panel>
          </div>
        </BaseCollapsible.Root>
      )}

      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
