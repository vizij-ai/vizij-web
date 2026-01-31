import { useState, useRef, type ReactNode } from "react";
import { cn } from "../../utils/cn";

interface TooltipProps {
    content: ReactNode;
    children: ReactNode;
    side?: "top" | "bottom" | "left" | "right";
    className?: string;
    delay?: number;
}

export function Tooltip({
    content,
    children,
    side = "top",
    className,
    delay = 200,
}: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const timeoutRef = useRef<number | null>(null); // Change type to number | null

    const handleMouseEnter = () => {
        timeoutRef.current = window.setTimeout(() => {
            setIsVisible(true);
        }, delay);
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setIsVisible(false);
    };

    return (
        <div
            className="relative flex items-center"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {isVisible && (
                <div
                    className={cn(
                        "absolute z-50 min-w-[max-content] max-w-xs rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 shadow-xl animate-in fade-in zoom-in-95 duration-100",
                        {
                            "bottom-full left-1/2 -translate-x-1/2 mb-2": side === "top",
                            "top-full left-1/2 -translate-x-1/2 mt-2": side === "bottom",
                            "right-full top-1/2 -translate-y-1/2 mr-2": side === "left",
                            "left-full top-1/2 -translate-y-1/2 ml-2": side === "right",
                        },
                        className
                    )}
                >
                    {content}
                </div>
            )}
        </div>
    );
}
