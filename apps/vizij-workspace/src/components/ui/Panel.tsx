import type {
  ComponentPropsWithoutRef,
  PropsWithChildren,
  ReactNode,
  ElementType,
} from "react";
import type { JSX } from "react/jsx-runtime";
import { Info } from "lucide-react";
import { Badge } from "./Badge";
import { Tooltip } from "./Tooltip";
import { cn } from "../../utils/cn";

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
        "flex flex-col gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-200",
        className,
      )}
      {...rest}
    >
      {hasHeader && (
        <header className="flex justify-between items-center gap-4 min-h-[24px]">
          <div className="flex items-center gap-2 pl-1">
            {title ? (
              <p className="text-sm font-semibold text-slate-200 m-0 leading-tight pl-2">
                {title}
              </p>
            ) : null}
            {description ? (
              <Tooltip content={description} side="right">
                <Info className="w-3.5 h-3.5 text-slate-500 hover:text-blue-400 transition-colors cursor-help" />
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
