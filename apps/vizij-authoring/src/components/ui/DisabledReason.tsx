import { useId, type ReactElement } from "react";

/**
 * Says why a control is unavailable: as a tooltip (`title`), and as the
 * control's accessible description.
 *
 * Put `title` on the element the pointer reaches — a disabled `Button` takes
 * no pointer events, so for one that is a wrapper around it — spread
 * `describedBy` on the control, and render `description` beside it. With no
 * reason, all three are empty.
 */
export function useDisabledReason(reason: string | null | undefined): {
  title: string | undefined;
  describedBy: { "aria-describedby"?: string };
  description: ReactElement | null;
} {
  const id = useId();
  const text = reason?.trim() || null;
  if (!text) {
    return { title: undefined, describedBy: {}, description: null };
  }
  return {
    title: text,
    describedBy: { "aria-describedby": id },
    description: (
      <span id={id} className="sr-only">
        {text}
      </span>
    ),
  };
}
