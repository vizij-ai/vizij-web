import * as React from "react";
import {
    Panel,
    Group,
    Separator
} from "react-resizable-panels";
import { cn } from "../utils/cn";

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
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-slate-200">
            {/* MenuBar */}
            {menuBar && (
                <div className="h-10 border-b border-border flex items-center px-4 bg-slate-900 shrink-0">
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
                                    {leftTopVisible && (
                                        <Panel defaultSize={leftBottomVisible ? 50 : 100} minSize={5} id="left-top">
                                            <div className="h-full border-r border-border bg-slate-900 overflow-y-auto overflow-x-hidden">
                                                {leftTopPanel}
                                            </div>
                                        </Panel>
                                    )}

                                    {leftTopVisible && leftBottomVisible && <Separator className="h-1 bg-background hover:bg-blue-600 transition-colors" />}

                                    {leftBottomVisible && (
                                        <Panel defaultSize={leftTopVisible ? 50 : 100} minSize={5} id="left-bottom">
                                            <div className="h-full border-r border-border bg-slate-900 overflow-y-auto overflow-x-hidden">
                                                {leftBottomPanel}
                                            </div>
                                        </Panel>
                                    )}
                                </Group>
                            </Panel>
                            <Separator className="w-1 bg-background hover:bg-blue-600 transition-colors" />
                        </>
                    )}

                    {/* Center + Bottom Group */}
                    <Panel defaultSize={60} minSize={5} id="center-group">
                        <Group orientation="vertical">

                            {/* Top Toolbar Area */}
                            {topPanel && (
                                <div className="bg-background border-b border-border">
                                    {topPanel}
                                </div>
                            )}

                            {/* Main Viewport */}
                            <Panel defaultSize={bottomVisible ? 55 : 100} minSize={5} id="viewport">
                                <div className="h-full bg-background relative w-full">
                                    {viewport}
                                </div>
                            </Panel>

                            {bottomVisible && (
                                <>
                                    <Separator className="h-1 bg-background hover:bg-blue-600 transition-colors" />
                                    {/* Bottom Timeline */}
                                    <Panel defaultSize={30} minSize={5} collapsible id="bottom-panel">
                                        <div className="h-full border-t border-border bg-slate-900 overflow-auto">
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
                            <Separator className="w-1 bg-background hover:bg-blue-600 transition-colors" />
                            <Panel defaultSize={20} minSize={5} collapsible id="right-sidebar">
                                <Group orientation="vertical">
                                    {rightTopVisible && (
                                        <Panel defaultSize={rightBottomVisible ? 60 : 100} minSize={5} id="right-top">
                                            <div className="h-full border-l border-border bg-slate-900 overflow-y-auto overflow-x-hidden">
                                                {rightTopPanel}
                                            </div>
                                        </Panel>
                                    )}

                                    {rightTopVisible && rightBottomVisible && <Separator className="h-1 bg-background hover:bg-blue-600 transition-colors" />}

                                    {rightBottomVisible && (
                                        <Panel defaultSize={rightTopVisible ? 40 : 100} minSize={5} id="right-bottom">
                                            <div className="h-full border-l border-border bg-slate-900 overflow-y-auto overflow-x-hidden">
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
