import { useState, useRef, type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
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
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    let top = 0;
    let left = 0;

    // Simple positioning logic (adjust as needed for more robustness)
    switch (side) {
      case "top":
        top = rect.top + scrollY - 8; // 8px gap
        left = rect.left + scrollX + rect.width / 2;
        break;
      case "bottom":
        top = rect.bottom + scrollY + 8;
        left = rect.left + scrollX + rect.width / 2;
        break;
      case "left":
        top = rect.top + scrollY + rect.height / 2;
        left = rect.left + scrollX - 8;
        break;
      case "right":
        top = rect.top + scrollY + rect.height / 2;
        left = rect.right + scrollX + 8;
        break;
    }

    setPosition({ top, left });
  };

  const handleMouseEnter = () => {
    updatePosition();
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

  // Update position on scroll/resize when visible
  useEffect(() => {
    if (!isVisible) return;
    const handleUpdate = () => requestAnimationFrame(updatePosition);
    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);
    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
    };
  }, [isVisible]);

  return (
    <div
      ref={triggerRef}
      className="relative flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible &&
        createPortal(
          <div
            className={cn(
              "fixed z-[100] min-w-[max-content] max-w-xs rounded-lg border border-border-default bg-bg-panel px-3 py-1.5 text-xs text-text-primary shadow-xl animate-in fade-in zoom-in-95 duration-100 pointer-events-none",
              className,
            )}
            style={{
              top: position.top,
              left: position.left,
              transform:
                side === "top"
                  ? "translate(-50%, -100%)"
                  : side === "bottom"
                    ? "translate(-50%, 0)"
                    : side === "left"
                      ? "translate(-100%, -50%)"
                      : "translate(0, -50%)",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
}
