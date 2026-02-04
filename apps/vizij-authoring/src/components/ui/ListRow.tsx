import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

interface ListRowProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "title" | "children"
> {
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
      className={cn(
        "border border-border-default/60 rounded-xl bg-bg-panel/40 p-4 shrink-0 flex flex-col gap-2 transition-all hover:bg-bg-hover hover:border-border-default shadow-sm cursor-pointer active:bg-bg-active active:scale-[0.99]",
        className,
      )}
      {...rest}
    >
      <div className="flex justify-between gap-3 items-start">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="font-bold text-text-primary text-[13px] leading-tight">
            {title}
          </div>
          {description ? (
            <div className="text-text-muted text-[11px] leading-relaxed">
              {description}
            </div>
          ) : null}
        </div>
        <div className="inline-flex items-center gap-2 shrink-0">
          {meta ? (
            <div className="text-[10px] text-text-secondary font-medium">
              {meta}
            </div>
          ) : null}
          {actions ? (
            <div className="flex items-center gap-1.5">{actions}</div>
          ) : null}
        </div>
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
