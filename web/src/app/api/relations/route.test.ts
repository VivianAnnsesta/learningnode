import {describe,expect,it} from "vitest";
import {POST} from "./route";
describe("兼容写入退役：新模型不能被旧入口绕过",()=>{
it("POST 不可改正文、状态或关系",async()=>{const r=await POST();expect(r.status).toBe(410);expect((await r.json()).error).toContain("兼容写入已退役");});
});
