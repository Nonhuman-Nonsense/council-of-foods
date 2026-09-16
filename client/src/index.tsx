import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { applyZIndexCssVariables } from "@/zIndexLayers";
import { installGlobalErrorHandlers } from "@/logger";
import { installSignOfLife } from "@/signOfLife";

applyZIndexCssVariables();
installGlobalErrorHandlers();
installSignOfLife();

const container = document.getElementById("root");
if (!container) throw new Error("Failed to find the root element");
const root = ReactDOM.createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);