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
            className={className}
            startContent={
                <svg
                    className="w-3.5 h-3.5 text-text-muted transition-colors group-focus-within:text-text-primary"
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
