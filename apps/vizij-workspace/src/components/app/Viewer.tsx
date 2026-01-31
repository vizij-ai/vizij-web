import { useCallback, useId, useMemo, useState } from "react";
import { Vizij } from "@vizij/render";
import { Button, Switch, Chip } from "../ui";

export interface ViewerProps {
  rootId: string | null;
  namespace: string;
  onClearSelection: () => void;
  showSelectionGlow: boolean;
  onImportClick: () => void;
  onLoadQuori: () => void;
  onLoadHugo: () => void;
}

export function Viewer({
  rootId,
  namespace,
  onClearSelection,
  showSelectionGlow,
  onImportClick,
  onLoadQuori,
  onLoadHugo,
}: ViewerProps) {
  return (
    <main className="viewer h-full w-full relative">
      <div className="viewer__canvas h-full w-full">
        {rootId ? (
          <Vizij
            rootId={rootId}
            namespace={namespace}
            showSafeArea={false}
            showSelectionGlow={showSelectionGlow}
            onPointerMissed={(event) => {
              if (event.button === 0) {
                onClearSelection();
              }
            }}
          />
        ) : (
          <div className="viewer__placeholder flex flex-col items-center justify-center h-full text-slate-500 gap-4">
            <p className="mb-2 text-center">Load a Vizij asset to begin.</p>
            <div className="flex gap-4">
              <Button onClick={onImportClick}>Import File</Button>
              <Button variant="secondary" onClick={onLoadQuori}>Load Quori</Button>
              <Button variant="secondary" onClick={onLoadHugo}>Load Hugo</Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}


function formatGraphClock(value: number): string {
  if (!Number.isFinite(value)) {
    return "00:00.00";
  }
  const seconds = Math.max(value, 0);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${minutes.toString().padStart(2, "0")}:${remaining
    .toFixed(2)
    .padStart(5, "0")}`;
}
