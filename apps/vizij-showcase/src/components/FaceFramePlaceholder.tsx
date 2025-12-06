import type { ReactNode } from "react";

type FaceFramePlaceholderProps = {
  variant?: "sm" | "md" | "lg";
  label?: string;
  subtitle?: string;
  message?: ReactNode;
};

export function FaceFramePlaceholder({
  variant = "md",
  label,
  subtitle,
  message = "Vizij runtime will load when you reach this section.",
}: FaceFramePlaceholderProps) {
  const className = [
    "face-frame",
    `face-frame--${variant}`,
    "face-frame--placeholder",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      {(label || subtitle) && (
        <div className="face-frame__meta">
          {label && <p className="face-frame__label">{label}</p>}
          {subtitle && <p className="face-frame__subtitle">{subtitle}</p>}
        </div>
      )}
      <div className="face-frame__canvas face-frame__canvas--placeholder">
        <div className="face-frame__status">{message}</div>
      </div>
    </div>
  );
}
