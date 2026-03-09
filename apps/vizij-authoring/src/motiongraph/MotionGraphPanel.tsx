import {
  ArrowLeftRight,
  ArrowUpDown,
  Pause,
  Play,
  Square,
  X,
} from "lucide-react";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { useGraphRuntime } from "../state/RigControllerProvider";
import EditorCanvas from "./components/EditorCanvas";
import NodePalette from "./components/NodePalette";
import "./motiongraph.css";

interface MotionGraphPanelProps {
  onSelectNode?: (id: string | null) => void;
  splitVertical?: boolean;
  onToggleSplit?: () => void;
  onClosePanel?: () => void;
}

export function MotionGraphPanel({
  onSelectNode,
  splitVertical,
  onToggleSplit,
  onClosePanel,
}: MotionGraphPanelProps) {
  const graphPlaybackState = useGraphRuntime(
    (state) => state.graphPlaybackState,
  );
  const graphPlaybackAvailable = useGraphRuntime(
    (state) => state.graphPlaybackAvailable,
  );
  const playGraph = useGraphRuntime((state) => state.playGraph);
  const pauseGraph = useGraphRuntime((state) => state.pauseGraph);
  const stopGraph = useGraphRuntime((state) => state.stopGraph);

  const actions = (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-lg border border-border-default/70 bg-bg-panel/80 p-0.5 shadow-sm">
        <Button
          variant={graphPlaybackState === "playing" ? "primary" : "ghost"}
          size="sm"
          className="h-7 w-7 p-0"
          onClick={playGraph}
          disabled={!graphPlaybackAvailable || graphPlaybackState === "playing"}
          title="Play program"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
        </Button>
        <Button
          variant={graphPlaybackState === "paused" ? "primary" : "ghost"}
          size="sm"
          className="h-7 w-7 p-0"
          onClick={pauseGraph}
          disabled={!graphPlaybackAvailable || graphPlaybackState === "paused"}
          title="Pause program"
        >
          <Pause className="h-3.5 w-3.5 fill-current" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={stopGraph}
          disabled={!graphPlaybackAvailable}
          title="Stop program"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </Button>
      </div>
      {onToggleSplit ? (
        <Button
          variant="subtle"
          size="sm"
          className="h-9 px-3 text-sm font-semibold text-text-primary border border-border-default/70 bg-bg-panel/80 hover:bg-bg-hover"
          onClick={onToggleSplit}
          title={
            splitVertical
              ? "Switch to horizontal split"
              : "Switch to vertical split"
          }
        >
          {splitVertical ? (
            <ArrowLeftRight className="mr-1.5 h-4 w-4" />
          ) : (
            <ArrowUpDown className="mr-1.5 h-4 w-4" />
          )}
          {splitVertical ? "Horizontal Split" : "Vertical Split"}
        </Button>
      ) : null}
      {onClosePanel ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-text-secondary hover:text-text-primary"
          onClick={onClosePanel}
          title="Hide panel"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
  return (
    <Panel
      title="Program"
      description="Author procedural animation programs in the workspace canvas."
      className="h-full min-h-0 border-none bg-transparent shadow-none p-0"
      actions={actions}
    >
      <div
        data-testid="motiongraph-panel"
        className="h-full min-h-0 rounded border border-border-default/60 bg-bg-panel/40 overflow-hidden"
      >
        <EditorCanvas onSelectNode={onSelectNode} />
      </div>
    </Panel>
  );
}

export function MotionGraphPalettePanel({
  onClosePanel,
}: {
  onClosePanel?: () => void;
}) {
  return (
    <Panel
      title="Node Palette"
      description="Drag graph nodes into the active program."
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
      actions={
        onClosePanel ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-text-secondary hover:text-text-primary"
            onClick={onClosePanel}
            title="Hide panel"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null
      }
    >
      <div
        data-testid="motiongraph-palette-panel"
        className="h-full min-h-0 rounded border border-border-default/60 bg-bg-panel/40 overflow-hidden"
      >
        <NodePalette />
      </div>
    </Panel>
  );
}
