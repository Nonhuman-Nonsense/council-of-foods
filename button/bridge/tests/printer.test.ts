import { describe, expect, it } from "vitest";
import { buildLpArgs, parseDefaultPrinter, parsePrinterDetails, parseQueuedJobs } from "../src/printer.js";

describe("lp arguments", () => {
  it("prints A4 to the system default unless a printer is named", () => {
    expect(buildLpArgs("/spool/a.pdf", "Council meeting 1", null)).toEqual([
      "-o", "media=A4", "-t", "Council meeting 1", "/spool/a.pdf",
    ]);
    expect(buildLpArgs("/spool/a.pdf", "t", "Museum_Printer")).toEqual([
      "-d", "Museum_Printer", "-o", "media=A4", "-t", "t", "/spool/a.pdf",
    ]);
  });
});

describe("lpstat parsing", () => {
  it.each([
    ["system default destination: Xerox_Transit_Printer\n", "Xerox_Transit_Printer"],
    ["no system default destination\n", null],
    ["", null],
  ])("default printer from %j", (output, expected) => {
    expect(parseDefaultPrinter(output)).toBe(expected);
  });

  it.each([
    {
      name: "idle, no alerts",
      output:
        "printer Museum is idle.  enabled since Thu Sep  3 15:14:13 2026\n\tForm mounted:\n\tAlerts: none\n\tLocation: \n",
      expected: { state: "idle", alerts: [], message: null },
    },
    {
      name: "printing",
      output: "printer Museum now printing Museum-12.  enabled since Thu Sep  3 15:14:13 2026\n\tAlerts: none\n",
      expected: { state: "printing", alerts: [], message: null },
    },
    {
      name: "stopped, out of paper",
      output:
        "printer Museum disabled since Thu Sep  3 15:14:13 2026 -\n\tMedia Empty\n\tForm mounted:\n\tAlerts: media-empty-error media-needed\n",
      expected: {
        state: "stopped",
        alerts: ["media-empty-error", "media-needed"],
        message: "Media Empty",
      },
    },
    {
      name: "unrecognized",
      output: "something else\n",
      expected: { state: "unknown", alerts: [], message: null },
    },
  ])("printer details: $name", ({ output, expected }) => {
    expect(parsePrinterDetails(output)).toEqual(expected);
  });

  it.each([
    { name: "an empty queue", output: "", expected: { queuedJobs: 0, oldestJobAt: null } },
    {
      name: "two waiting jobs",
      output:
        "Museum_Printer-13      root           20480   Wed Sep 16 15:05:00 2026\n" +
        "Museum_Printer-12      root          102400   Wed Sep 16 15:00:00 2026\n",
      expected: { queuedJobs: 2, oldestJobAt: new Date("Wed Sep 16 15:00:00 2026").toISOString() },
    },
    {
      name: "a printer name with dashes",
      output: "HP-LaserJet-Pro-7      root           20480   Wed Sep 16 15:05:00 2026\n",
      expected: { queuedJobs: 1, oldestJobAt: new Date("Wed Sep 16 15:05:00 2026").toISOString() },
    },
  ])("queued jobs: $name", ({ output, expected }) => {
    expect(parseQueuedJobs(output)).toEqual(expected);
  });
});
