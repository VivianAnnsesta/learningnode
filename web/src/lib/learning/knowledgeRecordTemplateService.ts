import { Prisma, type KnowledgeRecordTemplate } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "../prisma";
import { NodeTeachingError, teachingObject, teachingText } from "./nodeTeaching";
import { listPage } from "./listPage";
import { digest } from "./teachingSources";
import { parseRecordTemplateConfig, parseRecordTemplateTitle, type RecordTemplateConfig } from "./recordTemplateContracts";

function command(value: unknown, allowed: readonly string[]) {
  const data = teachingObject(value);
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new NodeTeachingError("模板请求包含未知字段；模板只能保存名称和正文配置。");
  return data;
}

function input(data: Record<string, unknown>) {
  try { return { title: parseRecordTemplateTitle(data.title), config: parseRecordTemplateConfig(data.config) }; }
  catch (error) { throw new NodeTeachingError(error instanceof Error ? error.message : "模板配置无效。"); }
}

function expectedVersion(data: Record<string, unknown>) {
  const version = data.expectedVersion;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1 || version > 2147483647)
    throw new NodeTeachingError("请提供有效的模板版本。");
  return version;
}

function readConfig(row: KnowledgeRecordTemplate): { config: RecordTemplateConfig | null; unavailableReason?: string } {
  if (row.schemaVersion !== 1) return { config: null, unavailableReason: "此模板使用暂不支持的配置版本，不能预览、插入或降级覆盖。" };
  try {
    const raw = JSON.parse(row.configJson), config = parseRecordTemplateConfig(raw);
    if (!isDeepStrictEqual(raw, config)) throw new Error("模板配置不是完整规范形状。");
    return { config };
  } catch { return { config: null, unavailableReason: "此模板的配置无法读取，不能预览或插入；请明确修复或删除。" }; }
}

function present(row: KnowledgeRecordTemplate) {
  return { id: row.id, title: row.title, schemaVersion: row.schemaVersion, version: row.version, ...readConfig(row), createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export async function listKnowledgeRecordTemplates(options: { offset?: unknown; limit?: unknown } = {}) {
  const page = listPage(options.offset, options.limit, 50);
  return prisma.$transaction(async tx => {
    const rows = await tx.knowledgeRecordTemplate.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: page.offset, take: page.limit });
    const total = await tx.knowledgeRecordTemplate.count();
    return { templates: rows.map(present), page: { ...page, total, nextOffset: page.offset + rows.length < total ? page.offset + rows.length : null } };
  }, { timeout: 30000 });
}

export async function getKnowledgeRecordTemplate(id: string) {
  const row = await prisma.knowledgeRecordTemplate.findUnique({ where: { id } });
  if (!row) throw new NodeTeachingError("个人记录模板不存在。", 404);
  return { template: present(row) };
}

export async function createKnowledgeRecordTemplate(value: unknown) {
  const data = command(value, ["requestId", "title", "config"]), { title, config } = input(data);
  const id = `template:${digest(teachingText(data.requestId, "保存模板请求标识", 160))}`, configJson = JSON.stringify(config);
  try {
    return { template: present(await prisma.knowledgeRecordTemplate.create({ data: { id, title, configJson, schemaVersion: 1, version: 1 } })) };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const row = await prisma.knowledgeRecordTemplate.findUnique({ where: { id } }), stored = row && readConfig(row);
    if (!row || row.title !== title || !stored?.config || JSON.stringify(stored.config) !== configJson)
      throw new NodeTeachingError("此保存标识已用于另一份模板，请另存或比较当前版本。", 409);
    return { template: present(row) };
  }
}

export async function updateKnowledgeRecordTemplate(id: string, value: unknown) {
  const data = command(value, ["title", "config", "expectedVersion"]), { title, config } = input(data), version = expectedVersion(data);
  if (version === 2147483647) throw new NodeTeachingError("模板版本已达上限，请明确另存模板。");
  return prisma.$transaction(async tx => {
    const changed = await tx.knowledgeRecordTemplate.updateMany({ where: { id, version, schemaVersion: 1 }, data: { title, configJson: JSON.stringify(config), version: { increment: 1 } } });
    if (!changed.count) {
      const row = await tx.knowledgeRecordTemplate.findUnique({ where: { id } });
      if (!row) throw new NodeTeachingError("个人记录模板不存在。", 404);
      if (row.schemaVersion !== 1) throw new NodeTeachingError("此模板使用暂不支持的配置版本，不能降级覆盖。");
      throw new NodeTeachingError("模板已有较新版本，请比较后明确选择新的保存基础。", 409);
    }
    return { template: present(await tx.knowledgeRecordTemplate.findUniqueOrThrow({ where: { id } })) };
  }, { timeout: 30000 });
}

export async function deleteKnowledgeRecordTemplate(id: string, value: unknown) {
  const version = expectedVersion(command(value, ["expectedVersion"]));
  return prisma.$transaction(async tx => {
    const changed = await tx.knowledgeRecordTemplate.deleteMany({ where: { id, version } });
    if (!changed.count) {
      if (!await tx.knowledgeRecordTemplate.findUnique({ where: { id }, select: { id: true } })) throw new NodeTeachingError("个人记录模板不存在。", 404);
      throw new NodeTeachingError("模板已有较新版本，请重新读取后再明确删除。", 409);
    }
    return { deleted: true };
  }, { timeout: 30000 });
}
