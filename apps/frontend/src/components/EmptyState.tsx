import type { ReactElement, ReactNode } from "react";
import { COLORS, Card } from "./ui.js";

interface EmptyStateProps {
  children: ReactNode;
  icon?: string;
  title?: string;
  action?: ReactNode;
}

export function EmptyState({
  children,
  icon,
  title,
  action,
}: EmptyStateProps): ReactElement {
  return (
    <Card
      style={{
        textAlign: "center",
        padding: "var(--space-3xl) var(--space-xl)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-md)",
      }}
    >
      {icon !== undefined && (
        <span
          role="img"
          aria-hidden="true"
          style={{ fontSize: "var(--text-3xl)", lineHeight: 1, opacity: 0.6 }}
        >
          {icon}
        </span>
      )}
      {title !== undefined && (
        <h3
          style={{
            margin: 0,
            fontSize: "var(--text-base)",
            fontWeight: "var(--fw-semibold)",
            color: COLORS.textPrimary,
          }}
        >
          {title}
        </h3>
      )}
      <div
        style={{
          color: COLORS.textMuted,
          fontSize: "var(--text-sm)",
          maxWidth: "28rem",
        }}
      >
        {children}
      </div>
      {action !== undefined && (
        <div style={{ marginTop: "var(--space-sm)" }}>{action}</div>
      )}
    </Card>
  );
}
