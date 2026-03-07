import * as React from "react";
import { Panel, Group, Separator } from "react-resizable-panels";

// We'll pass the store logic from App.tsx via props or composition
// For this layout, we'll keep it flexible

interface WorkspaceLayoutProps {
  // Top Level
  menuBar?: React.ReactNode;

  // Left Sidebar
  leftTopPanel?: React.ReactNode;
  leftMiddlePanel?: React.ReactNode;
  leftBottomPanel?: React.ReactNode;
  leftTopVisible?: boolean;
  leftMiddleVisible?: boolean;
  leftBottomVisible?: boolean;
  leftBottomVisible2?: boolean;
  leftBottomPanel2?: React.ReactNode;
  leftBottomVisible3?: boolean;
  leftBottomPanel3?: React.ReactNode;

  // Center
  topPanel?: React.ReactNode; // Toolbar
  viewport: React.ReactNode;
  bottomPanel?: React.ReactNode; // Timeline
  bottomVisible?: boolean;

  // Right Sidebar
  rightTopPanel?: React.ReactNode;
  rightMiddlePanel?: React.ReactNode;
  rightBottomPanel?: React.ReactNode;
  rightTopVisible?: boolean;
  rightMiddleVisible?: boolean;
  rightBottomVisible?: boolean;
}

export function WorkspaceLayout({
  menuBar,
  leftTopPanel,
  leftMiddlePanel,
  leftBottomPanel,
  leftTopVisible = true,
  leftMiddleVisible = false,
  leftBottomVisible = true,
  leftBottomVisible2 = false,
  leftBottomPanel2,
  leftBottomVisible3 = false,
  leftBottomPanel3,
  topPanel,
  viewport,
  bottomPanel,
  bottomVisible = true,
  rightTopPanel,
  rightMiddlePanel: _rightMiddlePanel,
  rightBottomPanel,
  rightTopVisible = true,
  rightMiddleVisible = false,
  rightBottomVisible = false,
}: WorkspaceLayoutProps) {
  const leftSidebarVisible =
    leftTopVisible ||
    leftMiddleVisible ||
    leftBottomVisible ||
    Boolean(leftBottomVisible2) ||
    Boolean(leftBottomVisible3);
  const extendedLeftSections = [
    { id: "left-top", visible: leftTopVisible, panel: leftTopPanel },
    { id: "left-middle", visible: leftMiddleVisible, panel: leftMiddlePanel },
    { id: "left-bottom", visible: leftBottomVisible, panel: leftBottomPanel },
    {
      id: "left-bottom-2",
      visible: leftBottomVisible2,
      panel: leftBottomPanel2,
    },
    {
      id: "left-bottom-3",
      visible: leftBottomVisible3,
      panel: leftBottomPanel3,
    },
  ].reduce<Array<{ id: string; panel: React.ReactNode }>>((acc, section) => {
    if (section.visible && section.panel) {
      acc.push({ id: section.id, panel: section.panel });
    }
    return acc;
  }, []);
  const rightSidebarVisible =
    rightTopVisible || rightMiddleVisible || rightBottomVisible;
  const leftSectionCount = extendedLeftSections.length;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bg-app text-text-primary">
      {/* MenuBar */}
      {menuBar && (
        <div className="h-10 border-b border-border-default flex items-center px-1 bg-bg-panel shrink-0">
          {menuBar}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <Group orientation="horizontal">
          {/* Left Sidebar */}
          {leftSidebarVisible && (
            <>
              <Panel defaultSize={20} minSize={5} collapsible id="left-sidebar">
                <Group orientation="vertical">
                  {extendedLeftSections.length > 0 && (
                    <>
                      {extendedLeftSections.map((section, index) => {
                        const size =
                          leftSectionCount > 0 ? 100 / leftSectionCount : 100;
                        return (
                          <React.Fragment key={section.id}>
                            <Panel
                              defaultSize={size}
                              minSize={5}
                              id={section.id}
                            >
                              <div className="h-full min-h-0 border-r border-border-default bg-bg-panel/50 backdrop-blur-sm overflow-hidden overflow-x-hidden animate-slide-in flex flex-col">
                                <div className="h-full min-h-0 flex flex-col">
                                  {section.panel}
                                </div>
                              </div>
                            </Panel>
                            {index + 1 < extendedLeftSections.length ? (
                              <Separator className="h-1 bg-border-default hover:bg-border-hover transition-colors" />
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}
                </Group>
              </Panel>
              <Separator className="w-1 bg-border-default hover:bg-border-hover transition-colors" />
            </>
          )}

          {/* Center + Bottom Group */}
          <Panel defaultSize={60} minSize={5} id="center-group">
            <Group orientation="vertical">
              {/* Top Toolbar Area */}
              {topPanel && (
                <div className="bg-bg-app border-b border-border-default">
                  {topPanel}
                </div>
              )}

              {/* Main Viewport */}
              <Panel
                defaultSize={bottomVisible ? 55 : 100}
                minSize={5}
                id="viewport"
              >
                <div className="h-full bg-bg-app relative w-full">
                  {viewport}
                </div>
              </Panel>

              {bottomVisible && (
                <>
                  <Separator className="h-1 bg-border-default hover:bg-border-hover transition-colors" />
                  {/* Bottom Timeline */}
                  <Panel
                    defaultSize={30}
                    minSize={5}
                    collapsible
                    id="bottom-panel"
                  >
                    <div className="h-full border-t border-border-default bg-bg-panel overflow-auto">
                      {bottomPanel}
                    </div>
                  </Panel>
                </>
              )}
            </Group>
          </Panel>

          {/* Right Sidebar */}
          {rightSidebarVisible && (
            <>
              <Separator className="w-1 bg-border-default hover:bg-border-hover transition-colors" />
              <Panel
                defaultSize={20}
                minSize={5}
                collapsible
                id="right-sidebar"
              >
                <Group orientation="vertical">
                  {rightTopVisible && (
                    <Panel
                      defaultSize={rightBottomVisible ? 28 : 100}
                      minSize={12}
                      id="right-top"
                    >
                      <div className="h-full border-l border-border-default bg-bg-panel/50 backdrop-blur-sm overflow-y-auto overflow-x-hidden animate-slide-in">
                        {rightTopPanel}
                      </div>
                    </Panel>
                  )}

                  {rightTopVisible && rightBottomVisible && (
                    <Separator className="h-1 bg-border-default hover:bg-border-hover transition-colors" />
                  )}

                  {rightBottomVisible && (
                    <Panel
                      defaultSize={rightTopVisible ? 72 : 100}
                      minSize={5}
                      id="right-bottom"
                    >
                      <div className="h-full border-l border-border-default bg-bg-panel overflow-y-auto overflow-x-hidden">
                        {rightBottomPanel}
                      </div>
                    </Panel>
                  )}
                </Group>
              </Panel>
            </>
          )}
        </Group>
      </div>
    </div>
  );
}
