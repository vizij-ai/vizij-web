import * as React from "react";
import { cn } from "../../utils/cn";

interface LogoProps {
    className?: string;
}

export function Logo({ className }: LogoProps) {
    return (
        <div className={cn("flex items-center gap-2 px-3 py-1.5", className)}>
            <img
                src="/assets/icon.svg"
                alt="Vizij Logo"
                className="w-6 h-6"
            />
            <span className="text-lg font-bold tracking-tight text-white font-['Gilroy',_ 'SFProRounded',_ 'ui-sans-serif']">
                vizij
            </span>
        </div>
    );
}
