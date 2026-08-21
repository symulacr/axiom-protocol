import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./axiom/Controls.js";
import { humanizeError } from "../utils/format.js";
import { useUiStore } from "../lib/uiStore.js";
import { getCopy } from "../lib/copy.js";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** P4: the fallback chrome routes through copy.ts (locale via useUiStore) and
 *  the Controls kit — ErrorBoundary no longer imports the v1 ui.tsx kit. The
 *  raw error sentence still flows through humanizeError (central, en — known
 *  residual; error copy is the remaining untranslated surface). */
function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}) {
  const { state } = useUiStore();
  const copy = getCopy(state.settings.locale).errorBoundary;
  const isNetworkError =
    error?.name === "NetworkError" ||
    error?.message.toLowerCase().includes("failed to fetch") ||
    error?.message.toLowerCase().includes("load failed");
  return (
    <div className="ops-page cosign-panel" role="alert">
      <div className="review-error">
        <div>
          <strong>
            {isNetworkError ? copy.networkTitle : copy.genericTitle}
          </strong>
          <p>
            {isNetworkError
              ? copy.networkBody
              : error
                ? humanizeError(error)
                : copy.networkBody}
          </p>
        </div>
      </div>
      <div className="review-handoff-actions">
        <Button variant="secondary" onClick={onRetry}>
          {copy.retry}
        </Button>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          {copy.reload}
        </Button>
      </div>
    </div>
  );
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

      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.resetErrorBoundary}
        />
      );
    }
    return this.props.children;
  }
}
