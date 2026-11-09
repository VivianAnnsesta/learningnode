import { parseKnowledgeDateFilter } from "./knowledgeViewContracts";

export type RecordTemplateConfig = { body: string; timeZone: string };
export type RecordTemplatePreview = { text: string; capturedAt: string; timeZone: string; hasUnresolvedVariables: boolean };

function wellFormed(value: string) {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

export function parseRecordTemplateTitle(value: unknown): string {
  if (typeof value !== "string" || !wellFormed(value) || /\p{Cc}/u.test(value) || !value.trim() || value.trim().length > 120)
    throw new Error("模板名称需为1至120个字符，不能含控制字符或不完整Unicode。");
  return value.trim();
}

export function parseRecordTemplateTimeZone(value: unknown): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 100 || !wellFormed(value) || /\p{Cc}/u.test(value))
    throw new Error("请提供有效的模板日期时区。");
  return parseKnowledgeDateFilter({ mode: "all", field: "updated", timeZone: value }).timeZone;
}

export function parseRecordTemplateConfig(value: unknown): RecordTemplateConfig {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new Error("请提供完整的模板正文和时区配置。");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 2 || !Object.prototype.hasOwnProperty.call(input, "body") || !Object.prototype.hasOwnProperty.call(input, "timeZone"))
    throw new Error("模板配置只接受完整的body和timeZone字段。");
  if (typeof input.body !== "string" || !input.body.trim() || input.body.length > 24000 || !wellFormed(input.body) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(input.body))
    throw new Error("模板正文不能为空或超过24000个字符，不能含不完整Unicode或无效控制字符。");
  return { body: input.body, timeZone: parseRecordTemplateTimeZone(input.timeZone) };
}

export function renderRecordTemplate(value: RecordTemplateConfig, context: { title: string; now?: Date }): RecordTemplatePreview {
  const config = parseRecordTemplateConfig(value);
  if (typeof context.title !== "string" || context.title.length > 500 || !wellFormed(context.title) || /\p{Cc}/u.test(context.title))
    throw new Error("当前记录标题无法用于预览，请先检查标题。");
  const now = context.now === undefined ? new Date() : new Date(context.now.getTime());
  if (!Number.isFinite(now.getTime())) throw new Error("预览时间无效。");
  const parts = new Intl.DateTimeFormat("en-CA", { calendar: "gregory", numberingSystem: "latn", timeZone: config.timeZone, era: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (name: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === name)?.value || "";
  const year = get("year").padStart(4, "0");
  if (!/^\d{4}$/.test(year) || Number(year) < 1 || get("era") !== "AD") throw new Error("预览日期超出支持范围。");
  const substitutions: Record<string, string> = { title: context.title, date: `${year}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
  let hasUnresolvedVariables = false;
  const text = config.body.replace(/\{\{([^{}]*)\}\}/g, (literal, name: string) => {
    if (Object.prototype.hasOwnProperty.call(substitutions, name)) return substitutions[name];
    hasUnresolvedVariables = true;
    return literal;
  });
  if (!text.trim() || text.length > 24000) throw new Error("预览结果为空或超过24000个字符，请修改模板或当前标题。");
  return { text, capturedAt: now.toISOString(), timeZone: config.timeZone, hasUnresolvedVariables };
}

export const builtInRecordTemplates = [
  { id: "builtin:question", title: "整理疑问", body: "# {{title}}\n记录日期：{{date}} {{time}}\n\n我想弄清的问题：\n\n我目前的理解与依据：\n\n困惑的位置或反例：\n\n下一步可以查证或尝试什么：\n" },
  { id: "builtin:understanding", title: "解释理解", body: "# {{title}}\n记录日期：{{date}}\n\n用自己的话解释：\n\n成立的条件与适用边界：\n\n一个具体例子：\n\n仍需核对的地方：\n" },
  { id: "builtin:reflection", title: "实例复盘", body: "# {{title}}\n记录日期：{{date}}\n\n当时的问题与情境：\n\n我实际做了什么，得到什么结果：\n\n依据、限制或其他解释：\n\n下次可以如何调整：\n" }
] as const;
