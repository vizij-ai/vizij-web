import * as React from "react";
import { Menu as BaseMenu } from "@base-ui/react";
import { Check } from "lucide-react";
import { cn } from "../../utils/cn";
import { Logo } from "./Logo";

interface MenuBarProps {
  children: React.ReactNode;
  className?: string;
}

export function MenuBar({ children, className }: MenuBarProps) {
  return (
    <div className={cn("flex w-full items-center gap-1", className)}>
      <Logo />
      <div className="w-px h-6 bg-border-default/60 mx-2" />
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
    <BaseMenu.Root>
      <BaseMenu.Trigger className="inline-flex justify-center gap-x-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent data-[popup-open]:bg-bg-active data-[popup-open]:text-text-primary cursor-pointer active:scale-95">
        {label}
      </BaseMenu.Trigger>

      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4} align="start">
          <BaseMenu.Popup className="z-50 min-w-[200px] rounded-xl border border-border-default bg-bg-card p-1 shadow-2xl shadow-black/50 ring-1 ring-black ring-opacity-5 focus:outline-none backdrop-blur-xl bg-opacity-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 origin-[var(--transform-origin)]">
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  disabled,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  return (
    <BaseMenu.Item
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center rounded-lg px-3 py-2 text-sm transition-all outline-none select-none",
        "data-[highlighted]:bg-bg-hover data-[highlighted]:text-text-primary",
        "text-text-secondary",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-[0.98]",
      )}
    >
      {children}
    </BaseMenu.Item>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border-default/60 mx-1" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-text-muted select-none">
      {children}
    </div>
  );
}

export function MenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
}: {
  children: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <BaseMenu.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={cn(
        "group relative flex w-full items-center rounded-lg py-2 pl-9 pr-3 text-sm transition-all cursor-pointer active:scale-[0.98] outline-none select-none",
        "data-[highlighted]:bg-bg-hover data-[highlighted]:text-text-primary",
        "text-text-secondary"
      )}
    >
      <BaseMenu.CheckboxItemIndicator className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </BaseMenu.CheckboxItemIndicator>
      {children}
    </BaseMenu.CheckboxItem>
  );
}
