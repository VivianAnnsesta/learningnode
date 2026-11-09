import { describe, expect, it } from "vitest";
import { builtInRecordTemplates, parseRecordTemplateConfig, parseRecordTemplateTimeZone, parseRecordTemplateTitle, renderRecordTemplate } from "./recordTemplateContracts";

describe("个人记录模板合同", () => {
  it("规范名称但保留正文缩进、CRLF、孤立CR和结尾换行", () => {
    expect(parseRecordTemplateTitle("  我的疑问 😀  ")).toBe("我的疑问 😀");
    const body = "\t第一行\r\n  second\rthird\n";
    expect(parseRecordTemplateConfig({ body, timeZone: "US/Pacific" })).toEqual({ body, timeZone: "US/Pacific" });
  });
  it.each([undefined, null, [], {}, "", "  ", "a".repeat(121), "tab\tname", "line\nname", "null\0name", "bad\ud800", "bad\udc00"])("拒绝无效模板名称 %#", value => {
    expect(() => parseRecordTemplateTitle(value)).toThrow();
  });
  it("名称及正文容量按UTF16边界，完整emoji不可切半", () => {
    expect(parseRecordTemplateTitle("😀".repeat(60))).toHaveLength(120);
    expect(() => parseRecordTemplateTitle("😀".repeat(61))).toThrow();
    expect(parseRecordTemplateConfig({ body: "😀".repeat(12000), timeZone: "UTC" }).body).toHaveLength(24000);
    expect(() => parseRecordTemplateConfig({ body: "😀".repeat(12001), timeZone: "UTC" })).toThrow();
  });
  it.each([undefined, null, [], {}, { body: "正文" }, { timeZone: "UTC" }, { body: "正文", timeZone: "UTC", domainId: "elsewhere" }, { body: "正文", timeZone: "UTC", sourceType: "accepted_ai" }, { body: "正文", timeZone: "UTC", config: {} }])("拒绝缺少或扩大配置 %#", value => {
    expect(() => parseRecordTemplateConfig(value)).toThrow();
  });
  it.each(["", " \t\r\n ", "x".repeat(24001), "bad\0body", "bad\u000bbody", "bad\u0085body", "bad\u007fbody", "bad\ud800", "bad\udc00", "bad\ud800X"])("拒绝空白、超长、控制或不完整正文 %#", body => {
    expect(() => parseRecordTemplateConfig({ body, timeZone: "UTC" })).toThrow();
  });
  it.each([undefined, null, "", "+08:00", "-0700", " UTC", "UTC ", "Bad/Zone", "UTC\n", "bad\ud800"])("时区不能缺省或用无效/数值偏移 %#", timeZone => {
    expect(() => parseRecordTemplateTimeZone(timeZone)).toThrow();
  });
  it("时区名和有效别名原样保留", () => {
    for (const zone of ["UTC", "Asia/Shanghai", "America/Los_Angeles", "US/Pacific", "Etc/GMT+8"]) expect(parseRecordTemplateTimeZone(zone)).toBe(zone);
  });
  it("以同一时间按指定时区展开年月日和24小时时分", () => {
    const now = new Date("2026-11-09T00:05:59.999Z"), before = now.getTime();
    expect(renderRecordTemplate({ body: "{{title}}\r\n{{date}} {{time}}\n{{date}}", timeZone: "America/Los_Angeles" }, { title: "我的记录", now })).toEqual({ text: "我的记录\r\n2026-11-08 16:05\n2026-11-08", capturedAt: "2026-11-09T00:05:59.999Z", timeZone: "America/Los_Angeles", hasUnresolvedVariables: false });
    expect(now.getTime()).toBe(before);
  });
  it("UTC午夜为00:00，保持公历和latn数字", () => {
    const preview = renderRecordTemplate({ body: "{{date}} {{time}}", timeZone: "UTC" }, { title: "", now: new Date("2028-02-29T00:00:00Z") });
    expect(preview.text).toBe("2028-02-29 00:00");
  });
  it("DST跳过和重复小时都由实际时间决定", () => {
    const render = (date: string) => renderRecordTemplate({ body: "{{date}} {{time}}", timeZone: "America/Los_Angeles" }, { title: "", now: new Date(date) }).text;
    expect(render("2026-03-08T09:59:00Z")).toBe("2026-03-08 01:59");
    expect(render("2026-03-08T10:00:00Z")).toBe("2026-03-08 03:00");
    expect(render("2026-11-01T08:30:00Z")).toBe("2026-11-01 01:30");
    expect(render("2026-11-01T09:30:00Z")).toBe("2026-11-01 01:30");
  });
  it("只展开一次，标题内变量和HTML按纯文本保留", () => {
    const preview = renderRecordTemplate({ body: "{{title}} | {{time}} | {{unknown}} | {{date:YYYY}} | {{ title }} | {{constructor}}", timeZone: "UTC" }, { title: "<img onerror=alert(1)> {{time}}", now: new Date("2026-11-09T12:04:00Z") });
    expect(preview.text).toBe("<img onerror=alert(1)> {{time}} | 12:04 | {{unknown}} | {{date:YYYY}} | {{ title }} | {{constructor}}");
    expect(preview.hasUnresolvedVariables).toBe(true);
  });
  it("标题中双花括号不被误报为模板中的未知变量", () => {
    expect(renderRecordTemplate({ body: "{{title}}", timeZone: "UTC" }, { title: "{{unknown}}", now: new Date("2026-11-09T00:00:00Z") })).toMatchObject({ text: "{{unknown}}", hasUnresolvedVariables: false });
  });
  it("结果空白或膨胀超限时拒绝，不截断", () => {
    expect(() => renderRecordTemplate({ body: " {{title}}\n", timeZone: "UTC" }, { title: "" })).toThrow();
    expect(() => renderRecordTemplate({ body: "a".repeat(23990) + "{{title}}", timeZone: "UTC" }, { title: "long title!!" })).toThrow();
    expect(renderRecordTemplate({ body: "a".repeat(23990) + "{{title}}", timeZone: "UTC" }, { title: "1234567890" }).text).toHaveLength(24000);
  });
  it.each(["bad\ud800", "bad\udc00", "bad\nname", "a".repeat(501)])("拒绝不适合预览的记录标题 %#", title => {
    expect(() => renderRecordTemplate({ body: "正文", timeZone: "UTC" }, { title })).toThrow();
  });
  it("拒绝无效时间和超出四位公历范围，不产生伪日期", () => {
    for (const date of ["invalid", "0000-01-01T12:00:00Z", "+010000-01-01T00:00:00Z"]) expect(() => renderRecordTemplate({ body: "{{date}}", timeZone: "UTC" }, { title: "", now: new Date(date) })).toThrow();
    expect(() => renderRecordTemplate({ body: "{{date}}", timeZone: "America/Los_Angeles" }, { title: "", now: new Date("0001-01-01T00:00:00Z") })).toThrow();
  });
  it("内置示例独立可预览、不写入配置或要求全部填写", () => {
    expect(new Set(builtInRecordTemplates.map(row => row.id)).size).toBe(3);
    for (const example of builtInRecordTemplates) {
      const config = { body: example.body, timeZone: "Asia/Shanghai" };
      const original = structuredClone(config);
      const preview = renderRecordTemplate(config, { title: "自己的问题", now: new Date("2026-11-09T02:00:00Z") });
      expect(preview.text).toContain("自己的问题"); expect(preview.text).toContain("2026-11-09");
      expect(config).toEqual(original);
    }
  });
});
