import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { applyZIndexCssVariables } from "@/zIndexLayers";
import { installGlobalErrorHandlers, installPageLifecycleLogging } from "@/logger";
import { installServerLogSink } from "@/logging/serverLogSink";
import { installSignOfLife } from "@/signOfLife";
import { startKioskHeartbeat } from "@/kioskHeartbeat";
import { getCapabilities } from "@/settings/councilSettings";
import { findMissingFeatures } from "@/browserSupport";
import { useErrorStore } from "@main/overlay/errorStore";

applyZIndexCssVariables();
installGlobalErrorHandlers();
// Lifecycle first: its "page closing" line must be queued before the sink's last flush.
installPageLifecycleLogging();
installServerLogSink();
installSignOfLife();
startKioskHeartbeat(() => getCapabilities().kioskHeartbeat);

// index.html already told a browser too old for the bundle; React would only paint over it.
if (!document.documentElement.hasAttribute("data-unsupported")) {
  const container = document.getElementById("root");
  if (!container) throw new Error("Failed to find the root element");
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // Alongside startup, not before it: supported browsers wait for nothing.
  void findMissingFeatures().then((missing) => {
    if (missing.length > 0) useErrorStore.getState().setUnsupportedBrowser(missing);
  });
}