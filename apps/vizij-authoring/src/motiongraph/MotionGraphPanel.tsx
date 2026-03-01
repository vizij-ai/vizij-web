import { Panel } from "../components/ui/Panel";
import EditorCanvas from "./components/EditorCanvas";
import NodePalette from "./components/NodePalette";
import "./motiongraph.css";

interface MotionGraphPanelProps {
  onSelectNode?: (id: string | null) => void;
}

export function MotionGraphPanel({ onSelectNode }: MotionGraphPanelProps) {
  return (
    <Panel
      title="MotionGraph"
      description="Author node-graph signal flows in the workspace canvas."
      className="h-full min-h-0 border-none bg-transparent shadow-none p-0"
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
      title="MotionGraph Palette"
      description="Drag graph nodes into the center MotionGraph canvas."
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
    >
      <div className="h-full min-h-0 rounded border border-border-default/60 bg-bg-panel/40 overflow-hidden">
        <NodePalette />
      </div>
    </Panel>
  );
}
