import { parseCivilDay, parseCivilTimeZone } from "./civilDateContracts";

export type AssignedRecordDate = { date: string; timeZone: string };
export function parseAssignedRecordDate(value: unknown): AssignedRecordDate | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("本人记录日期需为完整日期/时区或明确清空。");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 2 || !Object.prototype.hasOwnProperty.call(input, "date") || !Object.prototype.hasOwnProperty.call(input, "timeZone")) throw new Error("本人记录日期只接受完整date和timeZone字段。");
  return { date: parseCivilDay(input.date), timeZone: parseCivilTimeZone(input.timeZone) };
}
export function readAssignedRecordDate(rawDate: unknown, rawTimeZone: unknown): { recordDate: AssignedRecordDate | null; recordDateUnavailableReason?: string } {
  if (rawDate === null && rawTimeZone === null) return { recordDate: null };
  try { return { recordDate: parseAssignedRecordDate({ date: rawDate, timeZone: rawTimeZone }) }; }
  catch { return { recordDate: null, recordDateUnavailableReason: "本人指定日期不可读取，原值仍保留；请明确修改或清空日期。" }; }
}
