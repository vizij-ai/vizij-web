import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
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
  query?: string;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

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
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalQuery, setInternalQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isQueryControlled = queryProp !== undefined;
  const query = queryProp ?? internalQuery;

  const setQuery = (nextQuery: string) => {
    if (nextQuery === query) {
      return;
    }
    if (!isQueryControlled) {
      setInternalQuery(nextQuery);
    }
    onQueryChange?.(nextQuery);
  };

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (query === "") return options;
    return options.filter((option) =>
      option.label
        .toLowerCase()
        .replace(/\s+/g, "")
        .includes(query.toLowerCase().replace(/\s+/g, "")),
    );
  }, [options, query]);

  // Sync query with selected value when closed or initial
  useEffect(() => {
    if (!isOpen && selectedOption) {
      setQuery(selectedOption.label);
    }
  }, [isOpen, selectedOption]);

  // Reset highlighted index when filtering changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        // Reset query to selected value if closing without selection
        if (selectedOption) {
          setQuery(selectedOption.label);
        } else {
          setQuery("");
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedOption]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setIsOpen(true);
        setHighlightedIndex((prev) =>
          prev + 1 >= filteredOptions.length ? 0 : prev + 1,
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setIsOpen(true);
        setHighlightedIndex((prev) =>
          prev - 1 < 0 ? filteredOptions.length - 1 : prev - 1,
        );
        break;
      case "Enter":
        event.preventDefault();
        if (isOpen && filteredOptions.length > 0) {
          const option = filteredOptions[highlightedIndex];
          if (option && !option.disabled) {
            handleSelect(option);
          }
        }
        break;
      case "Escape":
        setIsOpen(false);
        if (selectedOption) {
          setQuery(selectedOption.label);
        } else {
          setQuery("");
        }
        inputRef.current?.blur();
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (option: ComboboxOption) => {
    onChange(option.value);
    setQuery(option.label);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsOpen(true);
    // If clearing input, we might want to clear selection? Headless UI behavior depends.
    // Usually typing doesn't clear value until selection?
    // Staying consistent: Typing just filters.
  };

  const handleInputFocus = () => {
    if (!disabled) {
      setIsOpen(true);
      // Select text on focus?
      // inputRef.current?.select();
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn("w-full flex flex-col gap-1.5 relative", className)}
    >
      {label && (
        <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary px-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className={cn(
            "relative w-full rounded-lg bg-bg-input border border-border-default py-1.5 pl-9 pr-10 text-left transition-all hover:bg-bg-hover hover:border-border-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-app disabled:cursor-not-allowed disabled:opacity-50 text-text-primary font-medium placeholder:text-text-muted",
            {
              "h-8 text-[11px]": size === "sm",
              "h-10 text-sm": size === "md",
            },
          )}
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
        />
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className="h-4 w-4 text-text-muted" aria-hidden="true" />
        </div>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            if (disabled) return;
            if (isOpen) {
              setIsOpen(false);
            } else {
              inputRef.current?.focus();
              setIsOpen(true);
            }
          }}
          className="absolute inset-y-0 right-0 flex items-center pr-2 cursor-pointer focus:outline-none"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 text-text-muted transition-transform duration-200",
              isOpen && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-bg-card border border-border-default p-1 text-sm shadow-2xl shadow-black/50 focus:outline-none custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
            {filteredOptions.length === 0 ? (
              <div className="relative cursor-default select-none py-2 px-4 text-text-muted italic">
                Nothing found.
              </div>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = selectedOption?.value === option.value;
                const isHighlighted = index === highlightedIndex;
                return (
                  <div
                    key={option.value}
                    className={cn(
                      "relative cursor-pointer select-none rounded-lg py-2 pl-10 pr-4 transition-colors",
                      isHighlighted
                        ? "bg-accent-subtle text-text-primary"
                        : "text-text-secondary",
                      isSelected && "bg-accent-subtle text-accent font-bold",
                      option.disabled && "opacity-40 pointer-events-none",
                    )}
                    onClick={() => !option.disabled && handleSelect(option)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={cn(
                          "block truncate",
                          isSelected ? "font-bold" : "font-medium",
                        )}
                      >
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="block truncate text-[10px] text-text-muted">
                          {option.description}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-accent">
                        <Check
                          className="h-4 w-4"
                          aria-hidden="true"
                          strokeWidth={3}
                        />
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
