import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { Card, COLORS, Button } from "../components/ui.js";

function NotFound(): ReactElement {
  const { isConnected } = useAccount();
  return (
    <div
      style={{
        padding: "var(--space-4xl) var(--space-xl)",
        textAlign: "center",
        animation: "axiom-fade-in var(--dur-landing) var(--ease-out)",
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
          to={isConnected ? "/app" : "/"}
          style={{ textDecoration: "none" }}
        >
          <Button variant="primary">
            {isConnected ? "Back to your agents" : "Back to Home"}
          </Button>
        </Link>
      </Card>
    </div>
  );
}

export default NotFound;
