import { NumberField as BaseNumberField } from "@base-ui/react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "../../utils/cn";

export interface NumberFieldProps {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (value: number) => void;
    disabled?: boolean;
    className?: string;
    size?: "sm" | "md";
    placeholder?: string;
}

export function NumberField({
    value,
    min,
    max,
    step = 1,
    onChange,
    disabled = false,
    className,
    size = "md",
    placeholder,
}: NumberFieldProps) {
    return (
        <BaseNumberField.Root
            value={value}
            min={min}
            max={max}
            step={step}
            onValueChange={(val) => {
                if (onChange && val !== null) {
                    onChange(val);
                }
            }}
            disabled={disabled}
            className={cn(
                "group flex items-center border border-slate-800 bg-slate-950 rounded-md transition-colors focus-within:ring-2 focus-within:ring-blue-600 focus-within:border-transparent",
                {
                    "h-7": size === "sm",
                    "h-9": size === "md",
                },
                className,
            )}
        >
            <BaseNumberField.ScrubArea className="cursor-ew-resize flex-1 h-full flex items-center px-2">
                <BaseNumberField.Input
                    className={cn(
                        "w-full bg-transparent border-none text-slate-200 focus:outline-none tabular-nums p-0",
                        {
                            "text-xs": size === "sm",
                            "text-sm": size === "md",
                        }
                    )}
                    placeholder={placeholder}
                />
            </BaseNumberField.ScrubArea>
            <div className="flex flex-col border-l border-slate-800 w-5 h-full">
                <BaseNumberField.Increment className="flex-1 flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-default active:bg-slate-700">
                    <ChevronUp size={size === "sm" ? 8 : 10} />
                </BaseNumberField.Increment>
                <BaseNumberField.Decrement className="flex-1 flex items-center justify-center border-t border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-default active:bg-slate-700">
                    <ChevronDown size={size === "sm" ? 8 : 10} />
                </BaseNumberField.Decrement>
            </div>
        </BaseNumberField.Root>
    );
}
