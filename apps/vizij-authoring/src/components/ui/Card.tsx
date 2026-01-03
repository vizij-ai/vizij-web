import React, { forwardRef } from "react";
import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, compact, ...props }, ref) => {
    const classes = ["asset-card", className].filter(Boolean).join(" ");

    return (
      <div ref={ref} className={classes} {...props}>
        {compact ? (
          <div className="asset-card__body asset-card__body--compact">
            {children}
          </div>
        ) : (
          children
        )}
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
  <div className={`asset-card__header ${className || ""}`} {...props}>
    {children}
  </div>
);

export const CardTitle = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={`asset-card__title ${className || ""}`} {...props}>
    {children}
  </h3>
);

export const CardDescription = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`asset-card__description ${className || ""}`} {...props}>
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
    className={`asset-card__body ${compact ? "asset-card__body--compact" : ""} ${className || ""}`}
    {...props}
  >
    {children}
  </div>
);
