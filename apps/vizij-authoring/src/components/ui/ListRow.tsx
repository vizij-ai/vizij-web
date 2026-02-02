import type { ReactNode, HTMLAttributes } from "react";
import "./listrow.css";

interface ListRowProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "children"> {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

export function ListRow({
  title,
  meta,
  actions,
  description,
  className,
  children,
  ...rest
}: ListRowProps) {
  return (
    <div
      className={["list-row", className].filter(Boolean).join(" ")}
      {...rest}
    >
      <div className="list-row__header">
        <div className="list-row__text">
          <div className="list-row__title">{title}</div>
          {description ? (
            <div className="list-row__description">{description}</div>
          ) : null}
        </div>
        <div className="list-row__meta">
          {meta ? <div className="list-row__meta-item">{meta}</div> : null}
          {actions ? <div className="list-row__actions">{actions}</div> : null}
        </div>
      </div>
      {children ? <div className="list-row__body">{children}</div> : null}
    </div>
  );
}
