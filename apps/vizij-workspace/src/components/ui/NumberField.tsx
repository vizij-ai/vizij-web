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
                "group flex items-center border border-border-default bg-bg-input rounded-md transition-colors focus-within:ring-2 focus-within:ring-accent focus-within:border-transparent",
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
                        "w-full bg-transparent border-none text-zinc-200 focus:outline-none tabular-nums p-0",
                        {
                            "text-xs": size === "sm",
                            "text-sm": size === "md",
                        }
                    )}
                    placeholder={placeholder}
                />
            </BaseNumberField.ScrubArea>
            <div className="flex flex-col border-l border-zinc-800 w-5 h-full">
                <BaseNumberField.Increment className="flex-1 flex items-center justify-center hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-default active:bg-zinc-700">
                    <ChevronUp size={size === "sm" ? 8 : 10} />
                </BaseNumberField.Increment>
                <BaseNumberField.Decrement className="flex-1 flex items-center justify-center border-t border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-default active:bg-zinc-700">
                    <ChevronDown size={size === "sm" ? 8 : 10} />
                </BaseNumberField.Decrement>
            </div>
        </BaseNumberField.Root>
    );
}
