import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { Card, COLORS } from "../components/ui.js";

export function NotFound(): ReactElement {
  return (
    <div
      style={{
        padding: "var(--space-4xl) var(--space-xl)",
        textAlign: "center",
        animation: "axiom-fade-in 300ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1))",
      }}
    >
      <Card
        style={{
          maxWidth: "32rem",
          margin: "0 auto",
          padding: "var(--space-3xl) var(--space-2xl)",
        }}
      >
        <h1
          style={{
            fontSize: "var(--text-3xl)",
            fontWeight: "var(--fw-bold)",
            color: COLORS.bronzeLight,
            marginBottom: "var(--space-sm)",
            letterSpacing: "-0.03em",
            lineHeight: "var(--lh-tight)",
          }}
        >
          404
        </h1>
        <p
          style={{
            color: COLORS.textMuted,
            fontSize: "var(--text-base)",
            marginBottom: "var(--space-xl)",
            fontWeight: "var(--fw-regular)",
            lineHeight: "var(--lh-normal)",
          }}
        >
          This page doesn't exist or may have been moved.
        </p>
        <Link
          to="/"
          style={{
            display: "inline-block",
            padding: "0.625rem 1.5rem",
            borderRadius: "var(--radius-md)",
            background: COLORS.bronze,
            color: COLORS.bg,
            textDecoration: "none",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--fw-semibold)",
            transition: "color 0.18s ease, background 0.18s ease",
          }}
        >
          Back to Home
        </Link>
      </Card>
    </div>
  );
}

export default NotFound;
