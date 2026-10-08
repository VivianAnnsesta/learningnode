import { describe, expect, it } from "vitest";
import { PATCH } from "./route";

describe("domain node API", () => {
  it("rejects direct mastery and materialization writes", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/domains/d1/nodes/n1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masteryStatus: "integrated",
          isIsland: false
        })
      }),
      { params: Promise.resolve({ id: "d1", nodeId: "n1" }) }
    );

    expect(response.status).toBe(405);
    expect((await response.json()).error).toContain("不接受掌握状态写入");
  });
});
