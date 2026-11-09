import { recordReferenceLabel, recordReferenceQuote, type RecordSnapshot } from "./recordDiscoveryTypes";

export function RecordReferencePreview({ source }: { source: RecordSnapshot }) {
  return <div className="space-y-2">
    <p className="whitespace-pre-wrap break-words">{recordReferenceQuote(source)}</p>
    <p className="text-xs">引用范围：{recordReferenceLabel(source)} · 固定修订：{source.revisionId}</p>
    {source.selector && <details><summary>查看该修订的完整原文</summary><p className="whitespace-pre-wrap break-words">{source.body}</p></details>}
  </div>;
}
