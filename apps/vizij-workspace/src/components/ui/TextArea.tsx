import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { }

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                ref={ref}
                className={cn(
                    "flex min-h-[80px] w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50 font-mono text-blue-300 shadow-inner resize-none transition-all hover:border-white/20",
                    className,
                )}
                {...props}
            />
        );
    },
);

TextArea.displayName = "TextArea";
