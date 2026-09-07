import { forwardRef } from "react";
import { IconSearch } from "@tabler/icons-react";
import { Input } from "./Input";

interface PanelSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Panel filter field.
 *
 * Composes the local `Input` (now a `@semio/ui` `TextField` variant) rather than
 * semio's own `Search`, deliberately: semio's `Search.onClear` writes
 * `inputRef.current.value = ""` directly **without firing `onChange`**, which
 * silently desyncs a controlled input like this one.
 *
 * Two details are load-bearing for e2e and must not change: `type="search"`
 * (gives the `searchbox` role) and `placeholder`, which supplies the accessible
 * name — `getByRole("searchbox", { name: "Search inputs..." })`.
 *
 * The inline search SVG was replaced with `@tabler/icons-react`, the icon set
 * `@semio/ui` ships.
 */
export const PanelSearch = forwardRef<HTMLInputElement, PanelSearchProps>(
  ({ value, onChange, placeholder = "Filter...", className }, ref) => (
    <Input
      ref={ref}
      size="sm"
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={className}
      startContent={<IconSearch className="w-3.5 h-3.5" stroke={2.5} />}
    />
  ),
);

PanelSearch.displayName = "PanelSearch";
