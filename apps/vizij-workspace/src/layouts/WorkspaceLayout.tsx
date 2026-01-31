import * as React from "react";
import {
    Panel,
    Group,
    Separator
} from "react-resizable-panels";
import { MenuBar, Menu, MenuItem, MenuSeparator, MenuCheckboxItem } from "../components/ui/MenuBar";
import "./WorkspaceLayout.css";
// We'll pass the store logic from App.tsx via props or composition
// For this layout, we'll keep it flexible

interface WorkspaceLayoutProps {
    // Top Level
    menuBar?: React.ReactNode;

    // Left Sidebar
    leftTopPanel?: React.ReactNode;
    leftBottomPanel?: React.ReactNode;
    leftTopVisible?: boolean;
    leftBottomVisible?: boolean;

    // Center
    topPanel?: React.ReactNode; // Toolbar
    viewport: React.ReactNode;
    bottomPanel?: React.ReactNode; // Timeline
    bottomVisible?: boolean;

    // Right Sidebar
    rightTopPanel?: React.ReactNode;
    rightBottomPanel?: React.ReactNode;
    rightTopVisible?: boolean;
    rightBottomVisible?: boolean;
}

export function WorkspaceLayout({
    menuBar,
    leftTopPanel,
    leftBottomPanel,
    leftTopVisible = true,
    leftBottomVisible = true,
    topPanel,
    viewport,
    bottomPanel,
    bottomVisible = true,
    rightTopPanel,
    rightBottomPanel,
    rightTopVisible = true,
    rightBottomVisible = false,
}: WorkspaceLayoutProps) {

    const leftSidebarVisible = leftTopVisible || leftBottomVisible;
    const rightSidebarVisible = rightTopVisible || rightBottomVisible;

    return (
        <div className="workspace-layout">
            {/* MenuBar */}
            {menuBar && (
                <div className="workspace-menubar-area">
                    {menuBar}
                </div>
            )}

            <div className="workspace-body">
                <Group orientation="horizontal">

                    {/* Left Sidebar */}
                    {leftSidebarVisible && (
                        <>
                            <Panel defaultSize={20} minSize={5} collapsible id="left-sidebar">
                                <Group orientation="vertical">
                                    {leftTopVisible && (
                                        <Panel defaultSize={leftBottomVisible ? 50 : 100} minSize={5} id="left-top">
                                            <div className="workspace-sidebar-left border-b border-[var(--border-subtle)]">
                                                {leftTopPanel}
                                            </div>
                                        </Panel>
                                    )}

                                    {leftTopVisible && leftBottomVisible && <Separator className="resize-handle-horizontal" />}

                                    {leftBottomVisible && (
                                        <Panel defaultSize={leftTopVisible ? 50 : 100} minSize={5} id="left-bottom">
                                            <div className="workspace-sidebar-left">
                                                {leftBottomPanel}
                                            </div>
                                        </Panel>
                                    )}
                                </Group>
                            </Panel>
                            <Separator className="resize-handle-vertical" />
                        </>
                    )}

                    {/* Center + Bottom Group */}
                    <Panel defaultSize={60} minSize={5} id="center-group">
                        <Group orientation="vertical">

                            {/* Top Toolbar Area */}
                            {topPanel && (
                                <div className="workspace-toolbar-area bg-[var(--bg-app)] border-b border-[var(--border-default)]">
                                    {topPanel}
                                </div>
                            )}

                            {/* Main Viewport */}
                            <Panel defaultSize={bottomVisible ? 55 : 100} minSize={5} id="viewport">
                                <div className="workspace-viewport">
                                    {viewport}
                                </div>
                            </Panel>

                            {bottomVisible && (
                                <>
                                    <Separator className="resize-handle-horizontal" />
                                    {/* Bottom Timeline */}
                                    <Panel defaultSize={30} minSize={5} collapsible id="bottom-panel">
                                        <div className="workspace-bottom-panel">
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
                            <Separator className="resize-handle-vertical" />
                            <Panel defaultSize={20} minSize={5} collapsible id="right-sidebar">
                                <Group orientation="vertical">
                                    {rightTopVisible && (
                                        <Panel defaultSize={rightBottomVisible ? 60 : 100} minSize={5} id="right-top">
                                            <div className="workspace-sidebar-right border-b border-[var(--border-subtle)]">
                                                {rightTopPanel}
                                            </div>
                                        </Panel>
                                    )}

                                    {rightTopVisible && rightBottomVisible && <Separator className="resize-handle-horizontal" />}

                                    {rightBottomVisible && (
                                        <Panel defaultSize={rightTopVisible ? 40 : 100} minSize={5} id="right-bottom">
                                            <div className="workspace-sidebar-right">
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
