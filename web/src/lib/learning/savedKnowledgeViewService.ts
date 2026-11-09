import { Prisma, type SavedKnowledgeView } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "../prisma";
import { NodeTeachingError, teachingObject, teachingText } from "./nodeTeaching";
import { listPage } from "./listPage";
import { digest } from "./teachingSources";
import { parseKnowledgeViewConfig, parseKnowledgeViewTitle, type KnowledgeViewConfig, type KnowledgeViewFilters } from "./knowledgeViewContracts";

type ScopeClient = Pick<Prisma.TransactionClient, "domain" | "knowledgeGraphNode">;

export async function knowledgeViewScopeIssue(filters: KnowledgeViewFilters, client: ScopeClient = prisma): Promise<string | undefined> {
  if (filters.domainId && !await client.domain.findUnique({ where: { id: filters.domainId }, select: { id: true } }))
    return "筛选中的领域已不存在，请明确修改筛选条件。";
  if (filters.collectionId && !await client.knowledgeGraphNode.findFirst({ where: { id: filters.collectionId, nodeType: "topic", knowledgePointId: null }, select: { id: true } }))
    return "筛选中的主题已不存在或不是可用主题，请明确修改筛选条件。";
  return undefined;
}

function input(value: unknown) {
  const data = teachingObject(value);
  if (!Object.prototype.hasOwnProperty.call(data, "config")) throw new NodeTeachingError("请提供完整的视图配置。");
  try { return { data, title: parseKnowledgeViewTitle(data.title), config: parseKnowledgeViewConfig(data.config) }; }
  catch (error) { throw new NodeTeachingError(error instanceof Error ? error.message : "视图配置无效。"); }
}

function expectedVersion(data: Record<string, unknown>) {
  const value = data.expectedVersion;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw new NodeTeachingError("请提供有效的视图版本。");
  return value;
}

function readConfig(row: SavedKnowledgeView): { config: KnowledgeViewConfig | null; unavailableReason?: string } {
  if (row.schemaVersion !== 1) return { config: null, unavailableReason: "此视图使用暂不支持的配置版本，不能运行或降级覆盖。" };
  try {
    const raw = JSON.parse(row.configJson), config = parseKnowledgeViewConfig(raw);
    if (!isDeepStrictEqual(raw, config)) throw new Error("持久化配置缺少完整规范字段。");
    return { config };
  }
  catch { return { config: null, unavailableReason: "此视图的配置无法读取，请明确修复或删除，当前不会扩大查询范围。" }; }
}

async function present(row: SavedKnowledgeView, client: ScopeClient) {
  const parsed = readConfig(row);
  const unavailableReason = parsed.unavailableReason || (parsed.config ? await knowledgeViewScopeIssue(parsed.config.filters, client) : undefined);
  return { id: row.id, title: row.title, schemaVersion: row.schemaVersion, version: row.version, config: parsed.config, ...(unavailableReason ? { unavailableReason } : {}), createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export async function listSavedKnowledgeViews(options: { offset?: unknown; limit?: unknown } = {}) {
  const page = listPage(options.offset, options.limit, 50);
  return prisma.$transaction(async tx => {
    const rows = await tx.savedKnowledgeView.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: page.offset, take: page.limit });
    const total = await tx.savedKnowledgeView.count();
    return { views: await Promise.all(rows.map(row => present(row, tx))), page: { ...page, total, nextOffset: page.offset + rows.length < total ? page.offset + rows.length : null } };
  }, { timeout: 30000 });
}

export async function getSavedKnowledgeView(id: string) {
  return prisma.$transaction(async tx => {
    const row = await tx.savedKnowledgeView.findUnique({ where: { id } });
    if (!row) throw new NodeTeachingError("已保存视图不存在。", 404);
    return { view: await present(row, tx) };
  }, { timeout: 30000 });
}

export async function createSavedKnowledgeView(value: unknown) {
  const { data, title, config } = input(value);
  const id = `view:${digest(teachingText(data.requestId, "保存视图请求标识", 160))}`, configJson = JSON.stringify(config);
  try {
    return await prisma.$transaction(async tx => {
      const row = await tx.savedKnowledgeView.create({ data: { id, title, schemaVersion: 1, configJson, version: 1 } });
      const issue = await knowledgeViewScopeIssue(config.filters, tx);
      if (issue) throw new NodeTeachingError(issue);
      return { view: await present(row, tx) };
    }, { timeout: 30000 });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return prisma.$transaction(async tx => {
      const row = await tx.savedKnowledgeView.findUnique({ where: { id } });
      const stored = row && readConfig(row);
      if (!row || row.title !== title || !stored?.config || JSON.stringify(stored.config) !== configJson)
        throw new NodeTeachingError("此保存标识已用于另一份视图配置，请另存或比较当前版本。", 409);
      const issue = await knowledgeViewScopeIssue(config.filters, tx);
      if (issue) throw new NodeTeachingError(issue);
      return { view: await present(row, tx) };
    }, { timeout: 30000 });
  }
}

export async function updateSavedKnowledgeView(id: string, value: unknown) {
  const { data, title, config } = input(value), version = expectedVersion(data);
  if (version === 2147483647) throw new NodeTeachingError("视图版本已达上限，请明确另存视图。");
  return prisma.$transaction(async tx => {
    const changed = await tx.savedKnowledgeView.updateMany({ where: { id, version, schemaVersion: 1 }, data: { title, configJson: JSON.stringify(config), version: { increment: 1 } } });
    if (!changed.count) {
      const row = await tx.savedKnowledgeView.findUnique({ where: { id } });
      if (!row) throw new NodeTeachingError("已保存视图不存在。", 404);
      if (row.schemaVersion !== 1) throw new NodeTeachingError("此视图使用暂不支持的配置版本，不能降级覆盖。");
      throw new NodeTeachingError("视图已有较新版本，请比较配置后明确选择新的保存基础。", 409);
    }
    const issue = await knowledgeViewScopeIssue(config.filters, tx);
    if (issue) throw new NodeTeachingError(issue);
    const row = await tx.savedKnowledgeView.findUniqueOrThrow({ where: { id } });
    return { view: await present(row, tx) };
  }, { timeout: 30000 });
}

export async function deleteSavedKnowledgeView(id: string, value: unknown) {
  const version = expectedVersion(teachingObject(value));
  return prisma.$transaction(async tx => {
    const changed = await tx.savedKnowledgeView.deleteMany({ where: { id, version } });
    if (!changed.count) {
      if (!await tx.savedKnowledgeView.findUnique({ where: { id }, select: { id: true } })) throw new NodeTeachingError("已保存视图不存在。", 404);
      throw new NodeTeachingError("视图已有较新版本，请回看后再明确删除。", 409);
    }
    return { deleted: true };
  }, { timeout: 30000 });
}
