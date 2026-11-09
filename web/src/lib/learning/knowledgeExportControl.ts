import nodeProcess from "node:process";
import { NodeTeachingError } from "./nodeTeaching";
import { KNOWLEDGE_EXPORT_MAX_BYTES, KNOWLEDGE_EXPORT_TIMEOUT_MS } from "./knowledgeExportContracts";

const key = Symbol.for("englishnode.knowledgeExportOperation.v1");
type Slot = { active: symbol | null };
const state = nodeProcess as typeof nodeProcess & { [key: symbol]: unknown };
export type KnowledgeExportControl = { signal: AbortSignal; check: () => void; deadline: number };

/** Counts the exact JSON delta when appending to arrays of the initial snapshot. */
export function knowledgeExportCaptureBudget(initial: unknown, maxBytes = KNOWLEDGE_EXPORT_MAX_BYTES) {
  let bytes = Buffer.byteLength(JSON.stringify(initial), "utf8");
  const ensure = () => { if (bytes > maxBytes) throw new NodeTeachingError("导出原始内容超过64 MiB，请缩小范围或关闭历史修订后重试。", 413); };
  ensure();
  return { append<T>(array: T[], value: T) { bytes += Buffer.byteLength(JSON.stringify(value), "utf8") + (array.length ? 1 : 0); ensure(); array.push(value); }, get bytes() { return bytes; } };
}

export async function runKnowledgeExportOperation<T>(operation: (control: KnowledgeExportControl) => Promise<T>, options: { signal?: AbortSignal } = {}): Promise<T> {
  if (!state[key]) state[key] = { active: null } satisfies Slot;
  const slot = state[key] as Slot;
  if (slot.active) throw new NodeTeachingError("另一个导出仍在准备或清理，请稍后再试。", 503);
  const token = Symbol(); slot.active = token;
  const controller = new AbortController(), deadline = Date.now() + KNOWLEDGE_EXPORT_TIMEOUT_MS;
  let failure: NodeTeachingError | undefined, rejectInterrupted!: (error: NodeTeachingError) => void;
  const interrupted = new Promise<never>((_, reject) => { rejectInterrupted = reject; });
  const stop = (error: NodeTeachingError) => { if (!failure) { failure = error; controller.abort(error); rejectInterrupted(error); } };
  const aborted = () => stop(new NodeTeachingError("导出准备已取消，记录与草稿保持原样。", 499));
  const timedOut = () => stop(new NodeTeachingError("导出准备超过30秒，请缩小范围或关闭历史修订后重试。", 504));
  const timer = setTimeout(timedOut, KNOWLEDGE_EXPORT_TIMEOUT_MS);
  options.signal?.addEventListener("abort", aborted, { once: true });
  const check = () => { if (options.signal?.aborted) aborted(); if (Date.now() >= deadline) timedOut(); if (failure) throw failure; };
  const running = Promise.resolve().then(() => { check(); return operation({ signal: controller.signal, check, deadline }); }).finally(() => {
    clearTimeout(timer); options.signal?.removeEventListener("abort", aborted);
    if (slot.active === token) slot.active = null;
  });
  // Cancellation can stop the response promptly, but cannot cancel a Prisma query.
  // The slot belongs to running.finally(), never to this outward race.
  return Promise.race([running, interrupted]);
}
