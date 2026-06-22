import { afterEach, describe, expect, it } from "vitest";
import {
  _setCorsAllowlistForTests,
  corsHeaders,
  isAllowedLocalOrigin,
  isAllowedOrigin,
} from "../src/cors.js";

describe("cors", () => {
  afterEach(() => {
    _setCorsAllowlistForTests(null, null);
  });

  it("allows localhost and 127.0.0.1 origins", () => {
    expect(isAllowedLocalOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedLocalOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedLocalOrigin("https://example.com")).toBe(false);
  });

  it("allows configured museum HTTPS origins by suffix", () => {
    expect(isAllowedOrigin("https://test.council-of-forest.com")).toBe(true);
    expect(isAllowedOrigin("https://council-of-foods.com")).toBe(true);
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedOrigin("http://test.council-of-forest.com")).toBe(false);
  });

  it("supports exact origin overrides", () => {
    _setCorsAllowlistForTests([], ["https://museum.example"]);
    expect(isAllowedOrigin("https://museum.example")).toBe(true);
    expect(isAllowedOrigin("https://other.example")).toBe(false);
  });

  it("returns CORS headers for allowed origins", () => {
    expect(corsHeaders("http://localhost:5173")).toEqual({
      "Access-Control-Allow-Origin": "http://localhost:5173",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    });

    expect(corsHeaders("https://test.council-of-forest.com")).toEqual({
      "Access-Control-Allow-Origin": "https://test.council-of-forest.com",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    });
  });

  it("returns no headers for disallowed origins", () => {
    expect(corsHeaders("https://evil.example")).toEqual({});
  });
});
