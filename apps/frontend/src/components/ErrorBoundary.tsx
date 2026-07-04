import { Component, type ErrorInfo, type ReactNode } from "react";
import { COLORS } from "./ui.js";
import { humanizeError } from "../utils/format.js";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private resetErrorBoundary = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isNetworkError =
        this.state.error?.name === "NetworkError" ||
        this.state.error?.message.toLowerCase().includes("failed to fetch") ||
        this.state.error?.message.toLowerCase().includes("load failed");

      return (
        <div
          role="alert"
          style={{
            padding: 24,
            margin: 24,
            border: `1px solid ${COLORS.dangerBorder}`,
            borderRadius: "var(--radius-lg)",
            background: COLORS.dangerBg,
            color: COLORS.danger,
            fontSize: "var(--text-sm)",
          }}
        >
          <h2
            style={{
              fontSize: "var(--text-base)",
              fontWeight: "var(--fw-semibold)",
              margin: "0 0 8px",
            }}
          >
            {isNetworkError ? "Connection problem" : "Something went wrong"}
          </h2>
          <p style={{ margin: "0 0 12px", lineHeight: "var(--lh-normal)" }}>
            {isNetworkError
              ? "Unable to load this section. Check your internet connection and try again."
              : this.state.error
                ? humanizeError(this.state.error)
                : "An unexpected error occurred."}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={this.resetErrorBoundary}
              style={{
                padding: "6px 16px",
                background: COLORS.danger,
                color: COLORS.text,
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "var(--text-sm)",
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "6px 16px",
                background: "transparent",
                color: COLORS.danger,
                border: `1px solid ${COLORS.dangerBorder}`,
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "var(--text-sm)",
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
