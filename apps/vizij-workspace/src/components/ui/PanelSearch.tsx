import { useRef } from "react";
import { cn } from "../../utils/cn";

interface PanelSearchProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export function PanelSearch({
    value,
    onChange,
    placeholder = "Filter...",
    className,
}: PanelSearchProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div className={cn("relative flex-1 group h-7", className)}>
            <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-500 transition-colors">
                <svg
                    className="w-3.5 h-3.5"
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
            </div>
            <input
                ref={inputRef}
                type="search"
                className="w-full h-full rounded bg-slate-900/50 border border-slate-800 hover:border-slate-700 focus:border-blue-500/50 pl-7 pr-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-all font-medium"
                placeholder={placeholder}
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}
