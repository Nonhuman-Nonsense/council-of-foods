import { describe, expect, it } from "vitest";
import { corsHeaders, isAllowedLocalOrigin } from "../src/cors.js";

describe("cors", () => {
  it("allows localhost and 127.0.0.1 origins", () => {
    expect(isAllowedLocalOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedLocalOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedLocalOrigin("https://example.com")).toBe(false);
  });

  it("returns CORS headers for allowed origins", () => {
    expect(corsHeaders("http://localhost:5173")).toEqual({
      "Access-Control-Allow-Origin": "http://localhost:5173",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    });
  });

  it("returns no headers for disallowed origins", () => {
    expect(corsHeaders("https://evil.example")).toEqual({});
  });
});
