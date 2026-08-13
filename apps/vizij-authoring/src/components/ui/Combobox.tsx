import { useEffect, useMemo, useRef, useState } from "react";
import { Autocomplete, Size } from "@semio/ui";
import { IconCheck } from "@tabler/icons-react";
import { cn } from "../../utils/cn";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboboxOption[];
  /** Controlled search text. Uncontrolled when omitted. */
  query?: string;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  /**
   * Where the popup portals to. Resolved automatically when omitted — see the
   * docblock. Pass `null` to force the default (`document.body`).
   */
  portalContainer?: HTMLElement | null;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

/**
 * Searchable single-select, built on `@semio/ui`'s `Autocomplete`.
 *
 * ## Why `Autocomplete` and not semio's `Combobox`
 *
 * Semio ships both. `Combobox` looks like the obvious match by name, but it owns
 * its search text internally and exposes no way to control it — its props are
 * `value`/`onChange` over the *selected option*, plus `open`/`onOpenChange`. Two
 * of this component's three call sites drive the search text from their own draft
 * state (`query={draft.searchQuery}`), which `Combobox` cannot express.
 *
 * `Autocomplete`'s `value`/`onChange` **is** the input text, with selection
 * arriving separately through `onSelect`. That is exactly the shape this contract
 * needs, so the naming is a false friend.
 *
 * ## What this replaced
 *
 * A hand-rolled combobox: its own filter, `highlightedIndex` keyboard loop,
 * click-outside listener, and a popup rendered as `absolute z-50` **inside** the
 * trigger's container. That last detail was the bug — the popup was clipped by
 * any scrolling ancestor, and two of the three call sites live inside copy
 * modals. `Autocomplete` portals its popup, so it escapes the modal's
 * `overflow-y-auto` entirely.
 *
 * ## The z-index that portalling costs, and why `popupClassName` cannot pay it
 *
 * Portalling to `document.body` trades clipping for stacking. `ui/Modal` renders
 * at `z-[4100]`; two of the three call sites are inside those copy modals, so a
 * body-portalled popup opens *behind* the modal containing its own input.
 *
 * `popupClassName` looks like the fix and is not. Measured, the class lands on
 * an element with `position: static`, where `z-index` is inert. The element that
 * actually positions the popup is its parent — semio's own positioner, hardcoded
 * to `z-50` with no prop to change it:
 *
 * ```text
 * <div class="z-50" position:absolute>            ← semio's positioner, effective z
 *   <div class="… dropdown-content" position:static>   ← where popupClassName lands
 * ```
 *
 * So the popup resolves to `z-50` against a `z-[4100]` modal no matter what is
 * passed. The mechanism that does work is `portalContainer`, which semio
 * documents for exactly this ("e.g. inside a modal").
 *
 * **This resolves itself.** Rather than threading a ref down through two deep
 * call sites in `VariablesPanel`, the component asks its own DOM whether it sits
 * inside a dialog. `[role="dialog"]` is a stable ARIA contract, not a semio or
 * radix internal, and `ui/Modal`'s `RadixDialog.Content` carries it. Portalling
 * there puts the popup inside the modal's stacking context — no z-index fight —
 * and, because `Content` itself sets no `overflow`, still escapes the
 * `max-h-[80vh] overflow-y-auto` body that caused the original clipping.
 *
 * ## One deliberate behaviour change
 *
 * Filtering is skipped while the query still equals the selected option's label.
 * The old component synced the input text to the selection on close, then
 * filtered by it on reopen — so focusing a combobox that already had a selection
 * showed a list of exactly one item, and you had to clear the box to see the
 * others. That was a latent annoyance before; with a popup that now opens on
 * focus it would have been the common case.
 */
export function Combobox({
  value,
  onChange,
  options,
  query: queryProp,
  onQueryChange,
  placeholder = "Search or select...",
  label,
  disabled = false,
  className,
  size = "md",
  portalContainer,
}: ComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dialogContainer, setDialogContainer] = useState<HTMLElement | null>(
    null,
  );

  // Resolved after mount rather than during render: the popup only needs a
  // container once it opens, and reading `closest` during render would run
  // before this subtree is in the document. A `Combobox` inside a modal mounts
  // when the modal does, so this re-runs at the right time on its own.
  useEffect(() => {
    if (portalContainer !== undefined) return;
    setDialogContainer(
      rootRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null,
    );
  }, [portalContainer]);

  const resolvedContainer =
    portalContainer !== undefined ? portalContainer : dialogContainer;

  const [internalQuery, setInternalQuery] = useState("");
  const isQueryControlled = queryProp !== undefined;
  const query = queryProp ?? internalQuery;

  const setQuery = (next: string) => {
    if (next === query) return;
    if (!isQueryControlled) setInternalQuery(next);
    onQueryChange?.(next);
  };

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const items = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return options;
    // See the docblock: an untouched query is the selection's own label, and
    // filtering by it would hide every alternative.
    if (selectedOption && query === selectedOption.label) return options;
    return options.filter((option) => normalize(option.label).includes(needle));
  }, [options, query, selectedOption]);

  return (
    <div
      ref={rootRef}
      className={cn("w-full flex flex-col gap-1.5", className)}
    >
      {label && (
        <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary px-1">
          {label}
        </label>
      )}
      <Autocomplete<ComboboxOption>
        items={items}
        value={query}
        onChange={setQuery}
        onSelect={(option) => {
          onChange(option.value);
          setQuery(option.label);
        }}
        getItemKey={(option) => option.value}
        getItemDisabled={(option) => Boolean(option.disabled)}
        placeholder={placeholder}
        disabled={disabled}
        size={size === "sm" ? Size.Sm : Size.Md}
        // Same two overrides `ui/Input` applies over semio's `TextField`, for
        // the same reason: semio's own radius and type scale are not the app's.
        // Measured, the rest already matches Input exactly — 32px tall, the
        // `oklab(0.145 0 0 / 0.2)` fill, no border — so these two are the whole
        // gap between this and every other input in the app.
        className="rounded-lg"
        inputClassName={size === "sm" ? "text-xs" : "text-sm"}
        emptyContent={
          <span className="text-text-muted italic">Nothing found.</span>
        }
        portalContainer={resolvedContainer}
        // Width, because semio's own sizing cannot work in this app. The popup
        // is `w-[calc(var(--available-width)-4px)]` with the anchor-matched
        // width behind a `desktop:` variant — and `desktop:` is keyed off a
        // `.desktop` marker that only semio's `LayoutRoot` shell sets. This app
        // deliberately does not adopt `LayoutRoot` (no resizing, three fixed
        // regions), so that variant can never match and every popup would render
        // at mobile width: measured 658px against a 462px input inside a 512px
        // modal. `--anchor-width` is correct on its own, so this just uses it.
        popupClassName="custom-scrollbar w-[var(--anchor-width)]!"
        renderItem={(option, state) => {
          const isSelected = option.value === value;
          return (
            <div className="relative flex flex-col gap-0.5 pl-7 pr-1 py-0.5">
              <span
                className={cn(
                  "block truncate",
                  isSelected ? "font-bold text-accent" : "font-medium",
                  state.highlighted && !isSelected && "text-text-primary",
                )}
              >
                {option.label}
              </span>
              {option.description && (
                <span className="block truncate text-[10px] text-text-muted">
                  {option.description}
                </span>
              )}
              {isSelected && (
                <span className="absolute inset-y-0 left-0 flex items-center text-accent">
                  <IconCheck
                    className="h-4 w-4"
                    aria-hidden="true"
                    stroke={3}
                  />
                </span>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
