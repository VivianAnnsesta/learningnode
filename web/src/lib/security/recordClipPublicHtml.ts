import { lookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { BlockList, isIP } from "node:net";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import process from "node:process";
import { parseRecordClipUrl } from "../learning/recordClipContracts";
import { extractRecordClipHtmlText } from "./recordClipHtmlText";

const failures = {
  INVALID_URL: [400, "剪藏网址无效，请使用不含凭据的HTTPS地址。"],
  BLOCKED_ADDRESS: [400, "剪藏只接受公开互联网地址。"],
  TOO_LARGE: [413, "网页内容超过剪藏读取上限，请改用本人提供的选文。"],
  UNSUPPORTED_MEDIA: [415, "剪藏只读取HTML网页，请改用本人提供的选文。"],
  UNSUPPORTED_ENCODING: [415, "网页使用了暂不支持的传输或文字编码，请改用本人提供的选文。"],
  EMPTY_TEXT: [422, "网页没有提取到可用正文，请改用本人提供的选文。"],
  UPSTREAM: [502, "公开网页读取失败，请检查网址或改用本人提供的选文。"],
  BUSY: [503, "网页读取繁忙，请稍后重试。"],
  TIMEOUT: [504, "公开网页读取超时，请重试或改用本人提供的选文。"],
  ABORTED: [499, "网页读取已取消。"]
} as const;
export type RecordClipPublicHtmlErrorCode = keyof typeof failures;
export class RecordClipPublicHtmlError extends Error {
  readonly status: number;
  constructor(readonly code: RecordClipPublicHtmlErrorCode) {
    super(failures[code][1]); this.name = "RecordClipPublicHtmlError"; this.status = failures[code][0];
  }
}
export type RecordClipPublicHtmlResult = { requestedUrl: string; finalUrl: string; title: string; text: string; capturedAt: string; truncated: boolean; limitations: string[] };
type Address = { address: string; family: 4 | 6 };
type NativeRequest = (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
type Context = { signal: AbortSignal; check: () => void; maxBytes: number };
type PinnedTarget = Address & { url: URL };
type Hop = { status: number; location?: string; bytes: Buffer };

// Conservative special-purpose/transition exclusions, alongside global IPv6 unicast.
// Registry source: IANA IPv4/IPv6 Special-Purpose Address Space (2025-10-09).
const denied = new BlockList(), globalV6 = new BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) denied.addSubnet(network, prefix, "ipv4");
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [network, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) denied.addSubnet(network, prefix, "ipv6");
export function isPublicRecordClipAddress(address: string) {
  if (address.includes("%")) return false;
  const version = isIP(address);
  return version === 4 ? !denied.check(address, "ipv4") : version === 6 && globalV6.check(address, "ipv6") && !denied.check(address, "ipv6");
}
const hostname = (url: URL) => url.hostname.replace(/^\[|\]$/g, "");
export function parsePublicRecordClipUrl(value: string) {
  let url: URL;
  try { url = new URL(parseRecordClipUrl(value)); } catch { throw new RecordClipPublicHtmlError("INVALID_URL"); }
  const host = hostname(url).toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || [".localhost", ".local", ".internal", ".home.arpa"].some(suffix => host.endsWith(suffix)) || isIP(host) && !isPublicRecordClipAddress(host)) throw new RecordClipPublicHtmlError("BLOCKED_ADDRESS");
  return url;
}
function samePeer(actual: string | undefined, pin: Address) {
  if (!actual || actual.includes("%")) return false;
  const set = new BlockList(); set.addAddress(pin.address, pin.family === 4 ? "ipv4" : "ipv6");
  const version = isIP(actual); return !!version && set.check(actual, version === 4 ? "ipv4" : "ipv6");
}
function raceCancellation<T>(work: Promise<T>, context: Context): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => { try { context.check(); } catch (error) { reject(error); } };
    context.signal.addEventListener("abort", abort, { once: true });
    work.then(value => { context.signal.removeEventListener("abort", abort); try { context.check(); resolve(value); } catch (error) { reject(error); } }, error => { context.signal.removeEventListener("abort", abort); reject(error); });
    if (context.signal.aborted) abort();
  });
}

/** Native adapter: the caller supplies a pin already checked by the public-address policy.
 * Kept independently testable with a loopback TLS fixture; no route accepts adapter options.
 */
export function requestPinnedRecordClipHtml(target: PinnedTarget, context: Context, request: NativeRequest = httpsRequest): Promise<Hop> {
  return new Promise((resolve, reject) => {
    let req: ClientRequest | undefined, response: IncomingMessage | undefined, settled = false, peerVerified = false;
    const finish = (error?: unknown, result?: Hop) => {
      if (settled) return; settled = true; context.signal.removeEventListener("abort", abort);
      if (error) { response?.destroy(); req?.destroy(); reject(error instanceof RecordClipPublicHtmlError ? error : new RecordClipPublicHtmlError("UPSTREAM")); }
      else { resolve(result!); }
    };
    const abort = () => { try { context.check(); } catch (error) { finish(error); } };
    try {
      context.check();
      const host = hostname(target.url);
      const requestOptions: RequestOptions & { autoSelectFamily: boolean } = {
        protocol: "https:", hostname: host, port: target.url.port || 443,
        path: target.url.pathname + target.url.search, method: "GET", agent: false,
        family: target.family, autoSelectFamily: false,
        lookup: (_name, _options, callback) => callback(null, target.address, target.family),
        servername: isIP(host) ? "" : host, rejectUnauthorized: true, maxHeaderSize: 16384,
        headers: { Host: target.url.host, Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity", "User-Agent": "EnglishNode-RecordClip/1.0" }
      };
      req = request(requestOptions, res => {
        response = res;
        res.on("error", () => finish(new RecordClipPublicHtmlError("UPSTREAM")));
        res.on("aborted", () => finish(new RecordClipPublicHtmlError("UPSTREAM")));
        if (settled) { res.destroy(); return; }
        try {
          context.check();
          if (!peerVerified) throw new RecordClipPublicHtmlError("UPSTREAM");
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status)) {
            const location = res.headers.location;
            if (!location) throw new RecordClipPublicHtmlError("UPSTREAM");
            finish(undefined, { status, location, bytes: Buffer.alloc(0) }); res.destroy(); req?.destroy(); return;
          }
          if (status < 200 || status >= 300) throw new RecordClipPublicHtmlError("UPSTREAM");
          const media = res.headers["content-type"] || "", encoding = res.headers["content-encoding"] || "identity";
          if (Array.isArray(media) || !["text/html", "application/xhtml+xml"].includes(media.split(";", 1)[0].trim().toLowerCase())) throw new RecordClipPublicHtmlError("UNSUPPORTED_MEDIA");
          if (Array.isArray(encoding) || encoding.trim().toLowerCase() !== "identity") throw new RecordClipPublicHtmlError("UNSUPPORTED_ENCODING");
          const charset = media.match(/;\s*charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]*))/i);
          if (charset && !["utf-8", "utf8", "us-ascii"].includes((charset[1] ?? charset[2] ?? charset[3]).toLowerCase())) throw new RecordClipPublicHtmlError("UNSUPPORTED_ENCODING");
          const declared = res.headers["content-length"];
          if (declared && (!/^[0-9]+$/.test(declared) || Number(declared) > context.maxBytes)) throw new RecordClipPublicHtmlError("TOO_LARGE");
          const chunks: Buffer[] = []; let count = 0;
          res.on("data", (chunk: Buffer) => {
            if (settled) return;
            try { context.check(); if (count + chunk.length > context.maxBytes) throw new RecordClipPublicHtmlError("TOO_LARGE"); chunks.push(chunk); count += chunk.length; }
            catch (error) { finish(error); }
          });
          res.on("end", () => {
            if (settled) return;
            try { context.check(); if (!res.complete) throw new RecordClipPublicHtmlError("UPSTREAM"); finish(undefined, { status, bytes: Buffer.concat(chunks, count) }); }
            catch (error) { finish(error); }
          });
          res.on("close", () => { if (!settled && !res.complete) finish(new RecordClipPublicHtmlError("UPSTREAM")); });
        } catch (error) { finish(error); }
      });
      req.on("error", () => finish(new RecordClipPublicHtmlError("UPSTREAM")));
      req.on("socket", socket => {
        const tls = socket as TLSSocket;
        tls.once("secureConnect", () => {
          try { context.check(); if (!tls.authorized || !samePeer(tls.remoteAddress, target)) throw new RecordClipPublicHtmlError("UPSTREAM"); peerVerified = true; }
          catch (error) { finish(error); }
        });
      });
      context.signal.addEventListener("abort", abort, { once: true });
      if (context.signal.aborted) { abort(); return; }
      req.end();
    } catch (error) { finish(error); }
  });
}

type Dependencies = { resolveAll?: (host: string) => Promise<Address[]>; request?: NativeRequest; now?: () => number; timeoutMs?: number; maxBytes?: number; maxRedirects?: number };
const dnsKey = Symbol.for("EnglishNode.RecordClipPendingDns.v1");
type ResolverProcess = typeof process & { [dnsKey]?: { pending: number } };
const dnsState = () => { const owner = process as ResolverProcess; return owner[dnsKey] ?? (owner[dnsKey] = { pending: 0 }); };
const resolveAll = async (host: string): Promise<Address[]> => {
  const state = dnsState(); if (state.pending >= 4) throw new RecordClipPublicHtmlError("BUSY"); state.pending++;
  // OS lookup cannot be aborted. Hold its slot until real settlement, including after caller timeout.
  try { return await lookup(host, { all: true, verbatim: true }) as Address[]; } finally { state.pending--; }
};
export function createRecordClipPublicHtmlFetcher(deps: Dependencies = {}) {
  return async (value: string, options: { signal?: AbortSignal } = {}): Promise<RecordClipPublicHtmlResult> => {
    const now = deps.now ?? (() => performance.now()), deadline = now() + (deps.timeoutMs ?? 8000);
    const controller = new AbortController(); let timedOut = false;
    const cancel = () => controller.abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, deps.timeoutMs ?? 8000);
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const context: Context = { signal: controller.signal, maxBytes: deps.maxBytes ?? 2 * 1024 * 1024, check() {
      if (options.signal?.aborted) throw new RecordClipPublicHtmlError("ABORTED");
      if (timedOut || now() >= deadline) throw new RecordClipPublicHtmlError("TIMEOUT");
      if (controller.signal.aborted) throw new RecordClipPublicHtmlError("ABORTED");
    } };
    try {
      context.check(); const requestedUrl = parsePublicRecordClipUrl(value).href;
      let current = requestedUrl;
      for (let redirects = 0; ; redirects++) {
        context.check(); const url = parsePublicRecordClipUrl(current), host = hostname(url);
        const family = isIP(host);
        const answers = family ? [{ address: host, family: family as 4 | 6 }] : await raceCancellation((deps.resolveAll ?? resolveAll)(host), context);
        context.check();
        if (!answers.length || answers.some(answer => isIP(answer.address) !== answer.family || !isPublicRecordClipAddress(answer.address))) throw new RecordClipPublicHtmlError("BLOCKED_ADDRESS");
        const response = await requestPinnedRecordClipHtml({ ...answers[0], url }, context, deps.request);
        context.check();
        if (response.location !== undefined) {
          if (redirects >= (deps.maxRedirects ?? 2)) throw new RecordClipPublicHtmlError("UPSTREAM");
          if (/[\u0000-\u0020\u007f-\u009f]/u.test(response.location)) throw new RecordClipPublicHtmlError("INVALID_URL");
          let next: string; try { next = new URL(response.location, url).href; } catch { throw new RecordClipPublicHtmlError("INVALID_URL"); }
          current = parsePublicRecordClipUrl(next).href; continue;
        }
        let html: string;
        try { html = new TextDecoder("utf-8", { fatal: true }).decode(response.bytes); } catch { throw new RecordClipPublicHtmlError("UNSUPPORTED_ENCODING"); }
        context.check();
        const projected = extractRecordClipHtmlText(html, context.check);
        if (!projected.text.trim()) throw new RecordClipPublicHtmlError("EMPTY_TEXT");
        return { requestedUrl, finalUrl: url.href, title: projected.title || url.hostname, text: projected.text, capturedAt: new Date().toISOString(), truncated: projected.truncated, limitations: ["网页文字为启发式提取，不执行脚本或加载图片；不保证完整文章或来源正确性。", ...(projected.truncated ? ["预览文字达到上限，后续网页文字未包含在本次预览中。"] : [])] };
      }
    } catch (error) {
      context.check();
      if (error instanceof RecordClipPublicHtmlError) throw error;
      throw new RecordClipPublicHtmlError("UPSTREAM");
    } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
  };
}
export const fetchRecordClipPublicHtml = createRecordClipPublicHtmlFetcher();
