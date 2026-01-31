import * as React from "react";
// We'll use CSS classes for now, assuming standard styles.css is active
import { cn } from "../../utils/cn"; // We need to re-create this since I deleted it

interface StudioPanelProps {
    title: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    scrollable?: boolean;
}

export function StudioPanel({
    title,
    actions,
    children,
    className,
    scrollable = true,
}: StudioPanelProps) {
    return (
        <div className={cn("flex flex-col h-full min-h-0 bg-[var(--bg-panel)]", className)}>
            <header className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] shrink-0 min-h-[36px]">
                <h2 className="text-xs font-semibold text-[var(--color-slate-100)] uppercase tracking-wide">
                    {title}
                </h2>
                {actions && <div className="flex items-center gap-2">{actions}</div>}
            </header>
            <div className={cn("flex-1 min-h-0", scrollable ? "overflow-y-auto" : "overflow-hidden")}>
                <div className="p-3">
                    {children}
                </div>
            </div>
        </div>
    );
}
