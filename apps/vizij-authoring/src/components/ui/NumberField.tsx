import React from "react";
import { NumberField as BaseNumberField } from "@base-ui/react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "../../utils/cn";

export interface NumberFieldProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  format?: Intl.NumberFormatOptions;
  onChange?: (value: number) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  placeholder?: string;
  commitMode?: "immediate" | "blur";
  allowScrub?: boolean;
}

export function NumberField({
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  disabled = false,
  className,
  size = "md",
  placeholder,
  commitMode = "immediate",
  allowScrub = true,
}: NumberFieldProps) {
  const [draftValue, setDraftValue] = React.useState(value);
  const handleNonScrubPointerStart = React.useCallback<
    React.MouseEventHandler<HTMLDivElement> &
      React.PointerEventHandler<HTMLDivElement>
  >((event) => {
    event.stopPropagation();
  }, []);

  React.useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const displayedValue = commitMode === "blur" ? draftValue : value;

  const inputElement = (
    <BaseNumberField.Input
      className={cn(
        "w-full bg-transparent border-none text-text-primary focus:outline-none tabular-nums p-0",
        {
          "text-xs": size === "sm",
          "text-sm": size === "md",
        },
      )}
      placeholder={placeholder}
    />
  );

  return (
    <BaseNumberField.Root
      value={displayedValue}
      min={min}
      max={max}
      step={step}
      format={format}
      onValueChange={(val) => {
        if (val === null) {
          return;
        }
        if (commitMode === "blur") {
          setDraftValue(val);
          return;
        }
        if (onChange) {
          onChange(val);
        }
      }}
      onValueCommitted={(val) => {
        if (commitMode !== "blur") {
          return;
        }
        if (onChange && val !== null) {
          onChange(val);
        }
      }}
      disabled={disabled}
      className={cn(
        "group flex items-center border border-border-default bg-bg-input rounded-md transition-colors focus-within:ring-2 focus-within:ring-accent focus-within:border-transparent",
        {
          "h-7": size === "sm",
          "h-9": size === "md",
        },
        className,
      )}
    >
      {allowScrub ? (
        <BaseNumberField.ScrubArea className="cursor-ew-resize flex-1 h-full flex items-center px-2">
          {inputElement}
        </BaseNumberField.ScrubArea>
      ) : (
        <div
          className="flex-1 h-full flex items-center px-2"
          onMouseDown={handleNonScrubPointerStart}
          onPointerDown={handleNonScrubPointerStart}
        >
          {inputElement}
        </div>
      )}
      <div className="flex flex-col border-l border-border-default w-5 h-full">
        <BaseNumberField.Increment className="flex-1 flex items-center justify-center hover:bg-bg-hover text-text-muted hover:text-text-primary cursor-default active:bg-bg-active">
          <ChevronUp size={size === "sm" ? 8 : 10} />
        </BaseNumberField.Increment>
        <BaseNumberField.Decrement className="flex-1 flex items-center justify-center border-t border-border-default hover:bg-bg-hover text-text-muted hover:text-text-primary cursor-default active:bg-bg-active">
          <ChevronDown size={size === "sm" ? 8 : 10} />
        </BaseNumberField.Decrement>
      </div>
    </BaseNumberField.Root>
  );
}
