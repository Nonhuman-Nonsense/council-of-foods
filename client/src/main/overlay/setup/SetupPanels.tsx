import type { ReactElement, ReactNode } from "react";

export function SetupPanel(props: {
  title: string;
  fullWidth?: boolean;
  children: ReactNode;
  testId?: string;
}): ReactElement {
  const { title, fullWidth = false, children, testId } = props;
  return (
    <section
      className={`setup-panel${fullWidth ? " setup-panel--full" : ""}`}
      data-testid={testId}
    >
      <h3 className="setup-panel__title">{title}</h3>
      {children}
    </section>
  );
}

export function SetupSegmented(props: {
  children: ReactNode;
  testId?: string;
}): ReactElement {
  return (
    <div className="setup-segmented" data-testid={props.testId}>
      {props.children}
    </div>
  );
}

export function SetupStatusChip(props: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "error" | "idle";
  testId?: string;
}): ReactElement {
  const tone = props.tone ?? "idle";
  return (
    <span className="setup-status-chip" data-testid={props.testId}>
      <span className={`setup-status-chip__dot setup-status-chip__dot--${tone}`} />
      <span>
        {props.label}: {props.value}
      </span>
    </span>
  );
}

export function SetupCollapsible(props: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}): ReactElement {
  const { label, children, defaultOpen = false, testId } = props;
  return (
    <details className="setup-collapsible" open={defaultOpen} data-testid={testId}>
      <summary className="setup-collapsible__toggle">{label}</summary>
      <div className="setup-collapsible__body">{children}</div>
    </details>
  );
}
