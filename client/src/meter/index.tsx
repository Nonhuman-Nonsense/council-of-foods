import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Meter } from "./Meter";
import "./meter.css";

/**
 * Entry of the footprint meter page (meter.html → /meter). Deliberately imports nothing from
 * the council app, so the two can change independently.
 *
 * ?installation=<id>  scope to an installation (as set on #staff)
 * ?rotate=90|-90      rotate the page for a display the OS cannot rotate
 * ?demo               TEMPORARY: fake data, to judge the screen without a live council
 */
const rotate = new URLSearchParams(window.location.search).get("rotate");
if (rotate === "90" || rotate === "-90") {
  document.documentElement.dataset.rotate = rotate;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Meter />
  </StrictMode>,
);
