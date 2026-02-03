import { Slider as BaseSlider } from "@base-ui/react";
import { cn } from "../../utils/cn";

export interface SliderProps {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (value: number | number[]) => void;
    disabled?: boolean;
    className?: string;
}

export function Slider({
    value,
    min = 0,
    max = 100,
    step = 1,
    onChange,
    disabled = false,
    className,
}: SliderProps) {
    return (
        <BaseSlider.Root
            value={value}
            min={min}
            max={max}
            step={step}
            onValueChange={(val) => {
                if (onChange) {
                    onChange(val as number);
                }
            }}
            disabled={disabled}
            className={cn(
                "relative flex items-center select-none touch-none w-full h-4",
                disabled && "opacity-50 cursor-not-allowed",
                className,
            )}
        >
            <BaseSlider.Control className="flex w-full items-center">
                <BaseSlider.Track className="relative bg-zinc-800 rounded-full flex-grow h-1">
                    <BaseSlider.Indicator className="absolute bg-accent rounded-full h-full" />
                    <BaseSlider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-md hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-transform" />
                </BaseSlider.Track>
            </BaseSlider.Control>
        </BaseSlider.Root>
    );
}
