import * as React from "react";
import {
    Panel,
    Group,
    Separator
} from "react-resizable-panels";
import "./WorkspaceLayout.css";

interface WorkspaceLayoutProps {
    leftSidebar?: React.ReactNode;
    rightSidebar?: React.ReactNode;
    bottomPanel?: React.ReactNode;
    children: React.ReactNode;
}

export function WorkspaceLayout({
    leftSidebar,
    rightSidebar,
    bottomPanel,
    children,
}: WorkspaceLayoutProps) {
    return (
        <div className="workspace-layout">
            {/* MenuBar Placeholder */}
            <header className="workspace-header">
                <span className="workspace-title">Vizij Workspace</span>
            </header>

            <div className="workspace-body">
                <Group orientation="horizontal">


                    {/* Left Sidebar */}
                    <Panel defaultSize={20} minSize={10} maxSize={40} collapsible id="left-sidebar">
                        <div className="workspace-sidebar-left">
                            {leftSidebar}
                        </div>
                    </Panel>

                    <Separator className="resize-handle-vertical" />

                    {/* Center + Bottom Group */}
                    <Panel defaultSize={60} id="center-group">
                        <Group orientation="vertical">


                            {/* Main Viewport */}
                            <Panel defaultSize={70} id="viewport">
                                <div className="workspace-viewport">
                                    {children}
                                </div>
                            </Panel>

                            <Separator className="resize-handle-horizontal" />

                            {/* Bottom Timeline */}
                            <Panel defaultSize={30} maxSize={80} collapsible id="bottom-panel">
                                <div className="workspace-bottom-panel">
                                    {bottomPanel}
                                </div>
                            </Panel>

                        </Group>
                    </Panel>

                    <Separator className="resize-handle-vertical" />

                    {/* Right Sidebar */}
                    <Panel defaultSize={20} minSize={15} maxSize={40} collapsible id="right-sidebar">
                        <div className="workspace-sidebar-right">
                            {rightSidebar}
                        </div>
                    </Panel>

                </Group>
            </div>
        </div>
    );
}
