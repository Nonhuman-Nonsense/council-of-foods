import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { METER_METHODOLOGY_PATH } from "@shared/MeterTypes";
import { Meter } from "./Meter";
import { MeterErrorBoundary } from "./MeterErrorBoundary";
import { Methodology } from "./Methodology";
import { startKioskHeartbeat } from "@/kioskHeartbeat";
import { startCursorAutoHide } from "@/cursorAutoHide";
import { scheduleNightlyReload } from "./reload";
import "./meter.css";

/**
 * Entry of the footprint meter page (meter.html, served at /meter). Deliberately imports nothing from
 * the council app, so the two can change independently.
 *
 * /meter/methodology  the page behind the QR code
 * ?venue=<id>         scope to a venue (as chosen on #staff)
 * ?rotate=90|-90      turn the meter a quarter clockwise / anticlockwise, for a display
 *                     the OS cannot rotate (the methodology page never rotates)
 * ?demo               TEMPORARY: fake data, to judge the screen without a live council
 */
const params = new URLSearchParams(window.location.search);
const isMethodology = window.location.pathname.replace(/\/$/, "") === METER_METHODOLOGY_PATH;
document.documentElement.dataset.page = isMethodology ? "methodology" : "meter";
const rotate = params.get("rotate");
if (!isMethodology && (rotate === "90" || rotate === "-90")) {
  document.documentElement.dataset.rotate = rotate;
}
// The meter runs unattended for months; the methodology page is a visitor's phone.
if (!isMethodology) {
  scheduleNightlyReload();
  startKioskHeartbeat(() => true);
  startCursorAutoHide();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isMethodology ? <Methodology /> : <MeterErrorBoundary><Meter /></MeterErrorBoundary>}
  </StrictMode>,
);
