import { previewRecordClip } from "../../../../lib/learning/recordClipService";
import { readTeachingRequest, teachingRoute } from "../../../../lib/learning/nodeTeachingRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const response = await teachingRoute(async () => previewRecordClip(await readTeachingRequest(request), { signal: request.signal }));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
