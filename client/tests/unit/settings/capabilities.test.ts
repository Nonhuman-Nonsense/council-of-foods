import { describe, expect, it } from "vitest";
import { capabilitiesFor, type Capabilities } from "@/settings/capabilities";
import { APP_MODES, type AppMode } from "@/settings/councilSettings";

/**
 * The table is the spec for what each install does, so it is asserted whole:
 * a capability added without a deliberate answer for every mode fails here.
 */
describe("capabilitiesFor", () => {
  const cases: Array<{ mode: AppMode; expected: Capabilities }> = [
    {
      mode: "web",
      expected: {
        selfHealing: false,
        autoRestart: false,
        idleAnswersForVisitor: false,
        idleNudge: true,
        autoReturnToLanding: false,
        browserUi: true,
        metaAgent: false,
        teleprompter: false,
        autoSubmitHumanInput: false,
        autoplay: false,
        cursorHide: false,
        micUpFront: false,
        micToggleButton: true,
        latchOnTap: true,
        voiceSetupAgent: false,
        agentWaitsForVisitor: true,
        typedSetup: true,
        installationReload: false,
        printSummary: false,
      },
    },
    {
      mode: "museum",
      expected: {
        selfHealing: true,
        autoRestart: true,
        idleAnswersForVisitor: true,
        idleNudge: true,
        autoReturnToLanding: true,
        browserUi: false,
        metaAgent: true,
        teleprompter: true,
        autoSubmitHumanInput: true,
        autoplay: true,
        cursorHide: true,
        micUpFront: true,
        micToggleButton: false,
        latchOnTap: false,
        voiceSetupAgent: true,
        agentWaitsForVisitor: false,
        typedSetup: false,
        installationReload: true,
        printSummary: true,
      },
    },
    {
      mode: "presenter",
      expected: {
        selfHealing: true,
        autoRestart: false,
        idleAnswersForVisitor: false,
        idleNudge: false,
        autoReturnToLanding: false,
        browserUi: false,
        metaAgent: true,
        teleprompter: true,
        autoSubmitHumanInput: true,
        autoplay: false,
        cursorHide: true,
        micUpFront: true,
        micToggleButton: false,
        latchOnTap: false,
        voiceSetupAgent: true,
        agentWaitsForVisitor: false,
        typedSetup: true,
        installationReload: true,
        printSummary: false,
      },
    },
  ];

  it.each(cases)("describes $mode", ({ mode, expected }) => {
    expect(capabilitiesFor(mode)).toEqual(expected);
  });

  it("answers for every mode staff can choose", () => {
    expect(cases.map((c) => c.mode)).toEqual([...APP_MODES]);
  });

  /**
   * The reason presenter exists: a person is standing next to the screen
   * talking, so nothing may advance, restart, or give up on its own.
   */
  it("leaves presenter with nothing that drives the app on a timer", () => {
    const presenter = capabilitiesFor("presenter");
    expect(presenter.autoplay).toBe(false);
    expect(presenter.autoRestart).toBe(false);
    expect(presenter.idleAnswersForVisitor).toBe(false);
    expect(presenter.idleNudge).toBe(false);
    expect(presenter.autoReturnToLanding).toBe(false);
  });

  /**
   * Presenter departs from museum in exactly three ways: nothing advances on a
   * timer, setup can be driven by hand, and nothing prints. Everything else is museum, and this
   * pins that so the two cannot drift apart one flag at a time.
   */
  it("differs from museum only in its timers, its typed setup and printing", () => {
    const museum = capabilitiesFor("museum");
    const presenter = capabilitiesFor("presenter");
    const differing = Object.keys(museum).filter(
      (key) => museum[key as keyof Capabilities] !== presenter[key as keyof Capabilities],
    );
    expect(differing.sort()).toEqual([
      "autoRestart",
      "autoplay",
      "autoReturnToLanding",
      "idleAnswersForVisitor",
      "idleNudge",
      "printSummary",
      "typedSetup",
    ].sort());
  });

  it("lets a presenter add panelists by hand while the agent still drives setup", () => {
    const presenter = capabilitiesFor("presenter");
    expect(presenter.typedSetup).toBe(true);
    expect(presenter.voiceSetupAgent).toBe(true);
    // No Next/Start buttons: stepping through setup is browser chrome, and a
    // screening keeps the installation's.
    expect(presenter.browserUi).toBe(false);
  });
});
