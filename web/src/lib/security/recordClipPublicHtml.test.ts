import { describe, expect, it, vi } from "vitest";
import { EventEmitter, once } from "node:events";
import { PassThrough, type Duplex } from "node:stream";
import { createServer, request as requestHttps, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { createRecordClipPublicHtmlFetcher, isPublicRecordClipAddress, parsePublicRecordClipUrl, RecordClipPublicHtmlError, requestPinnedRecordClipHtml } from "./recordClipPublicHtml";

function nativeDouble(replies: { status?: number; location?: string; body?: string | Buffer; headers?: Record<string, string | undefined>; peer?: string; before?: () => void }[]) {
  const options: RequestOptions[] = [], responses: PassThrough[] = [], requests: (EventEmitter & { destroyed: boolean })[] = [];
  const request = (input: RequestOptions, callback: (response: IncomingMessage) => void) => {
    options.push(input); const reply = replies.shift() ?? {};
    const req = Object.assign(new EventEmitter(), { destroyed: false, destroy() { this.destroyed = true; return this; }, end() {
      queueMicrotask(() => {
        if (req.destroyed) return;
        const tls = Object.assign(new EventEmitter(), { authorized: true, remoteAddress: reply.peer ?? "1.1.1.1" });
        req.emit("socket", tls); tls.emit("secureConnect");
        if (req.destroyed) return;
        reply.before?.();
        const res = Object.assign(new PassThrough(), { statusCode: reply.status ?? 200, headers: { "content-type": "text/html; charset=utf-8", ...reply.headers, ...(reply.location ? { location: reply.location } : {}) }, complete: true });
        responses.push(res); callback(res as unknown as IncomingMessage);
        if (!res.destroyed) res.end(reply.body ?? "<p>Actual text</p>");
      }); return this;
    } });
    requests.push(req); return req as unknown as ClientRequest;
  };
  return { request, options, responses, requests };
}

describe("public HTML URL and address policy", () => {
  it.each(["0.1.2.3", "10.1.1.1", "100.64.1.1", "127.0.0.1", "169.254.169.254", "172.31.2.3", "192.168.1.1", "192.0.0.8", "192.0.2.1", "192.88.99.1", "198.18.0.1", "198.51.100.2", "203.0.113.2", "224.0.0.1", "255.255.255.255", "::", "::1", "::ffff:8.8.8.8", "::ffff:127.0.0.1", "64:ff9b::a00:1", "64:ff9b:1::1", "100::1", "2001:2::1", "2001::1", "2001:db8::1", "2002:7f00:1::1", "fc00::1", "fe80::1", "ff02::1", "3fff::1", "fe80::1%eth0", "not an IP"])('rejects special-purpose or ambiguous address %s', address => {
    expect(isPublicRecordClipAddress(address)).toBe(false);
  });
  it.each(["1.1.1.1", "8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"])("accepts ordinary globally routable address %s", address => {
    expect(isPublicRecordClipAddress(address)).toBe(true);
  });
  it.each(["http://example.com", "https://user:password@example.com/", "https://example.com/\nheader", "https://localhost/a", "https://x.internal/a", "https://2130706433/", "https://0x7f000001/", "https://[::1]/"])("rejects unsafe URL %s", value => {
    expect(() => parsePublicRecordClipUrl(value)).toThrow(RecordClipPublicHtmlError);
  });
  it("retains a valid HTTPS custom port, IDN and fragment identity", () => {
    expect(parsePublicRecordClipUrl("https://例子.com:8443/path?q=yes#part").href).toBe("https://xn--fsqu00a.com:8443/path?q=yes#part");
  });
});

describe("whole-operation policy with deterministic network boundaries", () => {
  it("rejects any private/malformed/mismatched/empty DNS answer before invoking the adapter", async () => {
    for (const answers of [[], [{ address: "1.1.1.1", family: 4 }, { address: "10.0.0.1", family: 4 }], [{ address: "1.1.1.1", family: 6 }]] as {address:string;family:4|6}[][]) {
      const wire = nativeDouble([]);
      await expect(createRecordClipPublicHtmlFetcher({ resolveAll: async () => answers, request: wire.request })("https://example.com")).rejects.toMatchObject({ code: "BLOCKED_ADDRESS", status: 400 });
      expect(wire.options).toHaveLength(0);
    }
  });
  it("pins the sole actual lookup, preserves Host/SNI/port, and sends only its fixed credential-free headers", async () => {
    const wire = nativeDouble([{}]); const resolver = vi.fn().mockResolvedValue([{ address: "1.1.1.1", family: 4 }]);
    const result = await createRecordClipPublicHtmlFetcher({ resolveAll: resolver, request: wire.request })("https://example.com:8443/p?q=a#fragment");
    expect(result).toMatchObject({ requestedUrl: "https://example.com:8443/p?q=a#fragment", finalUrl: "https://example.com:8443/p?q=a#fragment", title: "example.com", text: "Actual text", truncated: false });
    expect(resolver).toHaveBeenCalledTimes(1);
    const options = wire.options[0];
    expect(options).toMatchObject({ hostname: "example.com", port: "8443", path: "/p?q=a", servername: "example.com", rejectUnauthorized: true, agent: false, autoSelectFamily: false, family: 4 });
    expect(options.headers).toEqual({ Host: "example.com:8443", Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity", "User-Agent": "EnglishNode-RecordClip/1.0" });
    await new Promise<void>((resolve, reject) => {
      const lookup = options.lookup as (name: string, options: object, callback: (error: Error | null, address: string, family: number) => void) => void;
      lookup("example.com", {}, (error, address, family) => { if (error) return reject(error); expect([address, family]).toEqual(["1.1.1.1", 4]); resolve(); });
    });
  });
  it("revalidates each redirect and rejects a private destination without a second request", async () => {
    const wire = nativeDouble([{ status: 302, location: "https://redirect.example/" }]);
    const resolver = vi.fn().mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }]).mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    await expect(createRecordClipPublicHtmlFetcher({ resolveAll: resolver, request: wire.request })("https://example.com/")).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    expect(wire.options).toHaveLength(1); expect(wire.responses[0].destroyed).toBe(true);
  });
  it.each(["http://example.com/", "https://user:secret@example.com/", "https://[::1]/"])("rejects unsafe redirect %s", async location => {
    const wire = nativeDouble([{ status: 302, location }]);
    await expect(createRecordClipPublicHtmlFetcher({ resolveAll: async () => [{ address: "1.1.1.1", family: 4 }], request: wire.request })("https://example.com/")).rejects.toBeInstanceOf(RecordClipPublicHtmlError);
    expect(wire.options).toHaveLength(1);
  });
  it("follows a bounded relative HTTPS redirect", async () => {
    const wire = nativeDouble([{ status: 307, location: "/next" }, { body: "<title>Read</title><p>Done</p>" }]);
    const result = await createRecordClipPublicHtmlFetcher({ resolveAll: async () => [{ address: "1.1.1.1", family: 4 }], request: wire.request })("https://example.com/a");
    expect(result).toMatchObject({ finalUrl: "https://example.com/next", title: "Read", text: "Done" });
  });
  it("does not reset the deadline across redirects", async () => {
    let time = 0; const wire = nativeDouble([{ status: 302, location: "/next", before: () => { time += 20; } }, { before: () => { time += 20; } }]);
    await expect(createRecordClipPublicHtmlFetcher({ resolveAll: async () => [{ address: "1.1.1.1", family: 4 }], request: wire.request, now: () => time, timeoutMs: 30 })("https://example.com")).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
    expect(wire.options).toHaveLength(2); expect(wire.requests[1].destroyed).toBe(true);
  });
  it("returns on a hung DNS deadline and never starts a request when DNS resolves late", async () => {
    let settle!: (value: {address:string;family:4}[]) => void;
    const wire = nativeDouble([]), pending = new Promise<{address:string;family:4}[]>(resolve => { settle = resolve; });
    await expect(createRecordClipPublicHtmlFetcher({ resolveAll: () => pending, request: wire.request, timeoutMs: 15 })("https://example.com")).rejects.toMatchObject({ code: "TIMEOUT" });
    settle([{ address: "1.1.1.1", family: 4 }]); await Promise.resolve(); await Promise.resolve();
    expect(wire.options).toHaveLength(0);
  });
  it("honors already-cancelled callers before resolving or connecting", async () => {
    const controller = new AbortController(); controller.abort(); const resolver = vi.fn();
    await expect(createRecordClipPublicHtmlFetcher({ resolveAll: resolver })("https://example.com", { signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED", status: 499 });
    expect(resolver).not.toHaveBeenCalled();
  });
  it("cancels while DNS is pending and ignores its eventual public result", async () => {
    const controller = new AbortController(); let settle!: (value: {address:string;family:4}[]) => void;
    const wire = nativeDouble([]), pending = new Promise<{address:string;family:4}[]>(resolve => { settle = resolve; });
    const result = createRecordClipPublicHtmlFetcher({ resolveAll: () => pending, request: wire.request })("https://example.com", { signal: controller.signal });
    controller.abort(); await expect(result).rejects.toMatchObject({ code: "ABORTED" });
    settle([{ address: "1.1.1.1", family: 4 }]); await Promise.resolve(); expect(wire.options).toHaveLength(0);
  });
  it("rejects invalid UTF-8 instead of relabelling lossy bytes as a retrieved quote", async () => {
    const wire = nativeDouble([{ body: Buffer.from([0xc3, 0x28]) }]);
    await expect(createRecordClipPublicHtmlFetcher({ resolveAll: async () => [{ address: "1.1.1.1", family: 4 }], request: wire.request })("https://example.com")).rejects.toMatchObject({ code: "UNSUPPORTED_ENCODING" });
  });
  it("fails visibly after the redirect count limit and closes each discarded response", async () => {
    const wire = nativeDouble([{ status: 302, location: "/one" }, { status: 302, location: "/two" }, { status: 302, location: "/three" }]);
    await expect(createRecordClipPublicHtmlFetcher({ resolveAll: async () => [{ address: "1.1.1.1", family: 4 }], request: wire.request })("https://example.com")).rejects.toMatchObject({ code: "UPSTREAM" });
    expect(wire.options).toHaveLength(3); expect(wire.responses.every(response => response.destroyed)).toBe(true);
  });
  it.each([
    { headers: { "content-type": "application/pdf" }, code: "UNSUPPORTED_MEDIA" },
    { headers: { "content-type": "text/html; charset=gbk" }, code: "UNSUPPORTED_ENCODING" },
    { headers: { "content-encoding": "gzip" }, code: "UNSUPPORTED_ENCODING" },
    { headers: { "content-length": "999999999" }, code: "TOO_LARGE" },
    { body: "x".repeat(101), code: "TOO_LARGE" },
    { body: "<title>Only title</title><script>no</script>", code: "EMPTY_TEXT" },
    { status: 401, code: "UPSTREAM" },
    { peer: "10.0.0.1", code: "UPSTREAM" }
  ])("rejects visibly and destroys streams: $code", async ({ code, ...reply }) => {
    const wire = nativeDouble([reply]);
    await expect(createRecordClipPublicHtmlFetcher({ resolveAll: async () => [{ address: "1.1.1.1", family: 4 }], request: wire.request, maxBytes: 100 })("https://example.com")).rejects.toMatchObject({ code });
    if (code !== "EMPTY_TEXT") expect(wire.requests[0].destroyed).toBe(true);
    for (const response of wire.responses) expect(response.destroyed || response.readableEnded).toBe(true);
  });
  it("never exposes resolver internals, submitted credentials or arbitrary error.status", async () => {
    const fetch = createRecordClipPublicHtmlFetcher({ resolveAll: async () => { throw Object.assign(new Error("token-secret 10.0.0.1"), { status: 200 }); } });
    await expect(fetch("https://example.com")).rejects.toMatchObject({ code: "UPSTREAM", status: 502 });
    await expect(fetch("https://example.com")).rejects.not.toThrow("token-secret");
  });
});

// A fresh synthetic CA/key is generated in memory: no private key is shipped or trust disabled.
function tlsFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const der = (tag: number, value: Buffer) => {
    const bytes = value.length < 128 ? Buffer.from([value.length]) : (() => { const hex = value.length.toString(16).padStart(value.length > 255 ? 4 : 2, "0"); const b = Buffer.from(hex, "hex"); return Buffer.concat([Buffer.from([0x80 | b.length]), b]); })();
    return Buffer.concat([Buffer.from([tag]), bytes, value]);
  };
  const seq = (...parts: Buffer[]) => der(0x30, Buffer.concat(parts)), oid = (hex: string) => Buffer.from(hex, "hex");
  const algorithm = seq(oid("06092a864886f70d01010b"), der(0x05, Buffer.alloc(0)));
  const name = seq(der(0x31, seq(oid("0603550403"), der(0x0c, Buffer.from("clip-test.example")))));
  const time = (offset: number) => der(0x17, Buffer.from(new Date(Date.now() + offset).toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z"));
  const extensions = der(0xa3, seq(seq(oid("0603551d13"), der(0x01, Buffer.from([255])), der(0x04, seq(der(0x01, Buffer.from([255]))))), seq(oid("0603551d11"), der(0x04, seq(der(0x82, Buffer.from("clip-test.example")))))));
  const serial = randomBytes(12); serial[0] &= 0x7f;
  const tbs = seq(der(0xa0, der(0x02, Buffer.from([2]))), der(0x02, serial), algorithm, name, seq(time(-60000), time(86400000)), name, publicKey.export({ type: "spki", format: "der" }), extensions);
  const certificate = seq(tbs, algorithm, der(0x03, Buffer.concat([Buffer.from([0]), sign("sha256", tbs, privateKey)])));
  const cert = `-----BEGIN CERTIFICATE-----\n${certificate.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`;
  return { cert, key: privateKey.export({ type: "pkcs8", format: "pem" }) };
}
const identity = tlsFixture();
async function withTls(body: (request: IncomingMessage, response: import("node:http").ServerResponse) => void, run: (port: number) => Promise<void>) {
  const server = createServer(identity, body), sockets = new Set<Duplex>();
  server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture address"); await run(address.port); }
  finally { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const context = (controller = new AbortController(), maxBytes = 1024) => ({ signal: controller.signal, maxBytes, check() { if (controller.signal.aborted) throw new RecordClipPublicHtmlError("ABORTED"); } });
const trustedRequest = (options: RequestOptions, callback: (response: IncomingMessage) => void) => requestHttps({ ...options, ca: identity.cert }, callback);

describe("native TLS adapter with an isolated synthetic CA (public URL policy tested separately)", () => {
  it("actually connects to the pinned socket while retaining original Host, port and verified SNI", async () => {
    const seen: string[] = [];
    await withTls((req, res) => { seen.push(req.headers.host!, (req.socket as import("node:tls").TLSSocket & { servername: string }).servername); res.setHeader("Content-Type", "text/html"); res.end("<p>Native TLS text</p>"); }, async port => {
      const result = await requestPinnedRecordClipHtml({ url: new URL(`https://clip-test.example:${port}/`), address: "127.0.0.1", family: 4 }, context(), trustedRequest);
      expect(result.bytes.toString()).toBe("<p>Native TLS text</p>"); expect(seen).toEqual([`clip-test.example:${port}`, "clip-test.example"]);
    });
  });
  it("retains default CA rejection and hostname rejection", async () => {
    await withTls((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end("<p>text</p>"); }, async port => {
      await expect(requestPinnedRecordClipHtml({ url: new URL(`https://clip-test.example:${port}/`), address: "127.0.0.1", family: 4 }, context())).rejects.toMatchObject({ code: "UPSTREAM" });
      await expect(requestPinnedRecordClipHtml({ url: new URL(`https://wrong-name.example:${port}/`), address: "127.0.0.1", family: 4 }, context(), trustedRequest)).rejects.toMatchObject({ code: "UPSTREAM" });
    });
  });
  it("rejects actual oversized and prematurely closed response streams", async () => {
    await withTls((_req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end("x".repeat(129)); }, async port => {
      await expect(requestPinnedRecordClipHtml({ url: new URL(`https://clip-test.example:${port}`), address: "127.0.0.1", family: 4 }, context(undefined, 128), trustedRequest)).rejects.toMatchObject({ code: "TOO_LARGE" });
    });
    await withTls((_req, res) => { res.writeHead(200, { "Content-Type": "text/html", "Content-Length": "100" }); res.write("<p>incomplete"); setTimeout(() => res.destroy(), 5); }, async port => {
      await expect(requestPinnedRecordClipHtml({ url: new URL(`https://clip-test.example:${port}`), address: "127.0.0.1", family: 4 }, context(), trustedRequest)).rejects.toMatchObject({ code: "UPSTREAM" });
    });
  });
  it("cancels a real TLS response body and releases its socket", async () => {
    const controller = new AbortController(); let onBody!: () => void;
    const bodyReady = new Promise<void>(resolve => { onBody = resolve; });
    await withTls((_req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.write("<p>partial"); onBody(); }, async port => {
      const result = requestPinnedRecordClipHtml({ url: new URL(`https://clip-test.example:${port}`), address: "127.0.0.1", family: 4 }, context(controller), trustedRequest);
      await Promise.race([bodyReady, result]); controller.abort(); await expect(result).rejects.toMatchObject({ code: "ABORTED" });
    });
  });
  it("actively destroys a native TLS connection waiting for headers at the shared deadline", async () => {
    const controller = new AbortController();
    let arrived!: () => void; const received = new Promise<void>(resolve => { arrived = resolve; });
    await withTls(() => { arrived(); }, async port => {
      const shared = { ...context(controller), check() { if (controller.signal.aborted) throw new RecordClipPublicHtmlError("TIMEOUT"); } };
      const result = requestPinnedRecordClipHtml({ url: new URL(`https://clip-test.example:${port}`), address: "127.0.0.1", family: 4 }, shared, trustedRequest);
      await Promise.race([received, result]);
      const timer = setTimeout(() => controller.abort(), 30);
      try { await expect(result).rejects.toMatchObject({ code: "TIMEOUT", status: 504 }); }
      finally { clearTimeout(timer); }
    });
  });
});
