import type { ReactNode } from "react";
import { CollapsibleGroup } from "../ui/CollapsibleGroup";

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

/**
 * Sidebar block with a heading, an optional description, and an optional
 * collapsible instructions panel.
 *
 * The instructions panel used to be a second, hand-rolled Base UI collapsible —
 * a duplicate of `CollapsibleGroup` down to the same dead `group-data-[state=…]`
 * selectors (Base UI emits `data-open`/`data-closed`, so the chevron never
 * rotated and the panel never animated). It now delegates to `CollapsibleGroup`,
 * which is built on the Radix primitives `@semio/ui` re-exports, so that state
 * styling is live. `SidebarSectionProps` is unchanged.
 */
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
        <h2 className="text-xs font-black uppercase tracking-widest text-text-muted">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-text-secondary leading-relaxed">
            {description}
          </p>
        )}
      </header>

      {hasInstructions && instructions && (
        <CollapsibleGroup
          title={instructions.label}
          subtitle={instructions.summary}
          defaultCollapsed={!defaultInstructionsOpen}
          className="mb-0"
        >
          <div className="text-[11px] text-text-secondary leading-relaxed space-y-2 max-w-none">
            {instructions.content}
          </div>
        </CollapsibleGroup>
      )}

      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
