import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { buildKnowledgeExportArchive, knowledgeExportStableId } from "./knowledgeExportArchive";
import { KNOWLEDGE_EXPORT_FORMAT, type KnowledgeExportManifest, type KnowledgeExportRecord, type KnowledgeExportRevision, type KnowledgeExportSnapshot } from "../learning/knowledgeExportContracts";
import { paragraphSelector, referenceParagraphs } from "../learning/recordReferences";
import { buildRecordClipPreview, recordClipSnapshot } from "../learning/recordClipContracts";

const at = "2026-11-09T16:00:00.000Z", sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
function revision(id: string, pointId: string, body: string, sequence = 1): KnowledgeExportRevision { return { id, knowledgePointId: pointId, sequence, title: "同名标题", body, sourceType: "user", sourcesJson: "[]", aliasesJson: "[]", recordDate: null, recordDateTimeZone: null, createdAt: at }; }
function point(id: string, revisions: KnowledgeExportRevision[], currentRevisionId: string | null = revisions[0]?.id ?? null): KnowledgeExportRecord { return { id, domainId: null, currentRevisionId, currentRecordKind: "note", currentTitle: "同名标题", createdAt: at, updatedAt: at, legacyFallback: currentRevisionId ? null : { title: "旧记录", userUnderstanding: "旧正文\r\n\0😀", coreEssence: "备用原文" }, revisions }; }
function snapshot(records: KnowledgeExportRecord[] = []): KnowledgeExportSnapshot { return { format: KNOWLEDGE_EXPORT_FORMAT, formatVersion: 1, exportedAt: at, request: { scope: { mode: "record", pointId: records[0]?.id ?? "empty" }, includeHistory: true }, effectiveFilters: null, effectiveDateWindow: null, orderedRecordIds: records.map(record => record.id), records, collections: [], memberships: [], domains: [], nodeLinks: [], nodes: [], graphNodes: [], relations: [], externalEndpoints: [], externalNodes: [] }; }
async function unpack(input: KnowledgeExportSnapshot) {
  const archive = await buildKnowledgeExportArchive(input), bytes = Buffer.from(archive.bytes), entries = new Map<string, Buffer>();
  for (let at = 0; bytes.readUInt32LE(at) === 0x04034b50;) {
    const length = bytes.readUInt32LE(at + 18), nameLength = bytes.readUInt16LE(at + 26), start = at + 30 + nameLength;
    entries.set(bytes.subarray(at + 30, start).toString("utf8"), bytes.subarray(start, start + length)); at = start + length;
  }
  const manifest = JSON.parse(entries.get("manifest.json")!.toString("utf8")) as KnowledgeExportManifest;
  return { archive, entries, manifest };
}
function verifyFiles(result: Awaited<ReturnType<typeof unpack>>) {
  expect(result.manifest.integrity).toEqual({ algorithm: "sha256", fileTableExcludes: ["manifest.json"] });
  expect(result.manifest.files).toHaveLength(result.entries.size - 1);
  for (const file of result.manifest.files) {
    const bytes = result.entries.get(file.path)!; expect(bytes.byteLength).toBe(file.bytes); expect(sha(bytes)).toBe(file.sha256);
    if (file.bodyByteOffset !== undefined) {
      const body = bytes.subarray(file.bodyByteOffset, file.bodyByteOffset + file.bodyByteLength!); expect(sha(body)).toBe(file.bodySha256);
      const record = result.manifest.records.find(record => record.id === file.recordId)!, revision = record.revisions.find(revision => revision.id === file.revisionId);
      expect(body).toEqual(Buffer.from(revision ? revision.body : record.legacyFallback!.userUnderstanding!, "utf8"));
    }
  }
  expect(result.archive.sha256).toBe(sha(result.archive.bytes));
}
describe("portable archive preserves snapshot authority", () => {
  it("preserves CRLF/NUL/emoji/body fences and raw malformed date/JSON without inventing historical kind", async () => {
    const old = revision("old", "../CON", "历史\r\n\0😀", 1), current = revision("current", "../CON", "正文\r\n\0😀\n```\nend", 2);
    current.title = 'title"\n---\nunsafe: true\u2028next'; current.aliasesJson = "{invalid aliases"; current.sourcesJson = "{invalid sources"; current.recordDate = "2026-99-99"; current.recordDateTimeZone = "Wrong/Zone";
    const input = snapshot([point("../CON", [current, old]), point("different", [revision("r2", "different", "同名不同记录")]), point("legacy", [])]), frozen = JSON.stringify(input);
    const result = await unpack(input); verifyFiles(result); expect(JSON.stringify(input)).toBe(frozen);
    expect(result.archive).toMatchObject({ filename: "englishnode-knowledge-20261109T160000000Z.zip", recordCount: 3, revisionCount: 3, fileCount: 6 });
    expect(result.manifest.records[0].revisions).toEqual(input.records[0].revisions);
    const currentFile = result.entries.get(`records/${knowledgeExportStableId("../CON")}.md`)!.toString("utf8");
    expect(currentFile.startsWith('---\nformat: "englishnode-personal-knowledge"\n')).toBe(true);
    expect(currentFile).toContain('title: "title\\"\\n---\\nunsafe: true\\u2028next"'); expect(currentFile).toContain("原值保留");
    const oldFile = result.entries.get(`revisions/${knowledgeExportStableId("old")}.md`)!.toString("utf8"); expect(oldFile).not.toContain("currentRecordKind");
    expect(result.manifest.records[2].currentRevisionId).toBeNull(); expect(result.manifest.records[2].revisions).toEqual([]);
    expect([...result.entries.keys()].filter(path => path.endsWith(".md") && path !== "README.md")).toHaveLength(4);
  });
  it("exports an honest empty view and metadata-only index", async () => {
    const result = await unpack(snapshot()); verifyFiles(result); expect(result.archive).toMatchObject({ recordCount: 0, revisionCount: 0, fileCount: 2 }); expect([...result.entries.keys()]).toEqual(["README.md", "manifest.json"]);
  });
  it("keeps ordered selection and same-title identities separate without rewriting body links", async () => {
    const a = point("a", [revision("a1", "a", "[[same title]]")]), b = point("b", [revision("b1", "b", "other")]);
    const input = snapshot([a, b]); input.orderedRecordIds = ["b", "a"]; const result = await unpack(input); verifyFiles(result);
    expect(result.manifest.records.map(record => record.id)).toEqual(["b", "a"]); expect(result.manifest.orderedRecordIds).toEqual(["b", "a"]); expect(result.entries.has(`records/${knowledgeExportStableId("a")}.md`)).toBe(true);
  });
  it("links only a byte-consistent independently included fixed revision and verified paragraph selector", async () => {
    const target = revision("b1", "b", "first\r\n\r\nsecond"), paragraph = referenceParagraphs(target.body)[0], selector = { ...await paragraphSelector(target.body, paragraph.start, paragraph.end), quote: paragraph.quote };
    const stored = { kind: "record", knowledgePointId: "b", revisionId: "b1", title: target.title, body: target.body, sourceType: target.sourceType, selector };
    const owner = revision("a1", "a", "owner"); owner.sourcesJson = JSON.stringify([stored]); const result = await unpack(snapshot([point("a", [owner]), point("b", [target])]));
    expect(result.manifest.references).toEqual([{ ownerRecordId: "a", ownerRevisionId: "a1", sourceIndex: 0, knowledgePointId: "b", revisionId: "b1", path: `records/${knowledgeExportStableId("b")}.md`, outsideSelection: false, resolution: "included_revision" }]);
    expect(result.manifest.records[0].revisions[0].sourcesJson).toBe(owner.sourcesJson); verifyFiles(result);
  });
  it.each(["body", "sourceType", "title", "selectorHash", "selectorQuote"])("does not link same-ID corrupt stored snapshot (%s) to an included revision", async mutation => {
    const target = revision("b1", "b", "first\n\nsecond"), p = referenceParagraphs(target.body)[0];
    const stored = { kind: "record", knowledgePointId: "b", revisionId: "b1", title: target.title, body: target.body, sourceType: target.sourceType, selector: { ...await paragraphSelector(target.body, p.start, p.end), quote: p.quote } };
    if (mutation === "body") stored.body = "different"; else if (mutation === "sourceType") stored.sourceType = "accepted_ai"; else if (mutation === "title") stored.title = "different"; else if (mutation === "selectorHash") stored.selector.quoteHash = "0".repeat(64); else stored.selector.quote = "different quote";
    const owner = revision("a1", "a", "owner"); owner.sourcesJson = JSON.stringify([stored]); const result = await unpack(snapshot([point("a", [owner]), point("b", [target])]));
    expect(result.manifest.references[0]).toMatchObject({ path: null, resolution: "stored_snapshot", outsideSelection: false }); expect(result.manifest.references[0].limitation).toBeTruthy(); expect(result.manifest.records[0].revisions[0].sourcesJson).toBe(owner.sourcesJson);
    expect(result.entries.get(`records/${knowledgeExportStableId("a")}.md`)!.toString()).not.toContain("[独立包含的指定修订]");
  });
  it("keeps omitted-history and outside references as stored snapshots without following current content", async () => {
    const owner = revision("a1", "a", "owner"); owner.sourcesJson = JSON.stringify([{ kind: "record", knowledgePointId: "b", revisionId: "b-old", title: "old", body: "fixed old", sourceType: "user" }, { kind: "record", knowledgePointId: "outside", revisionId: "outside-r", title: "outside", body: "fixed outside", sourceType: "user" }]);
    const input = snapshot([point("a", [owner]), point("b", [revision("b-now", "b", "new different body")])]); input.request.includeHistory = false; input.externalEndpoints = [{ id: "outside", title: "outside stub" }];
    const result = await unpack(input); expect(result.manifest.references.map(reference => [reference.path, reference.outsideSelection, reference.resolution])).toEqual([[null, false, "stored_snapshot"], [null, true, "stored_snapshot"]]); expect([...result.entries.keys()].some(path => path.includes("outside"))).toBe(false); verifyFiles(result);
  });
  it("preserves explicit candidate/rejected relation status and only external label stubs", async () => {
    const input = snapshot([point("a", [revision("a1", "a", "body")])]); input.externalEndpoints = [{ id: "outside", title: "label only" }];
    const relation = { id: "edge", domainId: null, fromNodeId: null, toNodeId: null, fromKnowledgePointId: "a", toKnowledgePointId: "outside", relationType: "related", detail: null, status: "candidate", evidenceStrength: "unknown", userExplanation: null, aiAssessment: "raw proposal", applicability: null, misuseRisk: null, legacyVariantsJson: null, createdAt: at };
    input.relations = [relation, { ...relation, id: "rejected", status: "rejected" }]; const result = await unpack(input);
    expect(result.manifest.relations).toEqual(input.relations); expect(result.manifest.externalEndpoints).toEqual(input.externalEndpoints); expect(result.manifest.records).toHaveLength(1);
  });
  it("labels saved web/pasted clips honestly and never generates unsafe source links", async () => {
    const web = await buildRecordClipPreview({ mode: "web", title: "web", requestedUrl: "https://example.com", finalUrl: "https://example.com/final", capturedAt: at, extractionVersion: "html-text-v1", truncated: false, limitations: ["not verified"], text: "<script>literal clip</script>", receiptId: "x".repeat(43), expiresAt: "2026-11-09T16:15:00.000Z" });
    const pasted = await buildRecordClipPreview({ mode: "pasted", title: "pasted", requestedUrl: "https://example.com/declared", finalUrl: null, capturedAt: at, extractionVersion: "pasted-text-v1", truncated: false, limitations: ["user supplied"], text: "pasted", receiptId: "y".repeat(43), expiresAt: "2026-11-09T16:15:00.000Z" });
    const revisionA = revision("a1", "a", "body"); revisionA.sourcesJson = JSON.stringify([recordClipSnapshot(web, web.fragments.map(f => f.id)), recordClipSnapshot(pasted, pasted.fragments.map(f => f.id)), { kind: "unknown", url: "javascript:alert(1)", value: "```\n<script>not generated html</script>" }]);
    const result = await unpack(snapshot([point("a", [revisionA])])); const file = result.entries.get(`records/${knowledgeExportStableId("a")}.md`)!.toString();
    expect(file).toContain("系统取得的网页文字；内容未核实"); expect(file).toContain("本人提供的文字；系统未从声明网址取得正文"); expect(file).toContain("[HTTPS来源](<https://example.com/final>)"); expect(file).not.toContain("[HTTPS来源](<javascript:"); expect(result.manifest.records[0].revisions[0].sourcesJson).toBe(revisionA.sourcesJson);
  });
  it("drops accidental non-allowlisted runtime fields but retains unknown user-owned source JSON", async () => {
    const r = revision("a1", "a", "body"); Object.assign(r, { masteryStatus: "do-not-export-fact" }); r.sourcesJson = '{"unknown":"user raw"}';
    const input = snapshot([point("a", [r])]); Object.assign(input, { aiSettings: "do-not-export-settings" }); const result = await unpack(input); const manifest = JSON.stringify(result.manifest);
    expect(manifest).not.toContain("do-not-export-fact"); expect(manifest).not.toContain("do-not-export-settings"); expect(result.manifest.records[0].revisions[0].sourcesJson).toBe(r.sourcesJson);
  });
  it.each(["pointer", "owner", "duplicate", "order"])("rejects inconsistent snapshot %s without producing partial results", async issue => {
    const input = snapshot([point("a", [revision("a1", "a", "body")])]);
    if (issue === "pointer") input.records[0].currentRevisionId = "missing"; else if (issue === "owner") input.records[0].revisions[0].knowledgePointId = "other"; else if (issue === "duplicate") input.records[0].revisions.push(input.records[0].revisions[0]); else input.orderedRecordIds = ["outside"];
    await expect(buildKnowledgeExportArchive(input)).rejects.toMatchObject({ code: "INVALID_SNAPSHOT", status: 503 });
  });
  it("cancels during large raw-body formatting and does not mutate the supplied snapshot", async () => {
    const input = snapshot([point("a", [revision("a1", "a", "a".repeat(512 * 1024))])]), controller = new AbortController();
    const result = buildKnowledgeExportArchive(input, { signal: controller.signal }); setImmediate(() => controller.abort());
    await expect(result).rejects.toMatchObject({ code: "ABORTED", status: 499 }); expect(input.records[0].revisions[0].body).toHaveLength(512 * 1024);
  });
});
