// @vitest-environment node
import { describe, it, expect } from "vitest";
import { emphasisRuns } from "@council/output/emphasis";

const plain = (text: string) => ({ text, italic: false });
const italic = (text: string) => ({ text, italic: true });

describe("emphasisRuns", () => {
  it.each([
    { case: "text without asterisks", sentences: ["Hello world."], runs: [[plain("Hello world.")]] },
    {
      case: "a stage direction",
      sentences: ["*hooves shuffle nervously*", "Oh, hello."],
      runs: [[italic("hooves shuffle nervously")], [plain("Oh, hello.")]],
    },
    {
      case: "emphasis inside a sentence",
      sentences: ["It is *not* a crop."],
      runs: [[plain("It is "), italic("not"), plain(" a crop.")]],
    },
    {
      case: "a phrase the sentence splitter cut in two",
      sentences: ["*Nosar mot marken...", "hittar bara järn.*", "Förlåt."],
      runs: [[italic("Nosar mot marken...")], [italic("hittar bara järn.")], [plain("Förlåt.")]],
    },
    { case: "a lone asterisk between spaces", sentences: ["Five * three."], runs: [[plain("Five * three.")]] },
    {
      case: "an asterisk left without a partner",
      sentences: ["*one* and *two"],
      runs: [[italic("one"), plain(" and *two")]],
    },
  ])("renders $case", ({ sentences, runs }) => {
    expect(emphasisRuns(sentences)).toEqual(runs);
  });
});
