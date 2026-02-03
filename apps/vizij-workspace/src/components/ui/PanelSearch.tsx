import { forwardRef } from "react";
import { cn } from "../../utils/cn";
import { Input } from "./Input";

interface PanelSearchProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export const PanelSearch = forwardRef<HTMLInputElement, PanelSearchProps>(({
    value,
    onChange,
    placeholder = "Filter...",
    className,
}, ref) => {
    return (
        <Input
            ref={ref}
            size="sm"
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn("h-7 bg-slate-900/50 border-slate-800 hover:border-slate-700", className)}
            startContent={
                <svg
                    className="w-3.5 h-3.5 text-slate-500 group-focus-within:text-blue-500 transition-colors"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                </svg>
            }
        />
    );
});
