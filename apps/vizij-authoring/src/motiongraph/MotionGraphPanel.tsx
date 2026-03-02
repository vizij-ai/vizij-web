import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import EditorCanvas from "./components/EditorCanvas";
import NodePalette from "./components/NodePalette";
import "./motiongraph.css";

interface MotionGraphPanelProps {
  onSelectNode?: (id: string | null) => void;
  splitVertical?: boolean;
  onToggleSplit?: () => void;
}

export function MotionGraphPanel({
  onSelectNode,
  splitVertical,
  onToggleSplit,
}: MotionGraphPanelProps) {
  const actions = onToggleSplit ? (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs font-mono text-text-muted hover:text-text-primary"
      onClick={onToggleSplit}
      title={
        splitVertical
          ? "Switch to horizontal split"
          : "Switch to vertical split"
      }
    >
      {splitVertical ? "⬌" : "⬍"}
    </Button>
  ) : null;
  return (
    <Panel
      title="Procedural Animation Programming"
      description="Author procedural animation signal flows in the workspace canvas."
      className="h-full min-h-0 border-none bg-transparent shadow-none p-0"
      actions={actions}
    >
      <div className="h-full min-h-0 rounded border border-border-default/60 bg-bg-panel/40 overflow-hidden">
        <EditorCanvas onSelectNode={onSelectNode} />
      </div>
    </Panel>
  );
}

export function MotionGraphPalettePanel() {
  return (
    <Panel
      title="Procedural Animation Programming Palette"
      description="Drag graph nodes into the center procedural animation canvas."
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
    >
      <div className="h-full min-h-0 rounded border border-border-default/60 bg-bg-panel/40 overflow-hidden">
        <NodePalette />
      </div>
    </Panel>
  );
}
