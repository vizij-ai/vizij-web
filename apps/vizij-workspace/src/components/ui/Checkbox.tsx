import { Checkbox as BaseCheckbox } from "@base-ui/react";
import { Check } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../../utils/cn";

export interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: ReactNode;
    disabled?: boolean;
    className?: string;
    id?: string;
}

export function Checkbox({
    checked,
    onChange,
    label,
    disabled = false,
    className,
    id,
}: CheckboxProps) {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <BaseCheckbox.Root
                id={id}
                checked={checked}
                onCheckedChange={(val) => onChange(val === true)}
                disabled={disabled}
                className={cn(
                    "flex h-4 w-4 appearance-none items-center justify-center rounded border bg-slate-900 outline-none transition-all",
                    "border-slate-700 hover:border-slate-600 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                    "data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                )}
            >
                <BaseCheckbox.Indicator className="text-current transition-transform duration-200 data-[state=checked]:scale-100 data-[state=unchecked]:scale-0">
                    <Check className="h-3 w-3" strokeWidth={3} />
                </BaseCheckbox.Indicator>
            </BaseCheckbox.Root>
            {label && (
                <label
                    htmlFor={id}
                    className={cn(
                        "text-xs font-medium text-slate-300",
                        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer select-none",
                    )}
                    onClick={() => !disabled && onChange(!checked)}
                >
                    {label}
                </label>
            )}
        </div>
    );
}
