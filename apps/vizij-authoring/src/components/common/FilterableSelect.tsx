import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export interface FilterableSelectOption {
  value: string | null;
  label: string;
  keywords?: readonly string[];
  disabled?: boolean;
}

export interface FilterableSelectProps {
  value: string | null;
  options: readonly FilterableSelectOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  currentLabelOverride?: ReactNode;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  listClassName?: string;
  filterInputClassName?: string;
  optionClassName?: string;
  optionActiveClassName?: string;
  optionHighlightClassName?: string;
  optionDisabledClassName?: string;
  dataOptionAttribute?: string;
  emptyClassName?: string;
}

const noop = () => undefined;

function optionMatches(
  option: FilterableSelectOption,
  normalizedFilter: string,
): boolean {
  if (normalizedFilter.length === 0) {
    return true;
  }
  const label = option.label ?? "";
  if (label.toLowerCase().includes(normalizedFilter)) {
    return true;
  }
  if (!option.keywords || option.keywords.length === 0) {
    return false;
  }
  return option.keywords.some((keyword) =>
    keyword.toLowerCase().includes(normalizedFilter),
  );
}

export function FilterableSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  currentLabelOverride,
  searchPlaceholder = "Search…",
  noResultsLabel = "No matches",
  disabled,
  className,
  triggerClassName,
  menuClassName,
  listClassName,
  filterInputClassName,
  optionClassName,
  optionActiveClassName,
  optionHighlightClassName,
  optionDisabledClassName,
  dataOptionAttribute = "data-option",
  emptyClassName,
}: FilterableSelectProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const filterInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedFilter = filter.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    return options.filter((option) => optionMatches(option, normalizedFilter));
  }, [normalizedFilter, options]);

  const selectedOption = useMemo(() => {
    return options.find((option) => option.value === value) ?? null;
  }, [options, value]);

  const currentLabel =
    currentLabelOverride ??
    (selectedOption ? selectedOption.label : placeholder);

  const openDropdown = useCallback(() => {
    if (disabled) {
      return;
    }
    setOpen(true);
  }, [disabled]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setFilter("");
    setHighlightedIndex(-1);
  }, []);

  const handleDocumentClick = useCallback(
    (event: MouseEvent) => {
      if (!open) {
        return;
      }
      const target = event.target as Node | null;
      if (target && wrapperRef.current?.contains(target)) {
        return;
      }
      closeDropdown();
    },
    [closeDropdown, open],
  );

  useEffect(() => {
    if (!open) {
      return noop;
    }
    document.addEventListener("mousedown", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, [handleDocumentClick, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setFilter("");
    setHighlightedIndex(-1);
    const timer = setTimeout(() => {
      filterInputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (filteredOptions.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    const selectedIndex = filteredOptions.findIndex(
      (option) => option.value === value,
    );
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredOptions, open, value]);

  const handleTriggerClick = useCallback(() => {
    if (open) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }, [closeDropdown, open, openDropdown]);

  const commitSelection = useCallback(
    (nextValue: string | null) => {
      if (nextValue === value) {
        closeDropdown();
        return;
      }
      onChange(nextValue);
      closeDropdown();
    },
    [closeDropdown, onChange, value],
  );

  const handleFilterKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!open) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((prev) => {
          if (filteredOptions.length === 0) {
            return -1;
          }
          const next =
            prev < filteredOptions.length - 1
              ? prev + 1
              : filteredOptions.length - 1;
          return next;
        });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((prev) => {
          if (filteredOptions.length === 0) {
            return -1;
          }
          const next = prev > 0 ? prev - 1 : 0;
          return next;
        });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (
          highlightedIndex >= 0 &&
          highlightedIndex < filteredOptions.length
        ) {
          const option = filteredOptions[highlightedIndex];
          if (!option.disabled) {
            commitSelection(option.value);
          }
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeDropdown();
      }
    },
    [closeDropdown, commitSelection, filteredOptions, highlightedIndex, open],
  );

  const handleOptionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, optionIndex: number) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((prev) => {
          if (filteredOptions.length === 0) {
            return -1;
          }
          const next =
            prev < filteredOptions.length - 1
              ? prev + 1
              : filteredOptions.length - 1;
          return next;
        });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((prev) => {
          if (filteredOptions.length === 0) {
            return -1;
          }
          const next = prev > 0 ? prev - 1 : 0;
          return next;
        });
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const option = filteredOptions[optionIndex];
        if (!option.disabled) {
          commitSelection(option.value);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeDropdown();
      }
    },
    [closeDropdown, commitSelection, filteredOptions],
  );

  const wrapperClassName = className
    ? `filter-select ${className}`
    : "filter-select";

  const listClass = listClassName
    ? `${listClassName}`
    : "filter-select__option-list";

  const emptyClass =
    emptyClassName ?? `${optionClassName ?? ""} filter-select__option--empty`;

  return (
    <div ref={wrapperRef} className={wrapperClassName}>
      <button
        type="button"
        className={triggerClassName}
        onClick={handleTriggerClick}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-open={open ? "true" : "false"}
        disabled={disabled}
      >
        {currentLabel}
      </button>
      {open && (
        <div className={menuClassName} role="listbox">
          <input
            ref={filterInputRef}
            className={filterInputClassName}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={handleFilterKeyDown}
            placeholder={searchPlaceholder}
            aria-label="Filter options"
          />
          <div className={listClass}>
            {filteredOptions.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;
              const combinedClassName = [
                optionClassName,
                isSelected ? optionActiveClassName : "",
                option.disabled ? optionDisabledClassName : "",
                isHighlighted
                  ? (optionHighlightClassName ??
                    "filter-select__option--highlighted")
                  : "",
              ]
                .filter(Boolean)
                .join(" ")
                .trim();
              return (
                <button
                  key={`${option.value ?? "null"}:${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={combinedClassName || undefined}
                  onClick={() =>
                    !option.disabled && commitSelection(option.value)
                  }
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  {...{ [dataOptionAttribute]: "true" }}
                  disabled={option.disabled}
                >
                  {option.label}
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className={emptyClass}>{noResultsLabel}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
