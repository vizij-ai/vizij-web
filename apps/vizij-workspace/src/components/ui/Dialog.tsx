import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "./Button";

export interface DialogProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        if (open) {
            document.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="vizij-modal-overlay"
            ref={overlayRef}
            onClick={(e) => {
                if (e.target === overlayRef.current) onClose();
            }}
            role="presentation"
        >
            <div
                className="vizij-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="vizij-modal-title"
            >
                <header className="vizij-modal__header">
                    <h2 id="vizij-modal-title" className="vizij-modal__title">{title}</h2>
                    <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
                        ✕
                    </Button>
                </header>
                <div className="vizij-modal__content">
                    {children}
                </div>
            </div>
        </div>
    );
}
