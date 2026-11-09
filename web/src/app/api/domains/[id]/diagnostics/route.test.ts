import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
const deps=vi.hoisted(()=>({find:vi.fn(),guard:vi.fn(),read:vi.fn(),ai:vi.fn()}));
vi.mock("../../../../../lib/prisma",()=>({prisma:{domain:{findUnique:deps.find},diagnosticQuestion:{findUnique:deps.find},diagnosticAnswer:{findUnique:deps.find}}}));
vi.mock("../../../../../lib/learning/domainMapService",()=>({assertLearningNodeInDomain:deps.guard}));
vi.mock("../../../../../lib/ai/tutorService",()=>({generateDiagnosticDraft:deps.ai,evaluateDiagnosticAnswer:deps.ai,generateLearningNodePractice:deps.ai,generateLearningNodeHint:deps.ai,generateLongTermReviewInsightPack:deps.ai}));
vi.mock("../../../../../lib/learning/diagnosticService",()=>({listDiagnosticSessions:deps.read}));
const params={params:Promise.resolve({id:"existing"})}, request=()=>new Request("http://localhost/old-learning",{method:"POST",body:"{"});
beforeEach(()=>{vi.resetAllMocks();deps.find.mockResolvedValue({id:"existing"});deps.guard.mockResolvedValue({});});
describe("旧学习仅回看，执行入口退役",()=>{
 it("拒绝旧写入且不调用模型，即使请求体残缺也不启动旧流程",async()=>{const r=await POST(request(),params);expect(r.status).toBe(410);expect((await r.json()).code).toBe("LEGACY_LEARNING_READ_ONLY");expect(deps.ai).not.toHaveBeenCalled();});
 it("退役仍检查真实归属或存在性",async()=>{deps.find.mockResolvedValue(null);const r=await POST(request(),params);expect(r.status).toBe(404);expect(deps.ai).not.toHaveBeenCalled();});
it("读取仍保留旧历史，不触发模型",async()=>{deps.read.mockResolvedValue([{id:"old-session",title:"原历史"}]);const r=await GET(new Request("http://localhost/history"),params);expect(r.status).toBe(200);expect(JSON.stringify(await r.json())).toContain("原历史");expect(deps.read).toHaveBeenCalledWith("existing");expect(deps.ai).not.toHaveBeenCalled();});
it("历史读取失败不伪装为空列表或成功",async()=>{deps.read.mockRejectedValue(new Error("读取失败"));expect((await GET(new Request("http://localhost/history"),params)).status).toBe(500);});
});
