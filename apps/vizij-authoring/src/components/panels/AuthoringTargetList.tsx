import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Copy,
  Film,
  Pause,
  Play,
  Plus,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Input } from "../ui/Input";
import { cn } from "../../utils/cn";

export type AuthoringTargetSource = "authored" | "imported";
export type AuthoringTargetRuntimeState = "playing" | "paused" | "stopped";

export interface AuthoringTargetItem {
  id: string;
  label: string;
  source: AuthoringTargetSource;
  selected?: boolean;
  meta?: string;
  runtimeState?: AuthoringTargetRuntimeState;
  /** A node, not a string: a live clock must subscribe for itself
   * rather than have its value threaded down through the owner's renders. */
  runtimeTimeLabel?: ReactNode;
}

interface AuthoringTargetListProps {
  emptyDescription: string;
  items: readonly AuthoringTargetItem[];
  kindLabel: string;
  onCreate: () => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onPause?: (id: string) => void;
  onPlay?: (id: string) => void;
  onSelect: (id: string) => void;
  onStop?: (id: string) => void;
}

type SourceFilter = "all" | AuthoringTargetSource;

const SOURCE_FILTERS: ReadonlyArray<{
  id: SourceFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "authored", label: "Authored" },
  { id: "imported", label: "Imported" },
];

export function AuthoringTargetList({
  emptyDescription,
  items,
  kindLabel,
  onCreate,
  onDelete,
  onDuplicate,
  onPause,
  onPlay,
  onSelect,
  onStop,
}: AuthoringTargetListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const selectedItem = useMemo(
    () => items.find((item) => item.selected) ?? null,
    [items],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (sourceFilter !== "all" && item.source !== sourceFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const searchable = [item.label, item.meta, item.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [items, searchQuery, sourceFilter]);
  const runtimeStateBadgeToneByState: Record<
    AuthoringTargetRuntimeState,
    "accent" | "info" | "muted"
  > = {
    playing: "accent",
    paused: "info",
    stopped: "muted",
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-1 px-1">
        <Button
          variant="secondary"
          size="sm"
          className="h-6 px-2 text-[10px] gap-1"
          onClick={onCreate}
          title={`Create a new ${kindLabel.toLowerCase()}`}
        >
          <Plus size={11} />
          {`New ${kindLabel}`}
        </Button>
        {onDuplicate ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => {
              if (selectedItem) {
                onDuplicate(selectedItem.id);
              }
            }}
            disabled={!selectedItem}
            title={
              selectedItem
                ? `Copy selected ${kindLabel.toLowerCase()}`
                : `Select a ${kindLabel.toLowerCase()} to copy`
            }
          >
            <Copy size={11} />
            Copy
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1 text-amber-300 hover:text-amber-200"
            onClick={() => {
              if (selectedItem) {
                onDelete(selectedItem.id);
              }
            }}
            disabled={!selectedItem}
            title={
              selectedItem
                ? `Delete selected ${kindLabel.toLowerCase()}`
                : `Select a ${kindLabel.toLowerCase()} to delete`
            }
          >
            <Trash2 size={11} />
            Delete
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2 px-1">
        <Input
          size="sm"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={`Search ${kindLabel.toLowerCase()}s...`}
          startContent={<Search className="h-3.5 w-3.5" />}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1 px-1">
        {SOURCE_FILTERS.map((filter) => (
          <Button
            key={filter.id}
            variant={sourceFilter === filter.id ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px] uppercase tracking-wider"
            onClick={() => setSourceFilter(filter.id)}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-1">
        {filteredItems.length === 0 ? (
          <EmptyState
            icon={Film}
            iconSize={20}
            title={`No ${kindLabel.toLowerCase()}s`}
            description={emptyDescription}
            className="h-full justify-center"
          />
        ) : (
          <div className="flex flex-col gap-2 pb-2">
            {filteredItems.map((item) => {
              const runtimeState = item.runtimeState ?? "stopped";
              const isRuntimeActive = runtimeState !== "stopped";
              // Play is offered whenever the row is not playing — stopped or
              // paused. Pausing used to swap Play for a *disabled* Pause,
              // which left no control to resume with.
              const isRuntimePlaying = runtimeState === "playing";
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group flex w-full scroll-mt-24 flex-col gap-2 rounded-lg border px-3 py-2.5 transition-colors",
                    item.selected
                      ? "border-accent/60 bg-accent/10"
                      : "border-border-default/70 bg-bg-panel/60 hover:border-border-hover hover:bg-bg-hover",
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full min-w-0 flex-1 cursor-pointer flex-col items-start justify-center text-left"
                    onClick={() => onSelect(item.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text-primary">
                        {item.label}
                      </span>
                      <Badge
                        tone={item.source === "authored" ? "accent" : "info"}
                      >
                        {item.source}
                      </Badge>
                      <Badge tone={runtimeStateBadgeToneByState[runtimeState]}>
                        {runtimeState}
                      </Badge>
                      {item.runtimeTimeLabel ? (
                        <Badge tone="muted">{item.runtimeTimeLabel}</Badge>
                      ) : null}
                    </div>
                    {item.meta ? (
                      <p className="truncate pt-1 font-mono text-[10px] text-text-secondary">
                        {item.meta}
                      </p>
                    ) : null}
                  </button>
                  <div className="flex w-full flex-wrap items-center gap-1">
                    {onPlay && !isRuntimePlaying ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(item.id);
                          onPlay(item.id);
                        }}
                        title={`Play ${kindLabel.toLowerCase()}`}
                      >
                        <Play className="h-3 w-3 fill-current" />
                        Play
                      </Button>
                    ) : null}
                    {onPause && isRuntimePlaying ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(item.id);
                          onPause(item.id);
                        }}
                        title={`Pause ${kindLabel.toLowerCase()}`}
                      >
                        <Pause className="h-3 w-3 fill-current" />
                        Pause
                      </Button>
                    ) : null}
                    {onStop && isRuntimeActive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(item.id);
                          onStop(item.id);
                        }}
                        title={`Stop ${kindLabel.toLowerCase()}`}
                      >
                        <Square className="h-3 w-3 fill-current" />
                        Stop
                      </Button>
                    ) : null}
                    {onDuplicate ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDuplicate(item.id);
                        }}
                        title={`Copy ${kindLabel.toLowerCase()}`}
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
                    ) : null}
                    {onDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1 text-amber-300 hover:text-amber-200"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(item.id);
                        }}
                        title={`Delete ${kindLabel.toLowerCase()}`}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
