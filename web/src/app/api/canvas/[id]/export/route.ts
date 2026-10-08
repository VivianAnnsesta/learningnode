import { prisma } from "../../../../../lib/prisma";
import { getLegacyCanvasGraphPayload } from "../../../../../lib/learning/knowledgeGraphService";

const safeFileName = (name: string) =>
  name.replace(/[^\w\u4e00-\u9fa5\-]+/g, "_");

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const domain = await prisma.domain.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        description: true
      }
    });

    if (!domain) {
      return Response.json({ error: "画布不存在" }, { status: 404 });
    }

    const { words, relations } = await getLegacyCanvasGraphPayload(params.id);

    const payload = {
      canvas: {
        id: domain.id,
        name: domain.name,
        description: domain.description
      },
      words,
      relations
    };

    const fileBase = safeFileName(domain.name || "canvas");
    const utf8Filename = `${fileBase}_knowledge_graph.json`;
    const encodedFilename = encodeURIComponent(utf8Filename);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="knowledge_graph.json"; filename*=UTF-8''${encodedFilename}`
      }
    });
  } catch (error) {
    console.error("\n❌[API ERROR in GET /api/canvas/[id]/export]:", error, "\n");
    const message = error instanceof Error ? error.message : "导出失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
