import React from "react";

const fontStack =
  'Inter, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

const baseText = "#e2e8f0";
const mutedText = "#94a3b8";
const borderColor = "rgba(148,163,184,0.3)";
const cardBg = "#0f172a";
const pageBg = "#020617";

export const minimalDemoTheme = {
  text: baseText,
  muted: mutedText,
  border: borderColor,
  card: cardBg,
  surface: pageBg,
  code: "#050f23",
} as const;

const baseTextStyles: React.CSSProperties = {
  color: baseText,
  fontFamily: fontStack,
  lineHeight: 1.5,
};

export type MinimalDemoChromeProps = {
  title: string;
  description?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: number | string;
  gap?: number;
};

export function MinimalDemoChrome({
  title,
  description,
  subtitle,
  actions,
  children,
  maxWidth = 1120,
  gap = 24,
}: MinimalDemoChromeProps) {
  return (
    <div
      style={{
        ...baseTextStyles,
        minHeight: "100vh",
        background: minimalDemoTheme.surface,
        padding: "32px 16px 64px",
        colorScheme: "dark",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap,
        }}
      >
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: "1 1 320px", minWidth: 280 }}>
            {subtitle ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  textTransform: "uppercase",
                  letterSpacing: 0.1,
                  color: mutedText,
                }}
              >
                {subtitle}
              </p>
            ) : null}
            <h1
              style={{
                margin: "4px 0 12px",
                fontSize: "clamp(1.75rem, 3vw, 2.4rem)",
                lineHeight: 1.2,
              }}
            >
              {title}
            </h1>
            {description ? (
              <p
                style={{
                  margin: 0,
                  maxWidth: 720,
                  color: mutedText,
                }}
              >
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div style={{ flex: "0 0 auto", display: "flex", gap: 8 }}>
              {actions}
            </div>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}

export type MinimalDemoSectionProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padding?: string;
};

export function MinimalDemoSection({
  title,
  description,
  actions,
  children,
  padding = "24px",
}: MinimalDemoSectionProps) {
  return (
    <section
      style={{
        background: minimalDemoTheme.card,
        borderRadius: 14,
        border: `1px solid ${minimalDemoTheme.border}`,
        padding,
        boxShadow: "0 20px 50px rgba(2,6,23,0.65)",
      }}
    >
      {(title || description || actions) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "space-between",
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            {title ? (
              <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>{title}</h2>
            ) : null}
            {description ? (
              <p style={{ margin: 0, color: minimalDemoTheme.muted }}>
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div style={{ flex: "0 0 auto", display: "flex", gap: 8 }}>
              {actions}
            </div>
          ) : null}
        </div>
      )}
      {children}
    </section>
  );
}

export type MinimalDemoPanelProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export function MinimalDemoPanel({
  title,
  description,
  footer,
  children,
}: MinimalDemoPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {title ? <h3 style={{ margin: 0 }}>{title}</h3> : null}
      {description ? (
        <p style={{ margin: 0, color: minimalDemoTheme.muted }}>
          {description}
        </p>
      ) : null}
      <div
        style={{
          border: `1px solid ${minimalDemoTheme.border}`,
          borderRadius: 10,
          background: minimalDemoTheme.card,
          padding: "16px",
        }}
      >
        {children}
      </div>
      {footer ? (
        <div style={{ color: minimalDemoTheme.muted }}>{footer}</div>
      ) : null}
    </div>
  );
}

export function MinimalDemoDivider() {
  return (
    <hr
      style={{
        border: "none",
        borderTop: `1px solid ${minimalDemoTheme.border}`,
        margin: "24px 0",
      }}
    />
  );
}
