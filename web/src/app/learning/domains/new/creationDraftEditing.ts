import type { RoadmapInput } from "../../../../lib/learning/roadmapService";

export function restoredCreationDraftBinding(response: {
  draft?: RoadmapInput | null;
  draftCourseDesignAiCallLogId?: string | null;
}): string | null {
  return response.draft ? response.draftCourseDesignAiCallLogId || null : null;
}

export function creationDraftSavePayload(text: string, courseDesignAiCallLogId: string | null) {
  if (!courseDesignAiCallLogId) {
    throw new Error("这份路线草稿缺少课程版本，请重新生成后再编辑。");
  }
  return { draft: JSON.parse(text) as RoadmapInput, courseDesignAiCallLogId };
}
