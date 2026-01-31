import React from "react";
import { StudioPanel } from "../ui/StudioPanel";

export function VariablesPanel() {
    // Mock data for now
    const variables = [
        { name: "MyVar_01", type: "Float", value: 1.0 },
        { name: "OpacityGlobal", type: "Float", value: 0.8 },
        { name: "BaseColor", type: "Color", value: "#FF0000" },
    ];

    return (
        <StudioPanel title="Variables">
            <div className="flex flex-col gap-2">
                {variables.map((v) => (
                    <div key={v.name} className="flex items-center justify-between p-2 bg-slate-900 rounded border border-slate-800 text-xs">
                        <span className="font-mono">{v.name}</span>
                        <span className="text-slate-500">{v.value}</span>
                    </div>
                ))}
                <button className="mt-2 text-xs text-blue-400 hover:text-blue-300 text-left">
                    + Add Variable
                </button>
            </div>
        </StudioPanel>
    );
}
