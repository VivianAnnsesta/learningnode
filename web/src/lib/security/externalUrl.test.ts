import { describe, expect, it } from "vitest";
import { isSafeExternalUrl } from "./externalUrl";

describe("isSafeExternalUrl", () => {
  it("accepts HTTPS links only", () => {
    expect(isSafeExternalUrl("https://ocw.mit.edu/courses/18-06/")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:3000/course")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)//course")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,test")).toBe(false);
    expect(isSafeExternalUrl("file:///C:/course.pdf")).toBe(false);
  });
});
