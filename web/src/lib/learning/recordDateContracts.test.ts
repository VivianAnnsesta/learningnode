import { describe, expect, it } from "vitest";
import { calendarMonthBounds, createCivilDayFormatter, getCivilDay, parseCalendarMonth, parseCivilDay, shiftCalendarMonth } from "./civilDateContracts";
import { parseAssignedRecordDate, readAssignedRecordDate } from "./recordDateContracts";
import { createKnowledgeDateMatcher } from "./knowledgeViewContracts";

describe("本人指定日期是可空的公历归档选择", () => {
  it("双null未指定、有效tuple和别名原样读取，不修改输入", () => {
    expect(parseAssignedRecordDate(null)).toBeNull();
    expect(readAssignedRecordDate(null, null)).toEqual({ recordDate: null });
    const value = { date: "2026-11-09", timeZone: "US/Pacific" }, before = structuredClone(value);
    expect(parseAssignedRecordDate(value)).toEqual(before); expect(value).toEqual(before);
    expect(readAssignedRecordDate(value.date, value.timeZone)).toEqual({ recordDate: before });
  });
  it.each([undefined, [], "2026-11-09", {}, { date: "2026-11-09" }, { timeZone: "UTC" }, { date: "2026-11-09", timeZone: "UTC", createdAt: "else" }, { date: "2026-11-09", timeZone: "UTC", sourceType: "user" }])("只允许明确清空或完整日期tuple %#", value => {
    expect(() => parseAssignedRecordDate(value)).toThrow();
  });
  it.each(["0001-01-01", "9999-12-31", "2000-02-29", "2028-02-29", "2026-11-09"])("接受真实四位公历日期 %s", date => {
    expect(parseAssignedRecordDate({ date, timeZone: "UTC" })).toEqual({ date, timeZone: "UTC" });
  });
  it.each(["0000-01-01", "10000-01-01", "1900-02-29", "2100-02-29", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-1-01", " 2026-11-09", "2026-11-09Z", "2026-11-09\0", "２０２６-１１-０９"])("拒绝伪日期 %s", date => {
    expect(() => parseAssignedRecordDate({ date, timeZone: "UTC" })).toThrow();
  });
  it.each(["", " UTC", "UTC ", "+08:00", "-0700", "Invalid/Zone", "UTC\n", "bad\ud800"])("时区不能默修/数值偏移或缺失 %#", timeZone => {
    expect(() => parseAssignedRecordDate({ date: "2026-11-09", timeZone })).toThrow();
  });
  it.each([["2026-11-09", null], [null, "UTC"], ["2026-02-29", "UTC"], ["2026-11-09", "Bad/Zone"], [undefined, undefined]])("旧坏raw与未指定区分并原样保留 %#", (date, timeZone) => {
    const raw = { date, timeZone }, before = { ...raw };
    expect(readAssignedRecordDate(date, timeZone)).toMatchObject({ recordDate: null, recordDateUnavailableReason: expect.any(String) }); expect(raw).toEqual(before);
  });
});

describe("月历公历和today", () => {
  it("按月份完整列出所有日，不用固定时长推算", () => {
    expect(calendarMonthBounds("2028-02")).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
    expect(calendarMonthBounds("1900-02").days).toHaveLength(28);
    expect(calendarMonthBounds("2000-02").days).toHaveLength(29);
    expect(calendarMonthBounds("2026-11").days).toHaveLength(30);
    expect(calendarMonthBounds("2026-12").days[30]).toBe("2026-12-31");
  });
  it.each(["", "0000-01", "10000-01", "2026-00", "2026-13", "2026-1", "2026-11-01", "2026-11\n"])("拒绝无效月份 %#", month => {
    expect(() => parseCalendarMonth(month)).toThrow();
  });
  it("跨年和支持边界移动月份，不产生year0", () => {
    expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01"); expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftCalendarMonth("0001-01", -1)).toBeNull(); expect(shiftCalendarMonth("9999-12", 1)).toBeNull();
    expect(() => shiftCalendarMonth("2026-11", 0.5)).toThrow();
  });
  it("today按明确时区、公历和同一instant得到，不改源Date", () => {
    const now = new Date("2026-11-09T00:30:00Z"), before = now.toISOString();
    expect(getCivilDay(now, "UTC")).toBe("2026-11-09"); expect(getCivilDay(now, "America/Los_Angeles")).toBe("2026-11-08"); expect(getCivilDay(now, "Asia/Shanghai")).toBe("2026-11-09");
    expect(now.toISOString()).toBe(before);
  });
  it("时间戳与公历边界明确，不把BCE当正年", () => {
    const format = createCivilDayFormatter("UTC");
    expect(format(new Date("0001-01-01T12:00:00Z"))).toBe("0001-01-01"); expect(format(new Date("0000-01-01T12:00:00Z"))).toBeNull();
    expect(() => format("invalid")).toThrow(); expect(() => parseCivilDay("2026-02-29")).toThrow();
  });
});

describe("第三种日期依据按当前修订字面日匹配", () => {
  const row = { createdAt: new Date("2026-11-10T00:30:00Z"), updatedAt: new Date("2026-11-12T00:30:00Z"), recordDate: "2026-11-01", recordDateTimeZone: "Asia/Tokyo" };
  it("浏览zone不会搬移本人日期，也不使用创建/更新时间回填", () => {
    for (const timeZone of ["UTC", "America/Los_Angeles", "Asia/Shanghai"]) {
      const matcher = createKnowledgeDateMatcher({ mode: "range", field: "recorded", timeZone, from: "2026-11-01", to: "2026-11-01" });
      expect(matcher.matches(row)).toBe(true); expect(matcher.dateOf(row)).toBe("2026-11-01");
      expect(matcher.matches({ ...row, recordDate: null, recordDateTimeZone: null })).toBe(false);
    }
  });
  it("支持已解码tuple并精确区别另外两个timestamp依据", () => {
    const recorded = createKnowledgeDateMatcher({ mode: "range", field: "recorded", timeZone: "UTC", from: "2026-11-01" });
    expect(recorded.matches({ ...row, recordDate: { date: "2026-11-01", timeZone: "UTC" } })).toBe(true);
    const created = createKnowledgeDateMatcher({ mode: "range", field: "created", timeZone: "UTC", from: "2026-11-10", to: "2026-11-10" });
    const updated = createKnowledgeDateMatcher({ mode: "range", field: "updated", timeZone: "UTC", from: "2026-11-12", to: "2026-11-12" });
    expect(created.matches(row)).toBe(true); expect(updated.matches(row)).toBe(true); expect(created.dateOf(row)).toBe("2026-11-10"); expect(updated.dateOf(row)).toBe("2026-11-12");
  });
  it("坏raw、半tuple和明确不可用都不匹配，不抛弃记录正文", () => {
    const matcher = createKnowledgeDateMatcher({ mode: "range", field: "recorded", timeZone: "UTC", from: "2026-01-01", to: "2026-12-31" });
    for (const record of [{ ...row, recordDate: "2026-02-29" }, { ...row, recordDateTimeZone: null }, { ...row, recordDateTimeZone: "Bad/Zone" }, { ...row, recordDateUnavailableReason: "bad" }]) expect(matcher.matches(record)).toBe(false);
    expect(createKnowledgeDateMatcher({ mode: "all", field: "recorded", timeZone: "UTC" }).matches({ ...row, recordDate: "bad" })).toBe(true);
  });
  it("相对窗口按查询时区today捕获一次，DST按日不按24小时", () => {
    const now = new Date("2026-03-09T07:30:00Z"), matcher = createKnowledgeDateMatcher({ mode: "last_days", field: "recorded", timeZone: "America/Los_Angeles", days: 2 }, now);
    now.setUTCDate(20);
    expect(matcher.window).toEqual({ field: "recorded", timeZone: "America/Los_Angeles", from: "2026-03-08", to: "2026-03-09" });
    expect(matcher.matches({ ...row, recordDate: "2026-03-08", recordDateTimeZone: "UTC" })).toBe(true); expect(matcher.matches({ ...row, recordDate: "2026-03-07" })).toBe(false);
  });
});
