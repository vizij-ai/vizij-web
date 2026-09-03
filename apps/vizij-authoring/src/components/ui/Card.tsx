import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
}

/**
 * Card surface, built on `@semio/ui`'s `.card`.
 *
 * `.card` supplies the surface colour (`--color-layout-{light,dark}-inset`,
 * rebranded to Vizij in styles.css), a token-driven border colour
 * (`--card-border-color`) and elevation. `.responsive` must sit on the same
 * element — it is what seeds those custom properties, and without it the border
 * colour resolves to nothing.
 *
 * `rounded-xl` deliberately overrides semio's `rounded-sm`: the 2px radius is
 * inconsistent with both this app's shape language and Semio's own Figma
 * library. Utilities win over `@layer components`, so this is a plain override
 * rather than a fight. `.card` carries no padding, hence `p-3`.
 *
 * The `.asset-card__*` content classes used by feature panels are defined
 * standalone in styles.css, so they no longer depend on this component emitting
 * an `.asset-card` ancestor.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, compact, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("responsive card rounded-xl p-3", className)}
      {...props}
    >
      {compact ? (
        <div className="asset-card__body asset-card__body--compact">
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  ),
);

Card.displayName = "Card";

export const CardHeader = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("asset-card__header", className)} {...props}>
    {children}
  </div>
);

export const CardTitle = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("asset-card__title", className)} {...props}>
    {children}
  </h3>
);

export const CardDescription = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("asset-card__description", className)} {...props}>
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
    className={cn(
      "asset-card__body",
      compact && "asset-card__body--compact",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
