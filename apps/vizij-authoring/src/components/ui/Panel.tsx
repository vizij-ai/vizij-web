import type {
  ComponentPropsWithoutRef,
  PropsWithChildren,
  ReactNode,
} from "react";
import { Badge } from "./Badge";
import "./panel.css";

type BaseProps = {
  as?: React.ElementType;
  title?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
};

export type PanelProps<
  TTag extends keyof React.JSX.IntrinsicElements = "section",
> = PropsWithChildren<
  BaseProps &
    Omit<
      ComponentPropsWithoutRef<TTag>,
      "as" | "children" | "title" | "description" | "badge" | "actions"
    >
>;

/**
 * Standard panel wrapper that applies the shared sidebar panel styling and
 * handles a consistent header layout (title + description + badge/actions).
 */
export function Panel<
  TTag extends keyof React.JSX.IntrinsicElements = "section",
>({
  as,
  title,
  description,
  badge,
  actions,
  className,
  children,
  ...rest
}: PanelProps<TTag>) {
  const Component = (as ?? "section") as keyof React.JSX.IntrinsicElements;
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
      className={["sidebar__panel", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {hasHeader && (
        <header className="sidebar__panel-header">
          <div>
            {title ? <p className="sidebar__panel-title">{title}</p> : null}
            {description ? (
              <p className="sidebar__panel-description">{description}</p>
            ) : null}
          </div>
          {(badge || actions) && (
            <div className="sidebar__panel-meta">
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
