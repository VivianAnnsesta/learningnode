import { describe, expect, it } from "vitest";
import {
  extractPdfText,
  groundCourseSource,
  groundCourseSources
} from "./sourceGroundingService";

const buildMinimalPdf = (text: string) => {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(body).byteLength);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(body).byteLength;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(body);
};

const htmlResponse = (html: string, status = 200) => ({
  status,
  headers: {
    get: (name: string) =>
      name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null
  },
  body: null,
  text: async () => html
});

describe("groundCourseSource", () => {
  it("parses text from a bounded PDF buffer with the production extractor", async () => {
    const result = await extractPdfText(
      buildMinimalPdf("Exam syllabus calculus limits derivatives"),
      1200
    );

    expect(result.excerpt).toContain("Exam syllabus calculus limits derivatives");
  });

  it("rejects non-HTTPS urls before any fetch", async () => {
    let called = 0;
    const result = await groundCourseSource("http://example.com/course", {
      fetchImpl: (async () => {
        called += 1;
        return htmlResponse("<html></html>");
      }) as never
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("白名单");
    expect(called).toBe(0);
  });

  it("rejects loopback and private source addresses before any fetch", async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return htmlResponse("<html></html>");
    }) as never;

    const loopback = await groundCourseSource("https://127.0.0.1/private", {
      fetchImpl
    });
    const ipv6Loopback = await groundCourseSource("https://[::1]/private", {
      fetchImpl
    });
    const linkLocal = await groundCourseSource(
      "https://169.254.169.254/latest/meta-data",
      { fetchImpl }
    );
    const privateDns = await groundCourseSource("https://source.example/course", {
      fetchImpl,
      resolveHostname: async () => ["10.0.0.8"]
    });

    expect(loopback.ok).toBe(false);
    expect(ipv6Loopback.ok).toBe(false);
    expect(linkLocal.ok).toBe(false);
    expect(privateDns.ok).toBe(false);
    expect(loopback.error).toContain("公开互联网");
    expect(privateDns.error).toContain("公开互联网");
    expect(called).toBe(0);
  });

  it("rechecks a redirect target after DNS resolution", async () => {
    let called = 0;
    const result = await groundCourseSource("https://public.example/course", {
      fetchImpl: (async () => {
        called += 1;
        return {
          status: 302,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "location"
                ? "https://redirect.example/private"
                : null
          },
          body: null,
          text: async () => ""
        };
      }) as never,
      resolveHostname: async (hostname) =>
        hostname === "public.example" ? ["203.0.114.10"] : ["192.168.1.20"]
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("公开互联网");
    expect(called).toBe(1);
  });

  it("extracts title, meta description and bounded excerpt", async () => {
    const html = `<html><head><title>MIT Linear Algebra</title>
      <meta name="description" content="Gilbert Strang's course &amp; materials">
      <style>body{color:red}</style></head>
      <body><nav>menu</nav><h1>18.06 Linear Algebra</h1>
      <script>alert(1)</script><p>Course overview text.</p></body></html>`;
    const result = await groundCourseSource("https://ocw.mit.edu/courses/18-06", {
      fetchImpl: (async () => htmlResponse(html)) as never
    });
    expect(result.ok).toBe(true);
    expect(result.title).toBe("MIT Linear Algebra");
    expect(result.excerpt).toContain("Gilbert Strang's course & materials");
    expect(result.excerpt).toContain("18.06 Linear Algebra");
    expect(result.excerpt).not.toContain("alert");
  });

  it("extracts bounded text from a public remote PDF without uploading a local file", async () => {
    const pdfBytes = new TextEncoder().encode("%PDF-1.4 fake test payload");
    const result = await groundCourseSource(
      "https://example.edu/exam-syllabus.pdf",
      {
        fetchImpl: (async () => ({
          status: 200,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-type"
                ? "application/pdf"
                : null
          },
          body: null,
          text: async () => "",
          arrayBuffer: async () => pdfBytes.buffer
        })) as never,
        pdfTextExtractor: async (bytes, excerptChars) => ({
          title: "全国硕士研究生招生考试数学大纲",
          excerpt: new TextDecoder()
            .decode(bytes)
            .concat(" 极限 导数 积分")
            .slice(0, excerptChars)
        })
      }
    );

    expect(result.ok).toBe(true);
    expect(result.title).toContain("数学大纲");
    expect(result.excerpt).toContain("极限");
  });

  it("follows https redirects within the limit", async () => {
    const seen: string[] = [];
    const result = await groundCourseSource("https://a.edu/course", {
      fetchImpl: (async (url: string) => {
        seen.push(url);
        if (seen.length === 1) {
          return {
            status: 302,
            headers: { get: (n: string) => (n === "location" ? "/moved" : null) },
            body: null,
            text: async () => ""
          };
        }
        return htmlResponse("<title>Moved page</title>");
      }) as never
    });
    expect(result.ok).toBe(true);
    expect(result.finalUrl).toBe("https://a.edu/moved");
    expect(result.title).toBe("Moved page");
  });

  it("rejects redirects to non-https targets", async () => {
    const result = await groundCourseSource("https://a.edu/course", {
      fetchImpl: (async () => ({
        status: 302,
        headers: { get: () => "http://evil.example/x" },
        body: null,
        text: async () => ""
      })) as never
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("白名单");
  });

  it("reports http errors without throwing", async () => {
    const result = await groundCourseSource("https://a.edu/missing", {
      fetchImpl: (async () => htmlResponse("not found", 404)) as never
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it("reports fetch failures without throwing", async () => {
    const result = await groundCourseSource("https://a.edu/down", {
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as never
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ECONNREFUSED");
  });
});

describe("groundCourseSources", () => {
  it("deduplicates urls and preserves order", async () => {
    const seen: string[] = [];
    const results = await groundCourseSources(
      ["https://a.edu/1", "https://a.edu/1", "https://b.edu/2"],
      {
        fetchImpl: (async (url: string) => {
          seen.push(url);
          return htmlResponse(`<title>${url}</title>`);
        }) as never
      }
    );
    expect(seen).toEqual(["https://a.edu/1", "https://b.edu/2"]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
