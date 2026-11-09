import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const deps=vi.hoisted(()=>({find:vi.fn(),guard:vi.fn(),read:vi.fn(),ai:vi.fn()}));
vi.mock("../../../../../lib/prisma",()=>({prisma:{domain:{findUnique:deps.find},diagnosticQuestion:{findUnique:deps.find},diagnosticAnswer:{findUnique:deps.find}}}));
vi.mock("../../../../../lib/learning/domainMapService",()=>({assertLearningNodeInDomain:deps.guard}));
vi.mock("../../../../../lib/ai/tutorService",()=>({generateDiagnosticDraft:deps.ai,evaluateDiagnosticAnswer:deps.ai,generateLearningNodePractice:deps.ai,generateLearningNodeHint:deps.ai,generateLongTermReviewInsightPack:deps.ai}));
const params={params:Promise.resolve({id:"existing"})}, request=()=>new Request("http://localhost/old-learning",{method:"POST",body:"{"});
beforeEach(()=>{vi.resetAllMocks();deps.find.mockResolvedValue({id:"existing"});deps.guard.mockResolvedValue({});});
describe("旧学习仅回看，执行入口退役",()=>{
 it("拒绝旧写入且不调用模型，即使请求体残缺也不启动旧流程",async()=>{const r=await POST(request(),params);expect(r.status).toBe(410);expect((await r.json()).code).toBe("LEGACY_LEARNING_READ_ONLY");expect(deps.ai).not.toHaveBeenCalled();});
 it("退役仍检查真实归属或存在性",async()=>{deps.find.mockResolvedValue(null);const r=await POST(request(),params);expect(r.status).toBe(404);expect(deps.ai).not.toHaveBeenCalled();});
});
