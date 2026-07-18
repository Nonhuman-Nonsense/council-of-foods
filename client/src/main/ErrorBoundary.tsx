import { Component, type ErrorInfo, type ReactNode } from "react";
import { setUnrecoverableError } from "./overlay/errorStore";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches uncaught render-phase errors below it and routes them into the same
 * UnrecoverableError overlay used for API/socket failures, instead of a blank screen.
 * Renders nothing on error — Main.tsx swaps in <CouncilError> once `unrecoverableError`
 * is set, unmounting this boundary along with its broken subtree.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    setUnrecoverableError({
      message: error.message,
      source: "react-error-boundary",
      cause: { error, componentStack: info.componentStack },
    });
  }

  render(): ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}
