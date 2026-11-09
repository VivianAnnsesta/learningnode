import { describe, expect, it } from "vitest";
import { extractRecordClipHtmlText } from "./recordClipHtmlText";

describe("bounded HTML plain-text projection", () => {
  it("keeps body order and readable boundaries without executing or returning markup", () => {
    const result = extractRecordClipHtmlText('<html><head><title>A &amp; B</title><meta name="description" content="not body"></head><body><nav>menu</nav><h1>Heading</h1><p>First <b>actual</b> paragraph.</p><script>alert(1)</script><style>body{}</style><p>Second &lt;literal&gt; &#x1f600; &#169;.</p><footer>footer</footer></body></html>');
    expect(result).toEqual({ title: "A & B", text: "Heading\n\nFirst actual paragraph.\n\nSecond <literal> 😀 ©.", truncated: false });
  });
  it("does not substitute a title, meta description or script for actual text", () => {
    expect(extractRecordClipHtmlText('<head><title>Only a title</title><meta content="summary"></head><body><script>x</script></body>').text).toBe("");
  });
  it("handles comments, quoted > attributes and case-insensitive ignored tags", () => {
    expect(extractRecordClipHtmlText('<P title="a > b">visible<!-- hidden <p> --></P><SCRIPT>hidden</SCRIPT><p>end</p>').text).toBe("visible\n\nend");
  });
  it("keeps a bounded exact prefix, including when the next paragraph cannot fit", () => {
    const result = extractRecordClipHtmlText(`<p>${"a".repeat(31999)}</p><p>xy</p>`);
    expect(result.text).toBe("a".repeat(31999)); expect(result.truncated).toBe(true);
  });
  it("does not split surrogate pairs and marks omitted body text", () => {
    const result = extractRecordClipHtmlText(`<p>${"a".repeat(31999)}😀z</p>`);
    expect(result.text).toBe("a".repeat(31999)); expect(result.truncated).toBe(true);
  });
  it("does not claim truncation for closing tags or whitespace after the exact limit", () => {
    expect(extractRecordClipHtmlText(`<p>${"x".repeat(32000)}</p> \n`).truncated).toBe(false);
  });
  it("bounds titles and removes control characters", () => {
    const result = extractRecordClipHtmlText(`<title>${"t".repeat(700)}</title><p>a\0b\u0080c</p>`);
    expect(result.title).toHaveLength(500); expect(result.text).toBe("a b c");
  });
  it.each([`<p>${"😀".repeat(15000)}</p>`, `<!--${"x".repeat(40000)}`, `<${"a".repeat(40000)}`, `<p a="${"x".repeat(40000)}`])("checks the same caller deadline throughout long text/tags/comments", html => {
    let checks = 0;
    expect(() => extractRecordClipHtmlText(html, () => { if (++checks >= 3) throw new Error("deadline"); })).toThrow("deadline");
  });
  it("treats malformed entities as literal text and never recursively decodes markup", () => {
    expect(extractRecordClipHtmlText("<p>&amp;lt;script&amp;gt; &#xD800; &unknown;</p>").text).toBe("&lt;script&gt; &#xD800; &unknown;");
  });
  it("treats inherited object names as literal entities and honors self-closing ignored elements", () => {
    expect(extractRecordClipHtmlText("<svg/><p>&constructor; &toString; text</p>").text).toBe("&constructor; &toString; text");
  });
});
