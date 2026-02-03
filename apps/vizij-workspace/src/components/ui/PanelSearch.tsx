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
            className={cn("w-full bg-zinc-950/50 border border-zinc-800/50 rounded-md py-1.5 pl-8 pr-3 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700/80 focus:ring-1 focus:ring-zinc-700/50 transition-all font-medium", className)}
            startContent={
                <svg
                    className="w-3.5 h-3.5 text-zinc-500 group-focus-within:text-zinc-300 transition-colors"
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
