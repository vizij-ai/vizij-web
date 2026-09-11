import type { ReactNode } from "react";
import { CollapsibleGroup } from "../ui/CollapsibleGroup";

export interface InstructionCalloutProps {
  label: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: ReactNode;
}

/**
 * Collapsible "how to use this" callout.
 *
 * This was a 160-line second implementation of `CollapsibleGroup` — its own
 * `CollapsibleRoot`/`Trigger`/`Content`, its own chevron, its own copy of the
 * enter/exit animation string. Its docblock justified the fork with four
 * capabilities `CollapsibleGroup` lacks: optional controlled state
 * (`isOpen`/`onToggle`), a `trigger="external"` mode, a caller-supplied
 * `contentId`, and an `icon` slot.
 *
 * Three of the four had **no consumers**. `trigger`, `isOpen`, `onToggle` and
 * `contentId` were exercised only by the stories written to document them; all
 * five real call sites (`DebugPanel` ×4, `ExportDialog` ×1) pass nothing but
 * `label`, `summary`, `icon` and children. So rather than widen
 * `CollapsibleGroup` to absorb them, they are deleted.
 *
 * `size` was worse than unused — it was read at exactly one place, inside the
 * `trigger="external"` branch, choosing `p-3` over `p-4`. Every real call site
 * passed `size="compact"` and none of them ever got anything for it.
 *
 * That leaves `icon`, which was real, so it moved to `CollapsibleGroup` where
 * both components can use it. This file is now a rename with a content wrapper —
 * the same shape `SidebarSection` already had, and the reason the callouts now
 * look like every other collapsible section in the app instead of almost like
 * them.
 *
 * The one thing genuinely lost: `trigger="external"` rendered a `<section>` with
 * no trigger at all — a static accent-tinted box, not a collapsible. If that
 * affordance is ever wanted it should come back as its own component rather than
 * as a mode of this one, because nothing about it collapses.
 */
export function InstructionCallout({
  label,
  summary,
  children,
  defaultOpen = false,
  icon,
}: InstructionCalloutProps) {
  return (
    <CollapsibleGroup
      title={label}
      subtitle={summary}
      defaultCollapsed={!defaultOpen}
      icon={icon}
    >
      <div className="text-[11px] text-text-secondary leading-relaxed space-y-2 max-w-none">
        {children}
      </div>
    </CollapsibleGroup>
  );
}
