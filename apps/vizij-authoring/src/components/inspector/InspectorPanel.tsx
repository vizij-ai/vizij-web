import { Panel } from "../ui/Panel";
import { InspectorContent } from "./InspectorContent";

export function InspectorPanel() {
  return (
    <Panel
      title="Inspector"
      description="View and edit selected object properties."
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
    >
      <InspectorContent />
    </Panel>
  );
}
