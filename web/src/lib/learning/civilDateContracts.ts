const timeZones = new Map<string, boolean>();

function monthLength(year: number, month: number) {
  return [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function isCivilDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= monthLength(year, month);
}
export function parseCivilDay(value: unknown): string {
  if (!isCivilDay(value)) throw new Error("日期需为真实公历YYYY-MM-DD，年份为0001至9999。");
  return value;
}
export function parseCalendarMonth(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value) || !isCivilDay(`${value}-01`)) throw new Error("月份需为有效的YYYY-MM。");
  return value;
}
export function calendarMonthBounds(value: unknown) {
  const month = parseCalendarMonth(value), count = monthLength(Number(month.slice(0, 4)), Number(month.slice(5)));
  const days = Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
  return { from: days[0], to: days[days.length - 1], days };
}
export function shiftCalendarMonth(value: string, delta: number): string | null {
  const month = parseCalendarMonth(value);
  if (!Number.isSafeInteger(delta)) throw new Error("月份移动量无效。");
  const index = (Number(month.slice(0, 4)) - 1) * 12 + Number(month.slice(5)) - 1 + delta;
  if (index < 0 || index >= 9999 * 12) return null;
  return `${String(Math.floor(index / 12) + 1).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}
export function parseCivilTimeZone(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 100 || value !== value.trim() || /\p{Cc}/u.test(value) || /^[+-]/.test(value)) throw new Error("请提供有效的IANA日期时区或UTC。");
  let valid = timeZones.get(value);
  if (valid === undefined) {
    try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); valid = true; }
    catch { valid = false; }
    if (timeZones.size >= 128) timeZones.delete(timeZones.keys().next().value!);
    timeZones.set(value, valid);
  }
  if (!valid) throw new Error("日期时区无效，请使用IANA名称或UTC。");
  return value;
}
export function createCivilDayFormatter(value: string) {
  const timeZone = parseCivilTimeZone(value);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, calendar: "gregory", numberingSystem: "latn", era: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  return (value: Date | string | number): string | null => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("记录日期无效。");
    const parts = formatter.formatToParts(date), get = (name: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === name)?.value || "";
    if (get("era") !== "AD") return null;
    const day = `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}`;
    return isCivilDay(day) ? day : null;
  };
}
export function getCivilDay(now: Date, timeZone: string): string {
  const day = createCivilDayFormatter(timeZone)(now);
  if (!day) throw new Error("当前日期超出支持范围。");
  return day;
}
