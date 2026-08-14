import type { CSSProperties, ReactElement } from "react";
import { useProviders } from "../hooks/useProviders.js";
import {
  Button,
  Card,
  COLORS,
  MonoLabel,
  SectionTitle,
  Skeleton,
  mutedTextSm,
} from "./ui.js";
import { truncateAddress } from "../utils/format.js";

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "8px 0",
  borderBottom: "1px solid var(--border)",
  fontSize: "var(--text-sm)",
};

/**
 * Compact list of 0G compute providers (router models). Fail-soft: a network
 * error or 403 renders an inline error row with retry instead of breaking the page.
 */
export function ProviderPanel(): ReactElement {
  const { data, isLoading, error, refetch } = useProviders();
  const services = data?.services ?? [];

  if (isLoading && services.length === 0) {
    return (
      <Card style={{ marginBottom: "var(--space-xl)" }}>
        <SectionTitle>Compute providers</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton height={20} />
          <Skeleton height={20} />
          <Skeleton height={20} />
        </div>
      </Card>
    );
  }

  if (error !== null) {
    return (
      <Card style={{ marginBottom: "var(--space-xl)" }}>
        <SectionTitle>Compute providers</SectionTitle>
        <p style={mutedTextSm}>
          Couldn't load compute providers.{" "}
          <Button
            variant="ghost"
            style={{ padding: 0, textDecoration: "underline" }}
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </p>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: "var(--space-xl)" }}>
      <SectionTitle>Compute providers</SectionTitle>
      {services.length === 0 ? (
        <p style={mutedTextSm}>No compute providers available.</p>
      ) : (
        <div>
          {services.map((p) => (
            <div key={p.model} style={rowStyle}>
              <strong
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {p.model}
              </strong>
              <MonoLabel copyable text={p.address} title={p.address}>
                {truncateAddress(p.address)}
              </MonoLabel>
              {p.price !== undefined && (
                <span style={{ color: COLORS.textMuted, marginLeft: "auto" }}>
                  {p.price}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
