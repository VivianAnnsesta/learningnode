import { describe, expect, it } from "vitest";
import { isAllowedAiProviderUrl } from "./aiProviderUrl";

describe("isAllowedAiProviderUrl", () => {
  it("allows HTTPS providers and loopback HTTP providers", () => {
    expect(isAllowedAiProviderUrl("https://api.example.com/v1")).toBe(true);
    expect(isAllowedAiProviderUrl("http://127.0.0.1:1234/v1")).toBe(true);
    expect(isAllowedAiProviderUrl("http://localhost:1234/v1")).toBe(true);
  });

  it("rejects remote HTTP, credential-bearing, and non-HTTP URLs", () => {
    expect(isAllowedAiProviderUrl("http://attacker.example/v1")).toBe(false);
    expect(isAllowedAiProviderUrl("https://key@attacker.example/v1")).toBe(false);
    expect(isAllowedAiProviderUrl("file:///tmp/provider")).toBe(false);
  });
});
