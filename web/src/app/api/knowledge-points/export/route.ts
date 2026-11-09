import { preparePersonalKnowledgeExport } from "../../../../lib/learning/personalKnowledgeExport";
import { knowledgeExportHeaders } from "../../../../lib/learning/knowledgeExportContracts";
import { NodeTeachingError } from "../../../../lib/learning/nodeTeaching";
import { readTeachingRequest } from "../../../../lib/learning/nodeTeachingRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const archive = await preparePersonalKnowledgeExport(await readTeachingRequest(request), { signal: request.signal });
    return new Response(new Uint8Array(archive.bytes).buffer, { headers: knowledgeExportHeaders(archive) });
  } catch (error) {
    const status = error instanceof NodeTeachingError ? error.status : 503;
    return Response.json({ error: error instanceof NodeTeachingError ? error.message : "个人记录导出暂时不可用，请重试；原记录保留。" }, { status, headers: { "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" } });
  }
}
