import { forwardRef, type TextareaHTMLAttributes } from "react";
import { TextArea as SemioTextArea } from "@semio/ui";
import { cn } from "../../utils/cn";

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Multi-line text input, built on `@semio/ui`'s `TextArea`.
 *
 * Keeps the native `onChange(event)` signature: semio reports
 * `(value, event)`, but every call site here reads `event.target.value`, so the
 * variant adapts rather than making 6 call sites change.
 *
 * `font-mono` is preserved because this is used for expressions and code, not
 * prose. The previous implementation hardcoded `bg-zinc-950`/`border-zinc-800`/
 * `text-zinc-200`, which rendered as dark-on-dark in light mode; semio's
 * variant classes are token-driven and fix that for free.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, onChange, ...props }, ref) => (
    <SemioTextArea
      ref={ref}
      bg
      onChange={(_value, event) => onChange?.(event)}
      className={cn(
        "min-h-[60px] w-full resize-none font-mono text-sm",
        className,
      )}
      {...props}
    />
  ),
);

TextArea.displayName = "TextArea";
