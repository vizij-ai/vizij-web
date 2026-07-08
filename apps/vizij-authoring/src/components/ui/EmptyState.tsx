import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

interface EmptyStateProps {
  icon?: LucideIcon;
  iconSize?: number;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  iconSize = 32,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300",
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            "mb-4 rounded-full bg-accent/10 text-accent",
            iconSize <= 24 ? "p-3" : "p-4",
          )}
        >
          <Icon size={iconSize} />
        </div>
      )}
      <h3 className="mb-1 text-sm font-medium text-text-primary">{title}</h3>
      {description && (
        <p className="mb-6 text-xs text-text-muted max-w-[200px] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
