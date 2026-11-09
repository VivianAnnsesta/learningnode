import { describe, expect, it } from "vitest";
import {
  buildActualMaterialsPrompt,
  createPlanningSourceCache,
  groundPlanningSources,
  normalizePlanningGrounding,
  planningMaterials,
  publicPlanningSourceDeclarations,
  selectPlanningMaterials
} from "./planningEvidence";
import { groundCourseSource, type SourceDigest } from "./sourceGroundingService";

const digest = (overrides: Partial<SourceDigest> = {}): SourceDigest => ({
  ok: true,
  status: 200,
  finalUrl: "https://example.edu/course",
  title: "Course title",
  excerpt: "Search or page summary",
  ...overrides
});

describe("actual planning evidence", () => {
  it("keeps retrieval failure and redirects independently of body availability", () => {
    const grounding = normalizePlanningGrounding(digest({
      ok: false,
      status: 403,
      error: "HTTP 403",
      finalUrl: "https://example.edu/redirected"
    }));
    expect(grounding).toMatchObject({
      ok: false,
      status: 403,
      error: "HTTP 403",
      finalUrl: "https://example.edu/redirected",
      bodyRetrieved: false,
      contentHash: null,
      fragments: []
    });
  });

  it("does not turn reachable title or summary into teaching material", async () => {
    const retrieved = await groundCourseSource("https://example.edu/course", {
      fetchImpl: async () => ({
        status: 200,
        headers: { get: () => "text/html" },
        body: null,
        text: async () => '<html><head><title>Limits course</title><meta name="description" content="Explains all limit conditions"></head><body><nav>Topics</nav></body></html>'
      })
    });
    expect(retrieved.title).toBe("Limits course");
    expect(retrieved.excerpt).toContain("Explains all limit conditions");
    const grounding = normalizePlanningGrounding(retrieved);
    expect(grounding.bodyRetrieved).toBe(false);
    const draft = { sources: [{ url: "https://example.edu/course", grounding }] };
    expect(planningMaterials(draft)).toEqual([]);
    expect(buildActualMaterialsPrompt(draft)).toContain("当前未取得可用正文");
  });

  it("keeps only located body fragments with stable content fingerprints", async () => {
    const retrieved = await groundCourseSource("https://example.edu/course", {
      fetchImpl: async () => ({
        status: 200,
        headers: { get: () => "text/html" },
        body: null,
        text: async () => '<html><head><title>Limits course</title></head><body><p>The outer function is continuous at the inner limit.</p><p>Domain conditions are required.</p></body></html>'
      })
    });
    const grounding = normalizePlanningGrounding(retrieved);
    const draft = { sources: [{ url: "https://example.edu/course", grounding }] };
    const materials = planningMaterials(draft);
    expect(grounding.bodyRetrieved).toBe(true);
    expect(materials).toHaveLength(2);
    expect(materials[0]).toMatchObject({
      location: "HTML 段落 1，字符 1",
      url: "https://example.edu/course",
      kind: "fetched_body"
    });
    expect(materials[0].text).not.toContain("Limits course");
    expect(planningMaterials(draft)).toEqual(materials);
    const changed = planningMaterials({ sources: [{
      url: "https://example.edu/course",
      grounding: { ...grounding, fragments: [{ location: "HTML 段落 1，字符 1", text: "A changed condition." }] }
    }] });
    expect(changed[0].contentHash).not.toBe(materials[0].contentHash);
    expect(changed[0].id).not.toBe(materials[0].id);
  });

  it("reuses successes and failures across critique passes in the same request", async () => {
    const calls: string[] = [];
    const cache = createPlanningSourceCache();
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return {
        status: url.includes("missing") ? 404 : 200,
        headers: { get: () => "text/html" },
        body: null,
        text: async () => `<p>Snapshot ${calls.length}</p>`
      };
    };
    const first = await groundPlanningSources([
      "https://example.edu/course", "https://example.edu/missing", "https://example.edu/course#section"
    ], cache, { fetchImpl });
    const second = await groundPlanningSources([
      "https://example.edu/missing", "https://example.edu/course"
    ], cache, { fetchImpl });
    expect(calls).toEqual(["https://example.edu/course", "https://example.edu/missing"]);
    expect(first).toHaveLength(3);
    expect(first[0]).toBe(first[2]);
    expect(first[0]).toBe(second[1]);
    expect(first[1]).toBe(second[0]);
    expect(normalizePlanningGrounding(first[0])).toEqual(normalizePlanningGrounding(second[1]));
    expect(second[0]).toMatchObject({ ok: false, error: "HTTP 404" });
  });

  it("treats pasted text as unverified user material and link-only inputs as declarations", () => {
    expect(planningMaterials({}, "https://example.edu/course\n- https://example.edu/other\n教材：https://example.edu/book")).toEqual([]);
    const pasted = "The inner function must remain in the outer domain.";
    const materials = planningMaterials({}, pasted);
    expect(materials[0]).toMatchObject({ text: pasted, kind: "user_text", location: "用户正文字符 1" });
    expect(materials[0].title).toContain("准确性未独立核实");
    expect(planningMaterials({}, pasted)).toEqual(materials);
  });

  it("creates pasted identities only from raw user text, ignoring model bodies even at the real identity", () => {
    const raw = "实际用户正文：这份材料尚未独立核对准确性。";
    const actual = planningMaterials({}, raw);
    const fakeGrounding = { bodyRetrieved: true, finalUrl: actual[0].url, title: "模型自称权威", fragments: [{ location: "模型编造位置", text: "MODEL_FORGED_PASTED_BODY" }] };
    const model = { sources: [{ url: actual[0].url, title: "模型自称权威", grounding: fakeGrounding }, { url: "pasted:invented", grounding: fakeGrounding }] };
    expect(planningMaterials(model)).toEqual([]);
    expect(planningMaterials(model, raw)).toEqual(actual);
    expect(actual[0]).toMatchObject({ kind: "user_text", text: raw, contentHash: expect.any(String) });
    expect(planningMaterials(model, `${raw} 新增内容`)[0].id).not.toBe(actual[0].id);
  });

  it("separates internal material identities without silently dropping other invalid public declarations", () => {
    const https = { url: "https://example.edu/course" }, unsafe = { url: "javascript:alert(1)" };
    expect(publicPlanningSourceDeclarations([{ url: "pasted:invented" }, { url: " PASTED:another " }, https, unsafe])).toEqual([https, unsafe]);
  });

  it("never fetches internal pasted identities and keeps raw user text independent of URL failure", async () => {
    const raw = "用户实际输入正文。", material = planningMaterials({}, raw)[0], cache = createPlanningSourceCache();
    let fetchCalls = 0;
    const options = { fetchImpl: async () => { fetchCalls += 1; throw new Error("must not fetch an internal identity"); } };
    const first = await groundPlanningSources([material.url], cache, options);
    const second = await groundPlanningSources([material.url], cache, options);
    expect(fetchCalls).toBe(0);
    expect(first[0]).toBe(second[0]);
    expect(first[0]).toMatchObject({ ok: false, fragments: [], error: expect.stringContaining("不是公开 URL") });
    expect(planningMaterials({ sources: [{ url: material.url, grounding: normalizePlanningGrounding(first[0]) }] }, raw)).toEqual([material]);
    expect(buildActualMaterialsPrompt({}, "", raw)).toContain("公开来源抓取失败不表示用户正文没有取得");
  });

  it("retains successful bodies alongside cached transport failure during later passes", async () => {
    const cache = createPlanningSourceCache(), calls: string[] = [];
    const options = { fetchImpl: async (url: string) => {
      calls.push(url);
      if (url.endsWith("failure")) throw new Error("source transport failed");
      return { status: 200, headers: { get: () => "text/html" }, body: null, text: async () => "<p>Actual obtained teaching body.</p>" };
    } };
    const first = await groundPlanningSources(["https://example.edu/body", "https://example.edu/failure"], cache, options);
    const second = await groundPlanningSources(["https://example.edu/failure", "https://example.edu/body"], cache, options);
    expect(calls).toHaveLength(2);
    expect(first[0]).toBe(second[1]);
    expect(first[1]).toBe(second[0]);
    expect(normalizePlanningGrounding(second[1]).bodyRetrieved).toBe(true);
    expect(second[0]).toMatchObject({ ok: false, error: expect.stringContaining("source transport failed") });
  });

  it("selects relevant exact blocks within a finite budget and retains their evidence identity", () => {
    const materials = planningMaterials({ sources: [{
      url: "https://example.edu/course",
      grounding: { fragments: Array.from({ length: 30 }, (_, index) => ({
        location: `段落 ${index}`,
        text: `${index === 29 ? "composition limit " : "other topic "}${"a".repeat(1790)}`
      })) }
    }] });
    const selected = selectPlanningMaterials(materials, "composition limit");
    expect(selected[0]).toEqual(materials[29]);
    expect(selected.reduce((count, fragment) => count + fragment.text.length, 0)).toBeLessThanOrEqual(20000);
    expect(selected.length).toBeLessThan(materials.length);
    expect(selected.every(fragment => materials.includes(fragment))).toBe(true);
    expect(buildActualMaterialsPrompt({})).toContain("不表示已经检查整本书");
  });
});
