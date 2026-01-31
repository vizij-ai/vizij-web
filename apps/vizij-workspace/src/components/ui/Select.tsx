import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Transition } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { Fragment } from "react";
import { cn } from "../../utils/cn";

export interface SelectOption {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
}

export interface SelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    label?: string;
    disabled?: boolean;
    className?: string;
    size?: "sm" | "md";
}

export function Select({
    value,
    onChange,
    options,
    placeholder = "Select an option...",
    label,
    disabled = false,
    className,
    size = "md",
}: SelectProps) {
    const selectedOption = options.find((opt) => opt.value === value);

    return (
        <div className={cn("w-full flex flex-col gap-1.5", className)}>
            {label && (
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
                    {label}
                </label>
            )}
            <Listbox value={value} onChange={onChange} disabled={disabled}>
                <div className="relative">
                    <ListboxButton
                        className={cn(
                            "relative w-full cursor-pointer rounded-lg bg-slate-950/50 border border-slate-800 py-1.5 pl-3 pr-10 text-left transition-all hover:bg-slate-950 hover:border-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50",
                            {
                                "h-8 text-[11px]": size === "sm",
                                "h-10 text-sm": size === "md",
                            }
                        )}
                    >
                        <span className="block truncate text-slate-200 font-medium">
                            {selectedOption ? selectedOption.label : placeholder}
                        </span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            <ChevronDown
                                className="h-4 w-4 text-slate-500 transition-transform duration-200"
                                aria-hidden="true"
                            />
                        </span>
                    </ListboxButton>
                    <Transition
                        as={Fragment}
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <ListboxOptions className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-slate-900 border border-slate-800 p-1 text-sm shadow-2xl shadow-black/50 focus:outline-none custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                            {options.map((option) => (
                                <ListboxOption
                                    key={option.value}
                                    className={({ focus, selected }) =>
                                        cn(
                                            "relative cursor-pointer select-none rounded-lg py-2 pl-10 pr-4 transition-colors",
                                            focus ? "bg-blue-600/10 text-blue-100" : "text-slate-300",
                                            selected && "bg-blue-600/20 text-blue-100",
                                            option.disabled && "opacity-40 pointer-events-none"
                                        )
                                    }
                                    value={option.value}
                                >
                                    {({ selected }) => (
                                        <>
                                            <div className="flex flex-col gap-0.5">
                                                <span className={cn("block truncate", selected ? "font-bold" : "font-medium")}>
                                                    {option.label}
                                                </span>
                                                {option.description && (
                                                    <span className="block truncate text-[10px] text-slate-500">
                                                        {option.description}
                                                    </span>
                                                )}
                                            </div>
                                            {selected ? (
                                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400">
                                                    <Check className="h-4 w-4" aria-hidden="true" strokeWidth={3} />
                                                </span>
                                            ) : null}
                                        </>
                                    )}
                                </ListboxOption>
                            ))}
                        </ListboxOptions>
                    </Transition>
                </div>
            </Listbox>
        </div>
    );
}
