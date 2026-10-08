import { describe, expect, it } from "vitest";
import { validateRoadmapInput } from "./roadmapService";

describe("validateRoadmapInput", () => {
  it("preserves parallel roots and explicit multiple prerequisites", () => {
    const result = validateRoadmapInput({
      stages: [
        {
          key: "foundations",
          title: "基础",
          status: "expanded",
          modules: [
            {
              title: "核心对象",
              items: [
                { key: "a", title: "A", keyQuestion: "A 是什么？" },
                { key: "b", title: "B", keyQuestion: "B 是什么？" },
                {
                  key: "c",
                  title: "C",
                  keyQuestion: "如何组合 A 与 B？",
                  prerequisiteKeys: ["a", "b"]
                }
              ]
            }
          ]
        }
      ]
    });

    expect(result.stages[0]?.modules[0]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "a", prerequisiteKeys: [] }),
        expect.objectContaining({ key: "b", prerequisiteKeys: [] }),
        expect.objectContaining({
          key: "c",
          prerequisiteKeys: ["a", "b"]
        })
      ])
    );
  });

  it("rejects missing prerequisites instead of silently linearizing nodes", () => {
    expect(() =>
      validateRoadmapInput({
        stages: [
          {
            key: "s1",
            status: "expanded",
            modules: [
              {
                items: [
                  {
                    key: "application",
                    title: "应用",
                    keyQuestion: "如何应用？",
                    prerequisiteKeys: ["missing"]
                  }
                ]
              }
            ]
          }
        ]
      })
    ).toThrow("不存在的前置节点 missing");
  });

  it("rejects dependency cycles", () => {
    expect(() =>
      validateRoadmapInput({
        stages: [
          {
            key: "s1",
            status: "expanded",
            modules: [
              {
                items: [
                  {
                    key: "a",
                    title: "A",
                    keyQuestion: "A？",
                    prerequisiteKeys: ["b"]
                  },
                  {
                    key: "b",
                    title: "B",
                    keyQuestion: "B？",
                    prerequisiteKeys: ["a"]
                  }
                ]
              }
            ]
          }
        ]
      })
    ).toThrow("地图前置关系存在循环");
  });

  it("keeps planned stages without inventing detailed nodes", () => {
    const result = validateRoadmapInput({
      stages: [
        {
          key: "advanced",
          title: "延伸与拔高",
          status: "planned",
          rationale: "完成核心结构后再进入综合应用。",
          moduleDirections: ["综合应用", "边界与反例"],
          prerequisiteStageKeys: ["core"]
        },
        {
          key: "core",
          title: "核心",
          status: "planned"
        }
      ]
    });

    expect(result.stages[0]).toMatchObject({
      key: "advanced",
      status: "planned",
      moduleDirections: ["综合应用", "边界与反例"],
      modules: []
    });
  });

  it("rejects formal map entities without stable keys", () => {
    expect(() =>
      validateRoadmapInput({
        stages: [{ title: "Missing key", status: "planned" }]
      })
    ).toThrow("缺少稳定 key");
  });
});
