import { describe, expect, it } from "vitest";
import { capabilitiesFor, type Capabilities } from "@/settings/capabilities";

/**
 * The table is the spec for what each install does, so it is asserted whole:
 * a capability added without a deliberate answer for both modes fails here.
 */
describe("capabilitiesFor", () => {
  const cases: Array<{ mode: "web" | "museum"; expected: Capabilities }> = [
    {
      mode: "web",
      expected: {
        unattended: false,
        browserUi: true,
        metaAgent: false,
        teleprompter: false,
        autoSubmitHumanInput: false,
        autoplay: false,
        cursorHide: false,
        micUpFront: false,
        micToggleButton: true,
        latchOnTap: true,
      },
    },
    {
      mode: "museum",
      expected: {
        unattended: true,
        browserUi: false,
        metaAgent: true,
        teleprompter: true,
        autoSubmitHumanInput: true,
        autoplay: true,
        cursorHide: true,
        micUpFront: true,
        micToggleButton: false,
        latchOnTap: false,
      },
    },
  ];

  it.each(cases)("describes $mode", ({ mode, expected }) => {
    expect(capabilitiesFor(mode)).toEqual(expected);
  });
});
