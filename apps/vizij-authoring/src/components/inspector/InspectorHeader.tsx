import React, { useState, useEffect, useCallback } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Box, Folder, Zap, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";
import { Tooltip } from "../ui/Tooltip";

interface InspectorHeaderProps {
  name: string;
  path?: string;
  typeLabel: string;
  id: string;
  onNameChange: (name: string) => void;
  onPathChange?: (path: string) => void;
  nameEditable?: boolean;
  icon?: LucideIcon;
  actions?: ReactNode;
}

export function InspectorHeader({
  name,
  path,
  typeLabel,
  id,
  onNameChange,
  onPathChange,
  nameEditable = true,
  icon: CustomIcon,
  actions,
}: InspectorHeaderProps) {
  const [draftName, setDraftName] = useState(name);
  const [draftPath, setDraftPath] = useState(path ?? "");

  useEffect(() => {
    setDraftName(name);
  }, [name, id]);

  useEffect(() => {
    setDraftPath(path ?? "");
  }, [path, id]);

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

  const commitPath = useCallback(() => {
    if (!onPathChange) return;
    const trimmed = draftPath.trim();
    if (trimmed === (path ?? "")) {
      return;
    }
    onPathChange(trimmed);
  }, [draftPath, path, onPathChange]);

  const handleNameKeyDown = useCallback(
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

  const handlePathKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitPath();
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setDraftPath(path ?? "");
        event.currentTarget.blur();
      }
    },
    [commitPath, path],
  );

  const typeLower = typeLabel.toLowerCase();
  const isShape = typeLower === "shape";
  const isGroup = typeLower === "group" || typeLower === "folder";
  const isPose = typeLower === "pose";
  const isRig = typeLower === "rig";

  let Icon: LucideIcon = Box;
  let label = typeLabel;
  let iconClass = "text-accent";
  let bgClass = "bg-accent/10 border-accent/20";

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
    label = "Expression";
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
        <Tooltip content={label} side="right">
          <div
            className={cn(
              "flex items-center justify-center w-5 h-5 rounded-sm select-none shrink-0 border",
              bgClass,
              iconClass,
            )}
          >
            <Icon size={12} strokeWidth={2.5} />
          </div>
        </Tooltip>

        {/* Name & Path Container */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Path Input (if applicable) */}
          {onPathChange && (
            <div className="relative group/path min-w-0">
              <input
                type="text"
                value={draftPath}
                onChange={(e) => setDraftPath(e.target.value)}
                onBlur={commitPath}
                onKeyDown={handlePathKeyDown}
                className="w-full bg-transparent border border-transparent hover:border-border-default focus:border-accent/30 rounded px-1 py-0 text-[10px] font-medium text-text-secondary focus:text-text-primary focus:outline-none focus:bg-bg-input/30 transition-all placeholder-text-muted truncate"
                placeholder="Path/Group (optional)"
              />
            </div>
          )}

          {/* Name Input */}
          {nameEditable ? (
            <div className="relative group/name min-w-0">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitName}
                onKeyDown={handleNameKeyDown}
                className="w-full bg-transparent border border-transparent hover:border-border-default focus:border-accent/50 rounded px-1 py-0 text-xs font-semibold text-text-primary focus:outline-none focus:bg-bg-input/50 transition-all placeholder-text-muted truncate"
                placeholder="Name"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/name:opacity-30 pointer-events-none">
                <span className="text-[8px] text-text-muted">✎</span>
              </div>
            </div>
          ) : (
            <div
              className="rounded px-1 py-0 text-xs font-semibold text-text-primary truncate"
              title={name}
            >
              {name}
            </div>
          )}
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-1 ml-auto">{actions}</div>
        )}
      </div>

      {/* ID */}
      <div className="pl-[26px]">
        <div
          className="text-[9px] text-text-muted font-mono select-all truncate hover:text-text-secondary transition-colors cursor-text"
          title={`ID: ${id}`}
        >
          {id}
        </div>
      </div>
    </div>
  );
}
