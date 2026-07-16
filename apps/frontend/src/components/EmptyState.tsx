import type { ReactElement, ReactNode } from "react";
import { BRAND } from "../brand/assets.js";
import { COLORS, Card } from "./ui.js";

interface EmptyStateProps {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
  /** When true, shows agent-lattice empty motif. */
  illustrated?: boolean;
  imageSrc?: string;
  imageAlt?: string;
}

export function EmptyState({
  children,
  title,
  action,
  illustrated = false,
  imageSrc,
  imageAlt = "",
}: EmptyStateProps): ReactElement {
  const src = imageSrc ?? (illustrated ? BRAND.emptyAgents : undefined);

  return (
    <Card
      className="card-layered"
      style={{
        textAlign: "center",
        padding: "var(--space-3xl) var(--space-xl)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-md)",
      }}
    >
      {src !== undefined && (
        <img
          src={src}
          alt={imageAlt}
          width={320}
          height={180}
          loading="lazy"
          decoding="async"
          style={{
            width: "min(100%, 20rem)",
            height: "auto",
            borderRadius: "var(--radius-md)",
            border: `1px solid ${COLORS.border}`,
            objectFit: "cover",
            opacity: 0.92,
          }}
        />
      )}
      {title !== undefined && (
        <h3
          style={{
            margin: 0,
            fontSize: "var(--text-base)",
            fontWeight: "var(--fw-semibold)",
            color: COLORS.textPrimary,
            fontFamily: "var(--font-display)",
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
