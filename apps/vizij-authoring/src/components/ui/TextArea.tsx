import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-border-default bg-bg-input px-3 py-2 text-sm shadow-sm placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 text-text-primary font-mono shadow-inner resize-none transition-all hover:border-border-hover",
          className,
        )}
        {...props}
      />
    );
  },
);

TextArea.displayName = "TextArea";
