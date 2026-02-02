import * as React from "react";
import {
  Menu as HeadlessMenu,
  MenuButton,
  MenuItem as HeadlessMenuItem,
  MenuItems,
  Transition,
} from "@headlessui/react";
import { Check } from "lucide-react";
import { Fragment } from "react";
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
      <div className="w-px h-6 bg-slate-800/60 mx-2" />
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
    <HeadlessMenu as="div" className="relative inline-block text-left">
      <div>
        <MenuButton className="inline-flex w-full justify-center gap-x-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 data-[open]:bg-slate-800/80 data-[open]:text-slate-100 cursor-pointer active:scale-95">
          {label}
        </MenuButton>
      </div>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <MenuItems className="absolute left-0 z-50 mt-1 min-w-[200px] origin-top-left rounded-xl border border-slate-800 bg-slate-900 p-1 shadow-2xl shadow-black/50 ring-1 ring-black ring-opacity-5 focus:outline-none backdrop-blur-xl bg-opacity-95">
          {children}
        </MenuItems>
      </Transition>
    </HeadlessMenu>
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
    <HeadlessMenuItem disabled={disabled}>
      {({ focus, disabled: itemDisabled }) => (
        <button
          onClick={onSelect}
          disabled={itemDisabled}
          className={cn(
            "group flex w-full items-center rounded-lg px-3 py-2 text-sm transition-all",
            focus ? "bg-blue-600 text-white" : "text-slate-300",
            itemDisabled
              ? "opacity-50 cursor-not-allowed"
              : "cursor-pointer active:scale-[0.98]",
          )}
        >
          {children}
        </button>
      )}
    </HeadlessMenuItem>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-slate-800/60 mx-1" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-slate-500 select-none">
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
    <HeadlessMenuItem>
      {({ focus }) => (
        <button
          onClick={() => onCheckedChange(!checked)}
          className={cn(
            "group relative flex w-full items-center rounded-lg py-2 pl-9 pr-3 text-sm transition-all cursor-pointer active:scale-[0.98]",
            focus ? "bg-blue-600 text-white" : "text-slate-300",
          )}
        >
          <span className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center">
            {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
          {children}
        </button>
      )}
    </HeadlessMenuItem>
  );
}
