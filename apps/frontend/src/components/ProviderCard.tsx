import type { MouseEvent, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { getAddress } from "viem";

import type { Provider } from "../hooks/useProviders";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { Card, Button, MonoLabel, COLORS } from "./ui.js";

function formatAddress(raw: `0x${string}`): string {
  try {
    return getAddress(raw);
  } catch {
    return raw;
  }
}

export function ProviderCard({
  provider,
}: {
  provider: Provider;
}): ReactElement {
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const addressLabel = formatAddress(provider.address);

  const onUse = (e: MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    navigate(`/app?mint=1&provider=${provider.address}`);
  };

  return (
    <Card
      hover
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-xs)",
        width: isMobile ? "100%" : "260px",
        boxSizing: "border-box",
      }}
    >
      <MonoLabel>{addressLabel}</MonoLabel>
      <div
        style={{
          fontSize: "var(--text-sm)",
          color: COLORS.textPrimary,
          fontWeight: "var(--fw-medium)",
          marginTop: "2px",
        }}
      >
        {provider.model}
      </div>
      <div
        style={{
          fontSize: "var(--text-xs)",
          color: COLORS.textDim,
          fontFamily: "var(--font-mono)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={provider.endpoint}
      >
        {provider.endpoint}
      </div>
      {provider.price && (
        <div style={{ fontSize: "var(--text-xs)", color: COLORS.textMuted }}>
          {provider.price} 0G/token
        </div>
      )}
      <Button
        variant="secondary"
        onClick={onUse}
        style={{ marginTop: "var(--space-sm)" }}
      >
        Use this provider
      </Button>
    </Card>
  );
}

export default ProviderCard;
