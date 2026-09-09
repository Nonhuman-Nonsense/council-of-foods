import { describe, it, expect } from "vitest";
import { errorCopy } from "@main/overlay/errorCopy";
import type { TFunction } from "i18next";

const t = ((key: string) => `translated:${key}`) as unknown as TFunction;

describe("errorCopy", () => {
  // The compat contract: client and server ship independently, so anything the
  // client cannot name must still say something useful.
  it.each([
    { label: "a known key", errorKey: "busy" as const, expected: "translated:error.busyTerminal" },
    { label: "no key at all", errorKey: undefined, expected: "server prose" },
    { label: "a key from a newer server", errorKey: "notInvented" as never, expected: "server prose" },
    // Nothing useful to say beyond the generic apology the caller supplies.
    { label: "an unexpected failure", errorKey: "unexpected" as const, expected: "server prose" },
  ])("uses $label", ({ errorKey, expected }) => {
    expect(errorCopy(t, errorKey, "server prose")).toBe(expected);
  });
});
