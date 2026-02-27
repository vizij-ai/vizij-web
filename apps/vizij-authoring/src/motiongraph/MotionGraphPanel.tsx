import { useState } from "react";
import NodePalette from "./components/NodePalette";
import EditorCanvas from "./components/EditorCanvas";
import OutputSetsPanel from "./components/OutputSetsPanel";
import InputSetsPanel from "./components/InputSetsPanel";
import "./motiongraph.css";

interface MotionGraphPanelProps {
  rigInputPaths: string[];
}

export function MotionGraphPanel({ rigInputPaths }: MotionGraphPanelProps) {
  const [showPalette, setShowPalette] = useState(true);
  const [showInputs, setShowInputs] = useState(true);
  const [showOutputs, setShowOutputs] = useState(true);

  return (
    <div className="h-full w-full flex flex-col bg-neutral-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-neutral-800 border-b border-neutral-700 flex-shrink-0">
        <span className="text-sm font-semibold text-neutral-300 mr-2">
          MotionGraph
        </span>
        <ToggleButton
          label="Palette"
          active={showPalette}
          onClick={() => setShowPalette(!showPalette)}
        />
        <ToggleButton
          label="Inputs"
          active={showInputs}
          onClick={() => setShowInputs(!showInputs)}
        />
        <ToggleButton
          label="Outputs"
          active={showOutputs}
          onClick={() => setShowOutputs(!showOutputs)}
        />
      </div>

      {/* Content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Palette */}
        {showPalette && (
          <div className="w-64 flex-shrink-0 border-r border-neutral-700 overflow-hidden">
            <NodePalette />
          </div>
        )}

        {/* Inputs panel */}
        {showInputs && (
          <div className="w-56 flex-shrink-0 border-r border-neutral-700 overflow-hidden">
            <InputSetsPanel />
          </div>
        )}

        {/* Graph canvas */}
        <div className="flex-1 bg-neutral-950">
          <EditorCanvas />
        </div>

        {/* Outputs panel */}
        {showOutputs && (
          <div className="w-56 flex-shrink-0 border-l border-neutral-700 overflow-hidden">
            <OutputSetsPanel paths={rigInputPaths} />
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-sm rounded transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-neutral-700 text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}
