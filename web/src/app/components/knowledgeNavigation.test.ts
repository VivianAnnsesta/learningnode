import { describe, expect, it } from "vitest";
import { knowledgeRecordHref, knowledgeReturnView, knowledgeSourceView, knowledgeViewForFilters, normalizeKnowledgeView, PERSONAL_KNOWLEDGE_PATH } from "./knowledgeNavigation";

describe("personal-network return navigation", () => {
  it("normalizes only the five view filters with stable ordering and defaults", () => {
    expect(normalizeKnowledgeView("/learning/knowledge?sort=updated_desc&kind=question&q=%E6%9D%A1%E4%BB%B6&domainId=&collectionId=topic"))
      .toBe("/learning/knowledge?q=%E6%9D%A1%E4%BB%B6&collectionId=topic&kind=question");
    expect(knowledgeViewForFilters({ q: "条件 & a=b", domainId: "math", kind: "understanding", sort: "title_asc" }))
      .toBe("/learning/knowledge?q=%E6%9D%A1%E4%BB%B6+%26+a%3Db&domainId=math&kind=understanding&sort=title_asc");
    expect(normalizeKnowledgeView("/learning/knowledge?domainId=&kind=&sort=" )).toBe(PERSONAL_KNOWLEDGE_PATH);
    expect(normalizeKnowledgeView("/learning/knowledge?q=%5Cd%2B")).toBe("/learning/knowledge?q=%5Cd%2B");
  });

  it.each([
    "https://evil.example/learning/knowledge", "//evil.example/learning/knowledge", "javascript:alert(1)",
    "learning/knowledge", "/learning/knowledge/", "/learning/history", "/learning/knowledge#x",
    "/learning/knowledge\\evil?q=x", "/learning/knowledge?domainId=%5Cevil", "/learning/knowledge?q=%00",
    "/learning/knowledge?q=x\n", "/learning/knowledge?kind=mastered", "/learning/knowledge?sort=custom",
    "/learning/knowledge?q=a&q=b", "/learning/knowledge?domainId=a&domainId=", "/learning/knowledge?unknown=x",
    "/learning/knowledge?returnTo=%2Flearning%2Fknowledge", "/learning/knowledge?kind=question&kind=note"
  ])("rejects unsafe or ambiguous target %s", value => {
    expect(normalizeKnowledgeView(value)).toBeNull();
    expect(knowledgeReturnView(new URLSearchParams({ returnTo: value }).toString())).toBe(PERSONAL_KNOWLEDGE_PATH);
  });

  it("uses exactly one validated returnTo without recursively nesting source views", () => {
    const view = knowledgeViewForFilters({ q: "概率", domainId: "math", kind: "question", sort: "title_asc" });
    const a = knowledgeRecordHref("record-a", view);
    const sourceFromA = knowledgeSourceView("/learning/knowledge/record-a", new URL(a, "http://localhost").search);
    const b = knowledgeRecordHref("record-b", sourceFromA);
    expect(knowledgeReturnView(new URL(b, "http://localhost").search)).toBe(view);
    expect(new URL(b, "http://localhost").searchParams.get("returnTo")).toBe(view);
    expect(knowledgeReturnView("?returnTo=/learning/knowledge&returnTo=/learning/knowledge?q=x")).toBe(PERSONAL_KNOWLEDGE_PATH);
    expect(knowledgeReturnView("")).toBe(PERSONAL_KNOWLEDGE_PATH);
  });

  it("canonicalizes a domain alias using the actual explicit domain selection", () => {
    expect(knowledgeSourceView("/learning/domains/math/knowledge-graph", "?q=条件&kind=question"))
      .toBe("/learning/knowledge?q=%E6%9D%A1%E4%BB%B6&domainId=math&kind=question");
    expect(knowledgeSourceView("/learning/domains/math/knowledge-graph", "?domainId=&kind=note"))
      .toBe("/learning/knowledge?kind=note");
    expect(knowledgeSourceView("/learning/domains/math/knowledge-graph", "?domainId=physics"))
      .toBe("/learning/knowledge?domainId=physics");
    expect(knowledgeSourceView("/learning/domains/%5Cevil/knowledge-graph", "")).toBe(PERSONAL_KNOWLEDGE_PATH);
  });

  it("keeps record identities inside the same route and falls back safely", () => {
    expect(knowledgeRecordHref("a/b?x=1", "https://evil.example")).toBe("/learning/knowledge/a%2Fb%3Fx%3D1");
    expect(knowledgeSourceView("/settings/ai", "?returnTo=https://evil.example")).toBe(PERSONAL_KNOWLEDGE_PATH);
    expect(knowledgeSourceView("/learning/knowledge", "?q=x&sort=title_asc")).toBe("/learning/knowledge?q=x&sort=title_asc");
  });
});
