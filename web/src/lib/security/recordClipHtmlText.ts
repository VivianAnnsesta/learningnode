import { RECORD_CLIP_TEXT_LIMIT } from "../learning/recordClipContracts";

const ignored = new Set(["script", "style", "noscript", "template", "svg", "math", "iframe", "object", "nav", "footer"]);
const blocks = new Set(["p", "div", "section", "article", "main", "header", "aside", "blockquote", "pre", "ul", "ol", "li", "table", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr"]);
const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", ndash: "–", mdash: "—", hellip: "…", copy: "©", reg: "®" };

/** Bounded, single-pass plain-text projection; it does not parse a DOM or execute HTML. */
export function extractRecordClipHtmlText(html: string, check: () => void = () => {}) {
  const body: string[] = [], title: string[] = [];
  let bodyLength = 0, titleLength = 0, gap = 0, titleGap = false, truncated = false;
  let head = false, inTitle = false, skip: string | null = null, nextCheck = 0;
  const checkpoint = (position: number) => { if (position >= nextCheck) { check(); nextCheck = position + 1024; } };
  const emit = (value: string) => {
    for (const char of value) {
      if (/\s/u.test(char) || /[\u0000-\u001f\u007f-\u009f]/u.test(char)) {
        if (inTitle) titleGap = true; else gap = Math.max(gap, 1);
        continue;
      }
      if (inTitle) {
        if (titleLength + char.length + (titleGap && titleLength ? 1 : 0) <= 500) {
          if (titleGap && titleLength) { title.push(" "); titleLength++; }
          title.push(char); titleLength += char.length;
        }
        titleGap = false;
      } else if (!head && !truncated) {
        const separator = bodyLength ? gap === 2 ? "\n\n" : gap ? " " : "" : "";
        if (bodyLength + separator.length + char.length <= RECORD_CLIP_TEXT_LIMIT) {
          if (separator) { body.push(separator); bodyLength += separator.length; }
          body.push(char); bodyLength += char.length;
        } else truncated = true;
        gap = 0;
      }
    }
  };
  for (let i = 0; i < html.length;) {
    checkpoint(i);
    if (html[i] === "<") {
      if (html.startsWith("<!--", i)) {
        i += 4;
        while (i < html.length && !html.startsWith("-->", i)) { checkpoint(i); i++; }
        i = Math.min(html.length, i + 3); continue;
      }
      let cursor = i + 1;
      const closing = html[cursor] === "/"; if (closing) cursor++;
      const nameStart = cursor;
      while (cursor < html.length && /[A-Za-z0-9:-]/.test(html[cursor])) { checkpoint(cursor); cursor++; }
      const name = html.slice(nameStart, Math.min(cursor, nameStart + 32)).toLowerCase();
      if (!name && html[cursor] !== "!" && html[cursor] !== "?") { if (!skip) emit("<"); i++; continue; }
      let quote = "";
      while (cursor < html.length) {
        checkpoint(cursor);
        const char = html[cursor++];
        if (quote) { if (char === quote) quote = ""; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === ">") break;
      }
      if (skip) { if (closing && name === skip) skip = null; }
      else if (ignored.has(name) && !closing && html[cursor - 2] !== "/") skip = name;
      else if (name === "head") head = !closing;
      else if (name === "title") { inTitle = !closing; titleGap = false; }
      else if (blocks.has(name)) gap = 2;
      i = cursor; continue;
    }
    if (skip) { i++; continue; }
    if (html[i] === "&") {
      let end = i + 1;
      while (end < html.length && end - i <= 32 && /[A-Za-z0-9#]/.test(html[end])) end++;
      if (html[end] === ";") {
        const token = html.slice(i + 1, end); let decoded = Object.prototype.hasOwnProperty.call(entities, token) ? entities[token] : undefined;
        if (token[0] === "#") {
          const hex = token[1]?.toLowerCase() === "x", digits = token.slice(hex ? 2 : 1);
          if ((hex ? /^[0-9a-f]+$/i : /^[0-9]+$/).test(digits)) {
            const value = Number.parseInt(digits, hex ? 16 : 10);
            if (value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)) decoded = String.fromCodePoint(value);
          }
        }
        if (decoded !== undefined) { emit(decoded); i = end + 1; continue; }
      }
    }
    const point = html.codePointAt(i)!; const char = String.fromCodePoint(point);
    emit(char); i += char.length;
  }
  check();
  return { title: title.join(""), text: body.join(""), truncated };
}
