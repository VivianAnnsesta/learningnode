import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isSafeExternalUrl } from "../security/externalUrl";

export type SourceDigest = {
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  title: string | null;
  excerpt: string | null;
  fragments?: { location: string; text: string }[];
  error?: string;
};

type FetchLike = (
  url: string,
  init?: {
    signal?: AbortSignal;
    redirect?: "manual" | "follow";
    headers?: Record<string, string>;
  }
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  body?: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array }>;
      cancel(): Promise<void>;
    };
  } | null;
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}>;

type GroundOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  excerptChars?: number;
  pdfTextExtractor?: typeof extractPdfText;
  resolveHostname?: (hostname: string) => Promise<string[]>;
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 2;
const DEFAULT_EXCERPT_CHARS = 1200;

const normalizeHostname = (hostname: string) =>
  hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

const isPublicIpv4 = (address: string) => {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [first, second, third] = parts;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
};

const ipv6Segments = (address: string) => {
  const normalized = normalizeHostname(address).split("%")[0];
  const parseSide = (value: string) => {
    if (!value) return [];
    return value.split(":").flatMap((segment) => {
      if (!segment.includes(".")) return [Number.parseInt(segment, 16)];
      const parts = segment.split(".").map(Number);
      return [(parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]];
    });
  };
  const [leftText, rightText] = normalized.split("::");
  const left = parseSide(leftText);
  const right = parseSide(rightText || "");
  const zeros = normalized.includes("::")
    ? Array(Math.max(0, 8 - left.length - right.length)).fill(0)
    : [];
  return [...left, ...zeros, ...right];
};

const isPublicIpv6 = (address: string) => {
  const segments = ipv6Segments(address);
  if (segments.length !== 8) return false;
  const isUnspecifiedOrLoopback =
    segments.slice(0, 7).every((segment) => segment === 0) &&
    (segments[7] === 0 || segments[7] === 1);
  if (isUnspecifiedOrLoopback) return false;
  const isMappedIpv4 =
    segments.slice(0, 5).every((segment) => segment === 0) &&
    segments[5] === 0xffff;
  const isCompatibleIpv4 = segments.slice(0, 6).every((segment) => segment === 0);
  if (isMappedIpv4 || isCompatibleIpv4) {
    const ipv4 = [
      segments[6] >> 8,
      segments[6] & 0xff,
      segments[7] >> 8,
      segments[7] & 0xff
    ].join(".");
    return isPublicIpv4(ipv4);
  }
  const firstSegment = segments[0];
  return !(
    (firstSegment & 0xfe00) === 0xfc00 ||
    (firstSegment & 0xffc0) === 0xfe80 ||
    (firstSegment & 0xff00) === 0xff00 ||
    (segments[0] === 0x2001 && segments[1] === 0x0db8)
  );
};

const isPublicIpAddress = (address: string) => {
  const version = isIP(normalizeHostname(address));
  if (version === 4) return isPublicIpv4(normalizeHostname(address));
  if (version === 6) return isPublicIpv6(normalizeHostname(address));
  return false;
};

const isPublicSourceHostname = (hostname: string) => {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  if (isIP(normalized)) return isPublicIpAddress(normalized);
  if (!normalized.includes(".")) return false;
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".home.arpa")
  ) {
    return false;
  }
  return true;
};

const resolveSourceHostname = async (
  url: string,
  options: GroundOptions
) => {
  const parsed = new URL(url);
  if (
    parsed.username ||
    parsed.password ||
    !isPublicSourceHostname(parsed.hostname)
  ) {
    return false;
  }
  if (isIP(normalizeHostname(parsed.hostname))) return true;

  const resolver = options.resolveHostname
    ? options.resolveHostname
    : options.fetchImpl
      ? null
      : async (hostname: string) =>
          (await lookup(hostname, { all: true, verbatim: true })).map(
            (entry) => entry.address
          );
  if (!resolver) return true;
  const addresses = await resolver(normalizeHostname(parsed.hostname));
  return addresses.length > 0 && addresses.every(isPublicIpAddress);
};

const decodeEntities = (text: string) =>
  text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'");

const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();

const extractText = (html: string, excerptChars: number) => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaTagMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]*>/i
  );
  const metaContentMatch = metaTagMatch
    ? metaTagMatch[0].match(/content="([^"]*)"/i) ??
      metaTagMatch[0].match(/content='([^']*)'/i)
    : null;
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

  const stripTags = (value: string) =>
    collapseWhitespace(decodeEntities(value.replace(/<[^>]+>/g, " ")));

  const title = titleMatch ? stripTags(titleMatch[1]) : null;
  const metaDescription = metaContentMatch
    ? collapseWhitespace(decodeEntities(metaContentMatch[1]))
    : null;
  const h1 = h1Match ? stripTags(h1Match[1]) : null;

  const bodyWithoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  const bodyText = stripTags(bodyWithoutNoise);

  const excerptParts = [metaDescription, h1, bodyText].filter(
    (part): part is string => Boolean(part)
  );
  const excerpt = collapseWhitespace(excerptParts.join(" — ")).slice(
    0,
    excerptChars
  );

  return {
    title: title || h1 || metaDescription || null,
    excerpt: excerpt || null,
    fragments: bodyWithoutNoise.replace(/<\/(?:p|div|section|article|h[1-6]|li)>/gi, "\n").split(/\n+/).map(stripTags).filter(Boolean).slice(0, 160).flatMap((text, i) => {
      const parts = []; for (let start=0; start<text.length && start<12000; start+=1800) parts.push({location: `HTML 段落 ${i+1}，字符 ${start+1}`, text:text.slice(start,start+1800)}); return parts;
    }).slice(0, 160)
  };
};

const readBoundedBytes = async (
  response: Awaited<ReturnType<FetchLike>>,
  maxBytes: number
) => {
  if (!response.body) {
    if (response.arrayBuffer) {
      return new Uint8Array(await response.arrayBuffer()).subarray(0, maxBytes);
    }
    const text = await response.text();
    return new TextEncoder().encode(text).subarray(0, maxBytes);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        if (received >= maxBytes) break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const merged = new Uint8Array(Math.min(received, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, merged.length - offset);
    merged.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= merged.length) break;
  }
  return merged;
};

const readBoundedText = async (
  response: Awaited<ReturnType<FetchLike>>,
  maxBytes: number
) =>
  new TextDecoder("utf-8", { fatal: false }).decode(
    await readBoundedBytes(response, maxBytes)
  );

export async function extractPdfText(
  bytes: Uint8Array,
  excerptChars: number
): Promise<{title: string | null; excerpt: string | null; fragments?: Array<{location: string; text: string}>}> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: bytes,
    useWorkerFetch: false,
    useSystemFonts: true
  });
  const document = await loadingTask.promise;
  try {
    const metadata = await document.getMetadata().catch(() => null);
    const info = metadata?.info as { Title?: unknown } | undefined;
    const parts: string[] = [];
    const maxPages = Math.min(document.numPages, 8);
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      parts.push(
        content.items
          .map((item) =>
            item && typeof item === "object" && "str" in item
              ? String(item.str)
              : ""
          )
          .filter(Boolean)
          .join(" ")
      );
      if (collapseWhitespace(parts.join(" ")).length >= excerptChars) break;
    }
    const excerpt = collapseWhitespace(parts.join(" ")).slice(0, excerptChars);
    return {
      title:
        typeof info?.Title === "string" && info.Title.trim()
          ? info.Title.trim()
          : null,
      excerpt: excerpt || null,
      fragments: parts.flatMap((text, i) => {
        const blocks: {location:string;text:string}[] = [];
        for(let start=0;start<text.length;start+=1800) blocks.push({location:`PDF 第 ${i+1} 页，字符 ${start+1}`,text:text.slice(start,start+1800)});
        return blocks;
      }).slice(0,160)
    };
  } finally {
    await loadingTask.destroy();
  }
}

export const groundCourseSource = async (
  url: string,
  options: GroundOptions = {}
): Promise<SourceDigest> => {
  const fetchImpl = (options.fetchImpl ??
    (globalThis.fetch as unknown as FetchLike));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const excerptChars = options.excerptChars ?? DEFAULT_EXCERPT_CHARS;

  if (!isSafeExternalUrl(url)) {
    return {
      ok: false,
      status: null,
      finalUrl: null,
      title: null,
      excerpt: null,
      error: "URL 未通过 HTTPS 白名单校验。"
    };
  }

  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (!(await resolveSourceHostname(currentUrl, options))) {
        return {
          ok: false,
          status: null,
          finalUrl: currentUrl,
          title: null,
          excerpt: null,
          error: "来源地址不是公开互联网主机。"
        };
      }
      const response = await fetchImpl(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "user-agent": "EnglishNode-SourceGrounding/1.0",
          accept: "text/html,application/xhtml+xml,application/pdf"
        }
      });

      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location")
      ) {
        if (redirectCount >= maxRedirects) {
          return {
            ok: false,
            status: response.status,
            finalUrl: currentUrl,
            title: null,
            excerpt: null,
            error: "重定向次数超过上限。"
          };
        }
        const nextUrl = new URL(
          response.headers.get("location") as string,
          currentUrl
        ).toString();
        if (!isSafeExternalUrl(nextUrl)) {
          return {
            ok: false,
            status: response.status,
            finalUrl: currentUrl,
            title: null,
            excerpt: null,
            error: "重定向目标未通过 HTTPS 白名单校验。"
          };
        }
        currentUrl = nextUrl;
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          status: response.status,
          finalUrl: currentUrl,
          title: null,
          excerpt: null,
          error: `HTTP ${response.status}`
        };
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.toLowerCase().includes("application/pdf")) {
        const bytes = await readBoundedBytes(response, maxBytes);
        const { title, excerpt, fragments } = await (
          options.pdfTextExtractor || extractPdfText
        )(bytes, excerptChars);
        return {
          ok: true,
          status: response.status,
          finalUrl: currentUrl,
          title,
          excerpt,
          fragments,
          ...(!excerpt ? { error: "PDF 可达，但未提取到可用文本。" } : {})
        };
      }
      if (!contentType.toLowerCase().includes("text/html")) {
        return {
          ok: true,
          status: response.status,
          finalUrl: currentUrl,
          title: null,
          excerpt: null,
          error: "非 HTML 内容，跳过正文提取。"
        };
      }

      const html = await readBoundedText(response, maxBytes);
      const { title, excerpt, fragments } = extractText(html, excerptChars);
      return {
        ok: true,
        status: response.status,
        finalUrl: currentUrl,
        title,
        excerpt,
        fragments
      };
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "抓取超时。"
          : error instanceof Error
            ? error.message
            : "抓取失败。";
      return {
        ok: false,
        status: null,
        finalUrl: currentUrl,
        title: null,
        excerpt: null,
        error: message
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    status: null,
    finalUrl: currentUrl,
    title: null,
    excerpt: null,
    error: "抓取失败。"
  };
};

export const groundCourseSources = async (
  urls: string[],
  options: GroundOptions = {}
): Promise<SourceDigest[]> => {
  const uniqueUrls = [...new Set(urls)].slice(0, 8);
  const results: SourceDigest[] = [];
  for (const url of uniqueUrls) {
    results.push(await groundCourseSource(url, options));
  }
  return results;
};
