import React, { forwardRef } from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    // In styles.css, inputs are styled via element selectors like .sidebar input[type="text"]
    // We should probably add a utility class to styles.css or just rely on the context.
    // However, to be modular, we should probably add a specific class for inputs.
    // But for now, let's just pass through.
    // Wait, the goal is to standardize.
    // Let's assume we will add a .input class to styles.css later or use existing ones.
    // Currently, inputs are styled contextually (e.g. .sidebar input, .asset-card input).

    return <input ref={ref} className={className} {...props} />;
  },
);

Input.displayName = "Input";
