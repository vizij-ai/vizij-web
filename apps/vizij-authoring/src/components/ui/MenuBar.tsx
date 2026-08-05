import * as React from "react";
import { Menubar as RadixMenubar } from "radix-ui";
import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import { cn } from "../../utils/cn";
import { Logo } from "./Logo";

/**
 * Application menu bar, built on `radix-ui`'s Menubar.
 *
 * radix rather than `@semio/ui`: semio has no Menubar at all. Its `Dropdown` +
 * `Nested*` primitives could render a row of menus, but `Dropdown` enforces a
 * module-scoped singleton open-lock (`dropdown-coordinator.ts` — "Only one slot
 * exists — this isn't a stack") and carries no menubar keyboard semantics.
 * `radix-ui` is the same stack `@semio/ui` is built on.
 *
 * This is an accessibility upgrade, not just a substrate swap. Previously each
 * `Menu` was its own independent `Menu.Root`, so the bar had no `role="menubar"`,
 * no arrow-key movement between menus, and no hover-to-switch once a menu was
 * open. radix's Menubar provides all three.
 *
 * Two behaviours are preserved explicitly, because radix's defaults differ:
 *
 * 1. **A submenu trigger can also be selected.** `MenuSubmenu` accepts `onSelect`
 *    and `checked` — the "Authoring" entry both opens a submenu and toggles panel
 *    visibility, with a check indicator. radix's `SubTrigger` has no `onSelect`,
 *    so the callback is wired to `onClick`, which composes with radix's own
 *    open-on-click. This is what Base UI did too (`onClick={onSelect}` alongside
 *    `openOnHover`).
 * 2. **`testId` reaches the real trigger/item.** All seven `app-menu-*` e2e
 *    testids depend on it; radix spreads unknown props onto its underlying
 *    element.
 *
 * Checkbox items close the menu on select, which is radix's default and matches
 * Base UI here. An earlier revision kept them open via `onSelect` preventDefault,
 * on the theory that the View menu's 24 toggles are nicer to use in one visit.
 * That deterministically broke `motiongraph.smoke`: leaving the Mode menu open
 * after choosing an edit focus meant the next menu interaction never landed. If
 * multi-toggle-without-closing is wanted, it needs to be opt-in per call site
 * rather than blanket, and it needs its own test.
 *
 * Selector note: `data-[highlighted]` is common to both libraries, but Base UI's
 * `data-popup-open` became radix's `data-state="open"`, so the trigger and
 * submenu open-styles were rewritten accordingly. The transform-origin variable
 * likewise moved from Base UI's `--transform-origin` to
 * `--radix-menubar-content-transform-origin`.
 *
 * The `z-[4000]` on popup content and `z-[3900]` on the bar are retained: the app
 * has an explicit z-index ladder (menubar row 3800 < bar 3900 < popups 4000) and
 * radix portals to `document.body` with no z-index of its own.
 */
const menuPopupClassName =
  "relative z-[4000] min-w-[200px] rounded-xl border border-border-default bg-bg-card p-1 shadow-2xl shadow-black/50 ring-1 ring-black ring-opacity-5 focus:outline-none backdrop-blur-xl bg-opacity-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 origin-[var(--radix-menubar-content-transform-origin)]";

interface MenuBarProps {
  children: React.ReactNode;
  className?: string;
}

export function MenuBar({ children, className }: MenuBarProps) {
  return (
    <RadixMenubar.Root
      className={cn(
        "relative isolate z-[3900] flex w-full items-center gap-1",
        className,
      )}
    >
      <Logo />
      <div className="w-px h-6 bg-border-default/60 mx-2" />
      {children}
    </RadixMenubar.Root>
  );
}

interface MenuProps {
  label: string;
  children: React.ReactNode;
  testId?: string;
}

export function Menu({ label, children, testId }: MenuProps) {
  return (
    <RadixMenubar.Menu>
      <RadixMenubar.Trigger
        data-testid={testId}
        className="inline-flex justify-center gap-x-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:bg-bg-active data-[state=open]:text-text-primary cursor-pointer active:scale-95"
      >
        {label}
      </RadixMenubar.Trigger>

      <RadixMenubar.Portal>
        <RadixMenubar.Content
          sideOffset={4}
          align="start"
          className={menuPopupClassName}
        >
          {children}
        </RadixMenubar.Content>
      </RadixMenubar.Portal>
    </RadixMenubar.Menu>
  );
}

export function MenuItem({
  children,
  onSelect,
  disabled,
  testId,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <RadixMenubar.Item
      data-testid={testId}
      disabled={disabled}
      onSelect={() => onSelect?.()}
      className={cn(
        "group flex w-full items-center rounded-lg px-3 py-2 text-sm transition-all outline-none select-none",
        "data-[highlighted]:bg-bg-hover data-[highlighted]:text-text-primary",
        "text-text-secondary",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer active:scale-[0.98]",
      )}
    >
      {children}
    </RadixMenubar.Item>
  );
}

export function MenuSeparator() {
  return (
    <RadixMenubar.Separator className="my-1 h-px bg-border-default/60 mx-1" />
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <RadixMenubar.Label className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-text-muted select-none">
      {children}
    </RadixMenubar.Label>
  );
}

export function MenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
  testId,
}: {
  children: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  testId?: string;
}) {
  return (
    <RadixMenubar.CheckboxItem
      data-testid={testId}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={cn(
        "group relative flex w-full items-center rounded-lg py-2 pl-9 pr-3 text-sm transition-all cursor-pointer active:scale-[0.98] outline-none select-none",
        "data-[highlighted]:bg-bg-hover data-[highlighted]:text-text-primary",
        "text-text-secondary",
      )}
    >
      <RadixMenubar.ItemIndicator className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center">
        <IconCheck className="h-3.5 w-3.5" stroke={3} />
      </RadixMenubar.ItemIndicator>
      {children}
    </RadixMenubar.CheckboxItem>
  );
}

export function MenuSubmenu({
  label,
  children,
  checked = false,
  onSelect,
  disabled,
  testId,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  checked?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <RadixMenubar.Sub>
      <RadixMenubar.SubTrigger
        data-testid={testId}
        disabled={disabled}
        // radix's SubTrigger has no `onSelect`; the callback rides on `onClick`
        // and composes with radix's own open-on-click — see (2) in the docstring.
        onClick={onSelect ? () => onSelect() : undefined}
        className={cn(
          "group relative flex w-full items-center rounded-lg py-2 pl-9 pr-3 text-sm transition-all outline-none select-none",
          "data-[highlighted]:bg-bg-hover data-[highlighted]:text-text-primary",
          "data-[state=open]:bg-bg-hover data-[state=open]:text-text-primary",
          "text-text-secondary",
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer active:scale-[0.98]",
        )}
      >
        <span className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center">
          {checked ? <IconCheck className="h-3.5 w-3.5" stroke={3} /> : null}
        </span>
        <span className="flex-1">{label}</span>
        <IconChevronRight className="h-3.5 w-3.5 text-text-muted transition-colors group-data-[highlighted]:text-text-primary group-data-[state=open]:text-text-primary" />
      </RadixMenubar.SubTrigger>

      <RadixMenubar.Portal>
        <RadixMenubar.SubContent
          sideOffset={6}
          alignOffset={-4}
          className={menuPopupClassName}
        >
          {children}
        </RadixMenubar.SubContent>
      </RadixMenubar.Portal>
    </RadixMenubar.Sub>
  );
}
