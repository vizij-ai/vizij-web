import type { ReactNode } from "react";

export type SectionIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  kicker?: ReactNode;
};

export function SectionIntro({
  eyebrow,
  title,
  description,
  kicker,
}: SectionIntroProps) {
  return (
    <div className="section-header">
      <p className="section-eyebrow">{eyebrow}</p>
      <h2 className="section-title">{title}</h2>
      <p className="section-description">{description}</p>
      {kicker ? <div className="section-kicker">{kicker}</div> : null}
    </div>
  );
}
