import React, { useState, useEffect, useCallback } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Box, Folder, Zap, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

interface InspectorHeaderProps {
    name: string;
    typeLabel: string;
    id: string;
    onNameChange: (name: string) => void;
    icon?: LucideIcon;
    actions?: ReactNode;
}

export function InspectorHeader({ name, typeLabel, id, onNameChange, icon: CustomIcon, actions }: InspectorHeaderProps) {
    const [draftName, setDraftName] = useState(name);

    useEffect(() => {
        setDraftName(name);
    }, [name, id]);

    const commitName = useCallback(() => {
        const trimmed = draftName.trim();
        if (trimmed.length === 0) {
            setDraftName(name);
            return;
        }
        if (trimmed === name) {
            return;
        }
        onNameChange(trimmed);
    }, [draftName, name, onNameChange]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
                event.preventDefault();
                commitName();
                event.currentTarget.blur();
            } else if (event.key === "Escape") {
                event.preventDefault();
                setDraftName(name);
                event.currentTarget.blur();
            }
        },
        [commitName, name],
    );

    const typeLower = typeLabel.toLowerCase();
    const isShape = typeLower === 'shape';
    const isGroup = typeLower === 'group' || typeLower === 'folder';
    const isPose = typeLower === 'pose';
    const isRig = typeLower === 'rig';

    let Icon: LucideIcon = Box;
    let label = typeLabel;
    let iconClass = "text-blue-400";
    let bgClass = "bg-blue-500/10 border-blue-500/20";

    if (CustomIcon) {
        Icon = CustomIcon;
    } else if (isShape) {
        Icon = Box;
        label = "Shape";
    } else if (isGroup) {
        Icon = Folder;
        label = "Group";
    } else if (isPose) {
        Icon = Activity;
        label = "Pose";
        iconClass = "text-purple-400";
        bgClass = "bg-purple-500/10 border-purple-500/20";
    } else if (isRig) {
        Icon = Zap;
        label = "Rig";
        iconClass = "text-yellow-400";
        bgClass = "bg-yellow-500/10 border-yellow-500/20";
    }

    return (
        <div className="flex flex-col gap-0.5 mb-2 px-1">
            <div className="flex items-center gap-1.5">
                {/* Type Badge / Icon */}
                <div
                    className={cn(
                        "flex items-center justify-center w-5 h-5 rounded-sm select-none shrink-0 border",
                        bgClass,
                        iconClass
                    )}
                    title={label}
                >
                    <Icon size={12} strokeWidth={2.5} />
                </div>

                {/* Name Input */}
                <div className="relative flex-1 group min-w-0">
                    <input
                        type="text"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-transparent border border-transparent hover:border-slate-700 focus:border-blue-500/50 rounded px-1 py-0 text-xs font-semibold text-slate-200 focus:outline-none focus:bg-slate-900/50 transition-all placeholder-slate-600 truncate"
                        placeholder="Name"
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-30 pointer-events-none">
                        <span className="text-[8px] text-slate-400">✎</span>
                    </div>
                </div>

                {/* Actions */}
                {actions && (
                    <div className="flex items-center gap-1 ml-auto">
                        {actions}
                    </div>
                )}
            </div>

            {/* ID */}
            <div className="pl-[26px]">
                <div className="text-[9px] text-slate-600 font-mono select-all truncate hover:text-slate-500 transition-colors cursor-text" title={`ID: ${id}`}>
                    {id}
                </div>
            </div>
        </div>
    );
}
