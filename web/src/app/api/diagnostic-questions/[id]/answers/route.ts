import { retiredDiagnosticLearningOperation } from "../../../../../lib/learning/retiredLearningOperation";

export async function POST(_request: Request, context: {params: Promise<{id: string}>}) {
 const params=await context.params;
 return retiredDiagnosticLearningOperation("question",params.id);
}
