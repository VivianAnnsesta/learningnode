import { createHash } from "node:crypto";
import { groundCourseSource } from "./sourceGroundingService";
import { isSafeExternalUrl } from "../security/externalUrl";
import { NodeTeachingError, type SourceFragment } from "./teachingContracts";

export const digest = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
export function sourceFragments(url: string, title: string, blocks: { location: string; text: string }[]): SourceFragment[] {
  const contentHash = digest(blocks);
  return blocks.filter(b => b.text.trim()).slice(0,160).map((b, i) => ({ ...b, title, url, contentHash, id: `src-${digest(url).slice(0,12)}-${contentHash.slice(0,12)}-${i}` }));
}
export async function fetchTeachingSource(url: string) {
  if (!isSafeExternalUrl(url) || new URL(url).username || new URL(url).password) throw new NodeTeachingError("资料仅接受不含凭据的公开 HTTPS 地址。");
  const result = await groundCourseSource(url, { excerptChars: 32000 });
  const title = result.title || new URL(url).hostname;
  const blocks = result.fragments || (result.excerpt ? [{location: "已提取正文片段", text: result.excerpt.slice(0, 1800)}] : []);
  const fragments = sourceFragments(result.finalUrl || url, title, blocks);
  return { url, title, fragments, contentHash: digest(fragments), limitation: !result.ok || !fragments.length ? result.error || "没有可用的正文片段。" : "仅使用有界提取的正文；PDF 最多提取前八页，资料可达不代表内容正确。" };
}
function terms(query: string) {
  const words = query.toLowerCase().match(/[a-z0-9_]{2,}|[\u4e00-\u9fff]+/g) || [];
  return [...new Set(words.flatMap(word => /^[\u4e00-\u9fff]+$/.test(word) ? [word, ...Array.from({length: Math.max(0,word.length-1)}, (_, i) => word.slice(i,i+2))] : [word]))];
}
export function selectFragments(fragments: SourceFragment[], query: string, limit = 8) {
  const tokens = terms(query);
  return fragments.map((f, i) => ({ f, i, score: tokens.reduce((n,t) => n + (f.text.toLowerCase().includes(t) ? 1 : 0) + (f.title.toLowerCase().includes(t) ? 2 : 0),0) }))
    .filter(x => x.score > 0).sort((a,b) => b.score-a.score || a.i-b.i).slice(0,limit).map(x => x.f);
}
