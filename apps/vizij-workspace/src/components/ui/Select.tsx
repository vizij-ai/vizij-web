import { Select as BaseSelect } from "@base-ui/react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../utils/cn";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select an option...",
  label,
  disabled = false,
  className,
  size = "md",
}: SelectProps) {
  // Base UI handles option lookup automatically via Select.Value, but we might need it for custom rendering if we didn't use Select.Value. 
  // Select.Value is convenient.

  return (
    <div className={cn("w-full flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary px-1">
          {label}
        </label>
      )}
      <BaseSelect.Root value={value} onValueChange={(val) => onChange(val as string)} disabled={disabled}>
        <BaseSelect.Trigger
          className={cn(
            "inline-flex items-center justify-between rounded px-[15px] text-[13px] leading-none h-[35px] gap-[5px] bg-bg-input text-text-primary shadow-[0_2px_10px] shadow-black/10 hover:bg-bg-hover focus:shadow-[0_0_0_2px] focus:shadow-black data-[placeholder]:text-text-muted outline-none w-full border border-border-default", "focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app disabled:cursor-not-allowed disabled:opacity-50 flex items-center",
            {
              "h-8 text-[11px]": size === "sm",
              "h-10 text-sm": size === "md",
            },
          )}
        >
          <BaseSelect.Value placeholder={placeholder} className="block truncate text-text-primary font-medium group-data-[placeholder]:text-text-muted">
            {options.find((o) => o.value === value)?.label}
          </BaseSelect.Value>
          <BaseSelect.Icon className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronDown
              className="h-4 w-4 text-text-muted transition-transform duration-200 group-data-[popup-open]:rotate-180"
              aria-hidden="true"
            />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner sideOffset={4}>
            <BaseSelect.Popup
              className={cn(
                "z-50 max-h-60 w-[var(--anchor-width)] overflow-auto rounded-xl bg-bg-card border border-border-default p-1 shadow-2xl shadow-black/50 focus:outline-none custom-scrollbar data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-[var(--transform-origin)]",
                size === "sm" ? "text-[11px]" : "text-sm",
              )}
            >
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    "text-[13px] leading-none text-text-primary rounded-[3px] flex items-center h-[25px] pr-[35px] pl-[25px] relative select-none data-[disabled]:text-text-muted data-[disabled]:pointer-events-none data-[highlighted]:bg-bg-hover data-[highlighted]:text-text-primary",
                    "data-[selected]:bg-accent-subtle data-[selected]:text-accent data-[selected]:font-bold",
                    "text-text-secondary",
                    option.disabled && "opacity-40 pointer-events-none",
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <BaseSelect.ItemText className={cn(
                      "block truncate",
                      "group-data-[selected]:font-bold font-medium"
                    )}>
                      {option.label}
                    </BaseSelect.ItemText>
                    {option.description && (
                      <span className="block truncate text-[10px] text-text-muted">
                        {option.description}
                      </span>
                    )}
                  </div>
                  <BaseSelect.ItemIndicator className={cn(
                    "absolute inset-y-0 left-0 flex items-center text-accent",
                    size === "sm" ? "pl-2.5" : "pl-3"
                  )}>
                    <Check
                      className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}
                      aria-hidden="true"
                      strokeWidth={3}
                    />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </div>
  );
}
