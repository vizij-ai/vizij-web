import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronRightIcon } from "@radix-ui/react-icons";
import { cn } from "../../utils/cn";
import "./MenuBar.css"; // We will add specific styles for menu

interface MenuBarProps {
    children: React.ReactNode;
    className?: string;
}

export function MenuBar({ children, className }: MenuBarProps) {
    return (
        <div className={cn("menubar-root", className)}>
            {children}
        </div>
    );
}

interface MenuProps {
    label: string;
    children: React.ReactNode;
}

export function Menu({ label, children }: MenuProps) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button className="menubar-trigger">{label}</button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content className="menubar-content" sideOffset={5} align="start">
                    {children}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}

export function MenuItem({ children, onSelect, disabled }: { children: React.ReactNode, onSelect?: () => void, disabled?: boolean }) {
    return (
        <DropdownMenu.Item className="menubar-item" onSelect={onSelect} disabled={disabled}>
            {children}
        </DropdownMenu.Item>
    );
}

export function MenuSeparator() {
    return <DropdownMenu.Separator className="menubar-separator" />
}

export function MenuCheckboxItem({ children, checked, onCheckedChange }: { children: React.ReactNode, checked: boolean, onCheckedChange: (checked: boolean) => void }) {
    return (
        <DropdownMenu.CheckboxItem className="menubar-item" checked={checked} onCheckedChange={onCheckedChange}>
            <DropdownMenu.ItemIndicator className="menubar-item-indicator">
                ✓
            </DropdownMenu.ItemIndicator>
            <span style={{ marginLeft: 20 }}>{children}</span>
        </DropdownMenu.CheckboxItem>
    );
}

