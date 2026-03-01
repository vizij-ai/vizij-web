import { useState } from "react";
import { MotionGraphPanel } from "../../motiongraph/MotionGraphPanel";
import { AnimationPanel } from "./AnimationPanel";

interface BottomPanelContainerProps {
  showTimeline: boolean;
  showMotionGraph: boolean;
  rigInputPaths: string[];
}

export function BottomPanelContainer({
  showTimeline,
  showMotionGraph,
  rigInputPaths: _rigInputPaths,
}: BottomPanelContainerProps) {
  // If only one is visible, show it directly
  if (showTimeline && !showMotionGraph) return <AnimationPanel />;
  if (showMotionGraph && !showTimeline) return <MotionGraphPanel />;

  // Both visible: use tabs
  return <TabbedBottomPanel />;
}

function TabbedBottomPanel() {
  const [activeTab, setActiveTab] = useState<"timeline" | "motiongraph">(
    "motiongraph",
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-border-default bg-bg-panel/50 shrink-0">
        <TabButton
          active={activeTab === "timeline"}
          onClick={() => setActiveTab("timeline")}
        >
          Timeline
        </TabButton>
        <TabButton
          active={activeTab === "motiongraph"}
          onClick={() => setActiveTab("motiongraph")}
        >
          MotionGraph
        </TabButton>
      </div>
      <div className="flex-1 min-h-0">
        {activeTab === "timeline" ? <AnimationPanel /> : <MotionGraphPanel />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "text-text-primary border-b-2 border-blue-500 bg-bg-panel"
          : "text-text-muted hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}
