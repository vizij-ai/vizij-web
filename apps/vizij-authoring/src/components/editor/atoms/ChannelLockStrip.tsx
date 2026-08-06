import type { CSSProperties } from "react";
import { Lock, LockOpen } from "lucide-react";
import { cn } from "../../../utils/cn";

export interface ChannelLockStripChannel {
  /**
   * Identity of the lockable thing, passed straight back to `onToggle`.
   * `null` means this channel exists but is not lockable (nothing is bound to
   * it yet) — the pill renders disabled.
   */
  id: string | null;
  /**
   * The one- or two-character label shown in the pill: `X`/`Y`/`Z`, `R`/`G`/`B`.
   * Callers truncate; the strip does not, so a caller that wants a longer label
   * gets one.
   */
  shortLabel: string;
  locked: boolean;
  /** Tooltip. Defaults to nothing; the pill's text is the only other cue. */
  title?: string;
}

export interface ChannelLockStripProps {
  channels: ChannelLockStripChannel[];
  /** Called with the channel's `id` and the state it should move to. */
  onToggle: (id: string, nextLocked: boolean) => void;
  className?: string;
  /** Applied to every pill, for callers that need to change the pill metrics. */
  channelClassName?: string;
}

/**
 * A row of per-channel lock pills — the "which components of this property are
 * editable" control that sits under a vector or colour row.
 *
 * Distinct from `ChannelLockButton`, which locks the row as a whole: this one is
 * per channel and each pill carries its own label, so a user can see at a glance
 * that Y is driven while X and Z are free.
 *
 * Unlocked (editable) is the accented, "live" state and locked is the recessive
 * one — the inverse of `ChannelLockButton`, and deliberate: here the accent
 * marks what you can still touch.
 */
export function ChannelLockStrip({
  channels,
  onToggle,
  className,
  channelClassName,
}: ChannelLockStripProps) {
  return (
    <div className={cn("flex gap-1.5 flex-1", className)}>
      {channels.map((channel, index) => {
        const disabled = channel.id === null;
        return (
          <button
            key={channel.id ?? `channel-${index}`}
            type="button"
            title={channel.title}
            className={cn(
              "flex items-center justify-center gap-1.5 flex-1 h-5 rounded-sm",
              "border border-transparent transition-colors",
              "text-[10px] font-bold uppercase tracking-wider",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              !disabled && "hover:bg-[var(--editor-channel-hover-bg)]",
              channelClassName,
            )}
            style={
              channel.locked
                ? ({
                    backgroundColor:
                      "color-mix(in srgb, var(--editor-row-bg, var(--bg-hover)) 50%, transparent)",
                    color: "var(--editor-muted-fg, var(--text-muted))",
                    "--editor-channel-hover-bg":
                      "color-mix(in srgb, var(--editor-row-bg, var(--bg-hover)) 70%, transparent)",
                  } as CSSProperties)
                : ({
                    backgroundColor:
                      "color-mix(in srgb, var(--editor-accent, var(--color-accent)) 10%, transparent)",
                    color: "var(--editor-accent, var(--color-accent))",
                    "--editor-channel-hover-bg":
                      "color-mix(in srgb, var(--editor-accent, var(--color-accent)) 20%, transparent)",
                  } as CSSProperties)
            }
            disabled={disabled}
            onClick={() => {
              if (channel.id === null) {
                return;
              }
              onToggle(channel.id, !channel.locked);
            }}
          >
            {channel.locked ? (
              <Lock size={10} className="shrink-0" />
            ) : (
              <LockOpen size={10} className="shrink-0" />
            )}
            <span>{channel.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
