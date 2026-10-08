import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { middleware } from "./middleware";

const request = (headers: Record<string, string>) =>
  ({ headers: new Headers(headers) }) as NextRequest;

describe("local API middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires the per-process token for a localhost API request", async () => {
    vi.stubEnv("ENGLISHNODE_LOCAL_API_TOKEN", "token");

    const rejected = middleware(request({ host: "127.0.0.1:3000" }));
    expect(rejected.status).toBe(401);

    const accepted = middleware(
      request({
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "x-englishnode-local-token": "token"
      })
    );
    expect(accepted.status).toBe(200);
  });

  it("rejects non-local hosts before checking the token", () => {
    vi.stubEnv("ENGLISHNODE_LOCAL_API_TOKEN", "token");

    expect(
      middleware(
        request({
          host: "attacker.example",
          "x-englishnode-local-token": "token"
        })
      ).status
    ).toBe(403);
  });

  it("rejects a token-bearing request from a different loopback origin port", () => {
    vi.stubEnv("ENGLISHNODE_LOCAL_API_TOKEN", "token");

    expect(
      middleware(
        request({
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3001",
          "x-englishnode-local-token": "token"
        })
      ).status
    ).toBe(403);
  });
});
