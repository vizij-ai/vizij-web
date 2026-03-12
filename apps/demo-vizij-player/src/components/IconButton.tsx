type IconName =
  | "play"
  | "pause"
  | "stop"
  | "loop"
  | "pulse"
  | "hold"
  | "reset"
  | "sun"
  | "moon";

type IconButtonProps = {
  icon: IconName;
  label: string;
  active?: boolean;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
};

function Icon({ icon }: { icon: IconName }) {
  switch (icon) {
    case "play":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 3.2 12.2 8 4 12.8V3.2Z" fill="currentColor" />
        </svg>
      );
    case "pause":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 3h3v10H4V3Zm5 0h3v10H9V3Z" fill="currentColor" />
        </svg>
      );
    case "stop":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="4" y="4" width="8" height="8" rx="1.2" fill="currentColor" />
        </svg>
      );
    case "loop":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M11.2 4.1h-4a3.6 3.6 0 1 0 0 7.2h1.1V9.9H7.2a2.2 2.2 0 1 1 0-4.4h4V3.7L14 5.8l-2.8 2.1V6.1Zm-2.4 1.6h1.4a2.2 2.2 0 1 1 0 4.4H6.1v1.4h4.1a3.6 3.6 0 1 0 0-7.2H8.8v1.4Z"
            fill="currentColor"
          />
        </svg>
      );
    case "pulse":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M2 8h2.5l1.2-2.8L8 11l1.6-4h4.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "hold":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M6.2 7.4V3.9a1 1 0 1 1 2 0v3m-4.1.7V5.8a1 1 0 1 1 2 0v1.8m4.1-.2V4.8a1 1 0 1 1 2 0v4.1l.7.7a1.9 1.9 0 0 1 .6 1.3v.9A2.2 2.2 0 0 1 12 14H8.7a2.6 2.6 0 0 1-1.8-.7L4.3 11a1 1 0 1 1 1.4-1.4l.5.5Z"
            fill="currentColor"
          />
        </svg>
      );
    case "reset":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 3.2a4.8 4.8 0 1 1-3.6 1.6H2V3l2.7.1-.9.9A6 6 0 1 0 8 2c1.8 0 3.4.7 4.6 1.9l-.9.9A4.6 4.6 0 0 0 8 3.2Z"
            fill="currentColor"
          />
        </svg>
      );
    case "sun":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="2.7" fill="currentColor" />
          <path
            d="M8 1.6v1.8M8 12.6v1.8M1.6 8h1.8M12.6 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
    case "moon":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M10.9 1.9A5.8 5.8 0 1 0 14 12.2a5.4 5.4 0 0 1-3 .8A5.9 5.9 0 0 1 5.1 7c0-2.1 1.1-4 2.8-5.1a5.7 5.7 0 0 0 3 .8Z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

export function IconButton({
  icon,
  label,
  active = false,
  className = "",
  disabled = false,
  onClick,
}: IconButtonProps) {
  const classes = ["icon-button", active ? "is-active" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon icon={icon} />
    </button>
  );
}
