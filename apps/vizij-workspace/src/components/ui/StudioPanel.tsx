import * as React from "react";
import { cn } from "../../utils/cn";
import { Panel } from "./Panel";

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
        <Panel
            title={title}
            actions={actions}
            className={cn("flex-1 min-h-0 border-none bg-transparent shadow-none p-0", className)}
        >
            <div
                className={cn(
                    "flex-1 min-h-0",
                    scrollable ? "overflow-y-auto custom-scrollbar" : "overflow-hidden",
                )}
            >
                <div className="p-1 h-full">{children}</div>
            </div>
        </Panel>
    );
}
