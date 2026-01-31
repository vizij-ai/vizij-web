import { Plus } from "lucide-react";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";

export function VariablesPanel() {
    // Mock data for now
    const variables = [
        { name: "MyVar_01", type: "Float", value: 1.0 },
        { name: "OpacityGlobal", type: "Float", value: 0.8 },
        { name: "BaseColor", type: "Color", value: "#FF0000" },
    ];

    const actions = (
        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-slate-200">
            <Plus className="h-4 w-4" />
        </Button>
    );

    return (
        <Panel
            title="Variables"
            className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
            actions={actions}
            badge={`${variables.length}`}
        >
            <div className="flex flex-col h-full gap-2 p-1 overflow-y-auto custom-scrollbar">
                {variables.map((v) => (
                    <div key={v.name} className="flex items-center justify-between px-3 py-2 bg-slate-900/40 rounded-lg border border-transparent hover:bg-slate-800/40 hover:border-slate-800 transition-all group cursor-default">
                        <div className="flex items-center gap-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 group-hover:bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.3)] transition-colors" />
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-bold text-slate-300 group-hover:text-slate-100 font-mono transition-colors">{v.name}</span>
                                <span className="text-[9px] text-slate-600 group-hover:text-slate-500 font-mono uppercase tracking-wider">{v.type}</span>
                            </div>
                        </div>
                        <span className="text-[11px] font-mono font-medium text-slate-400 bg-slate-950/50 px-2 py-0.5 rounded border border-slate-800 group-hover:border-slate-700 transition-colors">
                            {v.value}
                        </span>
                    </div>
                ))}

                {variables.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-24 text-slate-500 text-xs gap-2 border border-dashed border-slate-800/50 rounded-xl bg-slate-900/20 m-1">
                        <span>No variables defined</span>
                        <Button variant="secondary" size="sm" className="h-6 text-[10px]">Create Variable</Button>
                    </div>
                )}
            </div>
        </Panel>
    );
}
