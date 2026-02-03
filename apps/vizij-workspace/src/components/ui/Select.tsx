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
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
          {label}
        </label>
      )}
      <BaseSelect.Root value={value} onValueChange={(val) => onChange(val as string)} disabled={disabled}>
        <BaseSelect.Trigger
          className={cn(
            "group relative w-full cursor-pointer rounded-lg bg-slate-950/50 border border-slate-800 py-1.5 pl-3 pr-10 text-left transition-all hover:bg-slate-950 hover:border-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50 flex items-center",
            {
              "h-8 text-[11px]": size === "sm",
              "h-10 text-sm": size === "md",
            },
          )}
        >
          <BaseSelect.Value placeholder={placeholder} className="block truncate text-slate-200 font-medium group-data-[placeholder]:text-slate-500">
            {options.find((o) => o.value === value)?.label}
          </BaseSelect.Value>
          <BaseSelect.Icon className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronDown
              className="h-4 w-4 text-slate-500 transition-transform duration-200 group-data-[popup-open]:rotate-180"
              aria-hidden="true"
            />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner sideOffset={4}>
            <BaseSelect.Popup
              className="z-50 max-h-60 w-[var(--anchor-width)] overflow-auto rounded-xl bg-slate-900 border border-slate-800 p-1 text-sm shadow-2xl shadow-black/50 focus:outline-none custom-scrollbar data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-[var(--transform-origin)]"
            >
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    "group relative cursor-pointer select-none rounded-lg py-2 pl-10 pr-4 transition-colors outline-none",
                    "data-[highlighted]:bg-blue-600/10 data-[highlighted]:text-blue-100",
                    "data-[selected]:bg-blue-600/20 data-[selected]:text-blue-100",
                    "text-slate-300",
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
                      <span className="block truncate text-[10px] text-slate-500">
                        {option.description}
                      </span>
                    )}
                  </div>
                  <BaseSelect.ItemIndicator className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400">
                    <Check
                      className="h-4 w-4"
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
