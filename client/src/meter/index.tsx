import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Meter } from "./Meter";
import { Methodology } from "./Methodology";
import "./meter.css";

/**
 * Entry of the footprint meter page (meter.html → /meter). Deliberately imports nothing from
 * the council app, so the two can change independently.
 *
 * /meter/methodology  the page behind the QR code (in dev: /meter.html?page=methodology)
 * ?venue=<id>         scope to a venue (as chosen on #staff)
 * ?rotate=90|-90      rotate the page for a display the OS cannot rotate
 * ?demo               TEMPORARY: fake data, to judge the screen without a live council
 */
const params = new URLSearchParams(window.location.search);
const isMethodology = window.location.pathname.endsWith("/methodology") || params.get("page") === "methodology";
if (isMethodology) {
  document.documentElement.dataset.page = "methodology";
}
const rotate = params.get("rotate");
if (rotate === "90" || rotate === "-90") {
  document.documentElement.dataset.rotate = rotate;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isMethodology ? <Methodology /> : <Meter />}
  </StrictMode>,
);
