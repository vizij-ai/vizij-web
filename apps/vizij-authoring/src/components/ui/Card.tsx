import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, compact, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "asset-card bg-bg-card border border-border-default rounded-xl shadow-sm",
          compact ? "p-3" : "p-4",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";

export const CardHeader = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("asset-card__header flex items-center justify-between gap-2 mb-2", className)}
    {...props}
  >
    {children}
  </div>
);

export const CardTitle = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    className={cn("asset-card__title m-0 text-sm font-bold text-text-primary", className)}
    {...props}
  >
    {children}
  </h3>
);

export const CardDescription = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p
    className={cn("asset-card__description m-0 text-xs text-text-secondary", className)}
    {...props}
  >
    {children}
  </p>
);

export const CardBody = ({
  className,
  children,
  compact,
  ...props
}: HTMLAttributes<HTMLDivElement> & { compact?: boolean }) => (
  <div
    className={cn("asset-card__body text-sm text-text-secondary", compact && "text-xs", className)}
    {...props}
  >
    {children}
  </div>
);
