import { Tabs } from "../ui";
import type { RiggingTab } from "../../state/AuthoringUiProvider";

export interface RiggingTabsProps {
  activeTab: RiggingTab;
  onSelect: (tab: RiggingTab) => void;
}

export function RiggingTabs({ activeTab, onSelect }: RiggingTabsProps) {
  const items = [
    { id: "rigging", label: "Rig Editing" },
    { id: "face", label: "Face Editing" },
  ] as const;

  return (
    <Tabs
      items={items}
      value={activeTab}
      onValueChange={(id) => onSelect(id as RiggingTab)}
      renderPanel={() => null}
      size="sm"
      variant="pill"
      panelClassName="tabs__panel--no-content"
    />
  );
}
