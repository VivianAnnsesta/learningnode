import { retiredDomainLearningOperation } from "../../../../../lib/learning/retiredLearningOperation";
import { getLongTermReviewSummary } from "../../../../../lib/learning/roadmapService";

export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
 const {id}=await context.params;
 try { const data=await getLongTermReviewSummary(id); return Response.json({summary: data}); }
 catch(error) { const message=error instanceof Error?error.message:"读取历史失败。"; return Response.json({error:message},{status:/不存在|not found/.test(message)?404:500}); }
}

export async function POST(_request: Request, context: {params: Promise<{id: string}>}) {
 const params=await context.params;
 return retiredDomainLearningOperation(params.id);
}
