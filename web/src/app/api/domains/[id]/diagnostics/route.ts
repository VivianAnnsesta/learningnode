import { retiredDomainLearningOperation } from "../../../../../lib/learning/retiredLearningOperation";
import { listDiagnosticSessions } from "../../../../../lib/learning/diagnosticService";

export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
 const {id}=await context.params;
 try { const data=await listDiagnosticSessions(id); return Response.json({sessions: data}); }
 catch(error) { const message=error instanceof Error?error.message:"读取历史失败。"; return Response.json({error:message},{status:/不存在|not found/.test(message)?404:500}); }
}

export async function POST(_request: Request, context: {params: Promise<{id: string}>}) {
 const params=await context.params;
 return retiredDomainLearningOperation(params.id);
}
