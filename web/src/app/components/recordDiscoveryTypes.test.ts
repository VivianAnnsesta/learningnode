import { describe, expect, it } from "vitest";
import { recordSourceInputs } from "./recordDiscoveryTypes";

describe("引用草稿的请求边界", () => {
  it("保留超过请求上限的历史来源时只发送索引与新引用身份", () => {
    const saved = [{ kind: "session", sessionId: "s", material: "原始已展示材料".repeat(12000) }];
    const added = { kind: "record", knowledgePointId: "p", revisionId: "r", title: "解释", body: "引用原文".repeat(10000), sourceType: "user" };
    expect(JSON.stringify([...saved, added]).length).toBeGreaterThan(64000);
    const payload = recordSourceInputs([...saved, added], saved);
    expect(JSON.stringify(payload).length).toBeLessThan(200);
    expect(payload).toEqual([{ kind: "retained", sourceIndex: 0 }, { kind: "record", knowledgePointId: "p", revisionId: "r" }]);
  });

  it("新增引用固定到所选修订，不按同名标题替换原引用", () => {
    const prior = { kind: "record", knowledgePointId: "p", revisionId: "old", title: "同一标题", body: "旧理解", sourceType: "user" };
    const next = { ...prior, revisionId: "new", body: "后来更正" };
    expect(recordSourceInputs([prior, next], [prior])).toEqual([{ kind: "retained", sourceIndex: 0 }, { kind: "record", knowledgePointId: "p", revisionId: "new" }]);
    expect(prior.body).toBe("旧理解");
  });

  it("不把被修改的会话材料重新提交成可信历史快照", () => {
    const prior = { kind: "session", sessionId: "s", material: "当时未显示答案" };
    expect(() => recordSourceInputs([{ ...prior, material: "后来显示的答案" }], [prior])).toThrow("来源已变化");
  });
});
