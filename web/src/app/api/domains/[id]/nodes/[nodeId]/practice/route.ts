import { retiredNodeLearningOperation } from "../../../../../../../lib/learning/retiredLearningOperation";

export async function POST(_request: Request, context: {params: Promise<{id: string;nodeId: string}>}) {
 const params=await context.params;
 return retiredNodeLearningOperation(params.id,params.nodeId);
}
