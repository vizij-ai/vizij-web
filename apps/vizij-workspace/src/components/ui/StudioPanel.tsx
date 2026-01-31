import * as React from "react";
import { cn } from "../../utils/cn";

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
        <div
            className={cn("flex h-full min-h-0 flex-col bg-slate-900", className)}
        >
            <header className="flex min-h-[36px] shrink-0 items-center justify-between border-b border-slate-800 px-3 py-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-100">
                    {title}
                </h2>
                {actions && <div className="flex items-center gap-2">{actions}</div>}
            </header>
            <div
                className={cn(
                    "flex-1 min-h-0",
                    scrollable ? "overflow-y-auto" : "overflow-hidden",
                )}
            >
                <div className="p-3">{children}</div>
            </div>
        </div>
    );
}
