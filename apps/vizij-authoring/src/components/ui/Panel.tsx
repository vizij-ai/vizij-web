import type {
  ComponentPropsWithoutRef,
  PropsWithChildren,
  ReactNode,
  ElementType,
} from "react";
import type { JSX } from "react/jsx-runtime";
import { Info } from "lucide-react";
import { cn } from "../../utils/cn";
import { Badge } from "./Badge";
import { Tooltip } from "./Tooltip";

type BaseProps = {
  as?: ElementType;
  title?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
};

export type PanelProps<TTag extends keyof JSX.IntrinsicElements = "section"> =
  PropsWithChildren<
    BaseProps &
      Omit<
        ComponentPropsWithoutRef<TTag>,
        "as" | "children" | "title" | "description" | "badge" | "actions"
      >
  >;

/**
 * Standard panel wrapper that applies the shared sidebar panel styling and
 * handles a consistent header layout (title + description + badge/actions).
 *
 * Built on `@semio/ui`'s `.card-transparent`, which is the closest analogue to
 * this app's panel treatment: a translucent surface
 * (`--color-layout-{light,dark}-deep-inset` at 80%, rebranded to Vizij in
 * styles.css), `backdrop-blur-lg`, and a token-driven `outline` rather than a
 * border. `.responsive` must be on the same element — it seeds
 * `--card-border-color`, which the outline colour reads.
 *
 * `rounded-xl` overrides semio's `rounded-md` to keep the app's shape language;
 * utilities beat `@layer components` so no specificity fight is involved.
 */
export function Panel<TTag extends keyof JSX.IntrinsicElements = "section">({
  as,
  title,
  description,
  badge,
  actions,
  className,
  children,
  ...rest
}: PanelProps<TTag>) {
  const Component = (as ?? "section") as keyof JSX.IntrinsicElements;
  const hasHeader = Boolean(title || description || badge || actions);

  const renderBadge = () => {
    if (badge === undefined || badge === null || badge === false) return null;
    return typeof badge === "string" || typeof badge === "number" ? (
      <Badge>{badge}</Badge>
    ) : (
      badge
    );
  };

  if (Component !== "section") {
    console.warn(
      "[Panel] custom `as` tags are temporarily disabled; falling back to <section>.",
    );
  }

  return (
    <section
      className={cn(
        "responsive card-transparent rounded-xl",
        "flex flex-col gap-3 p-3 text-text-primary",
        className,
      )}
      {...rest}
    >
      {hasHeader && (
        <header className="flex justify-between items-center gap-4 min-h-[24px]">
          <div className="flex items-center gap-2 pl-1">
            {title ? (
              <p className="text-sm font-semibold text-text-primary m-0 leading-tight pl-2">
                {title}
              </p>
            ) : null}
            {description ? (
              <Tooltip content={description} side="right">
                <Info className="w-3.5 h-3.5 text-text-secondary hover:text-accent transition-colors cursor-help" />
              </Tooltip>
            ) : null}
          </div>
          {(badge || actions) && (
            <div className="flex items-center gap-2 shrink-0">
              {actions}
              {renderBadge()}
            </div>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

Panel.displayName = "Panel";
