import { describe, expect, it } from "vitest";
import { parseAutoplayLanguageQuery } from "@api/getAutoplayMeeting.js";
import { BadRequestError } from "@models/Errors.js";

describe("parseAutoplayLanguageQuery", () => {
  it("returns undefined when language is omitted", () => {
    expect(parseAutoplayLanguageQuery(undefined)).toBeUndefined();
    expect(parseAutoplayLanguageQuery("")).toBeUndefined();
  });

  it("normalizes a valid language code", () => {
    expect(parseAutoplayLanguageQuery("en")).toBe("en");
    expect(parseAutoplayLanguageQuery("SV")).toBe("sv");
  });

  it("throws on invalid language", () => {
    expect(() => parseAutoplayLanguageQuery("english")).toThrow(BadRequestError);
  });
});
