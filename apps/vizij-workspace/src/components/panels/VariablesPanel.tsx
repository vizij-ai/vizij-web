import { Plus } from "lucide-react";
import { StudioPanel } from "../ui/StudioPanel";
import { Button } from "../ui/Button";

export function VariablesPanel() {
    // Mock data for now
    const variables = [
        { name: "MyVar_01", type: "Float", value: 1.0 },
        { name: "OpacityGlobal", type: "Float", value: 0.8 },
        { name: "BaseColor", type: "Color", value: "#FF0000" },
    ];

    const actions = (
        <Button variant="ghost" size="icon" className="h-6 w-6">
            <Plus className="h-4 w-4" />
        </Button>
    );

    return (
        <StudioPanel title="Variables" actions={actions}>
            <div className="flex flex-col gap-2">
                {variables.map((v) => (
                    <div key={v.name} className="flex items-center justify-between p-3 bg-slate-950/50 rounded-lg border border-slate-800/50 hover:border-slate-700 transition-colors group">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-slate-200 font-mono">{v.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono uppercase">{v.type}</span>
                        </div>
                        <span className="text-xs font-mono text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">
                            {v.value}
                        </span>
                    </div>
                ))}

                {variables.length === 0 && (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                        No variables defined.
                    </div>
                )}
            </div>
        </StudioPanel>
    );
}
