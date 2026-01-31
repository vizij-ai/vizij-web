import React from "react";
import { StudioPanel } from "../ui/StudioPanel";
import { WorkbenchNav } from "../app/WorkbenchNav";
// Note: In the future we will likely move the WorkbenchNav logic 
// into a proper Tree/Hierarchy component, but for now we reuse it.

interface TreePanelProps {
    children: React.ReactNode;
}

export function TreePanel({ children }: TreePanelProps) {
    return (
        <StudioPanel title="Explorer">
            {children}
        </StudioPanel>
    );
}
