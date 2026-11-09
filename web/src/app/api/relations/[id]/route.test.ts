import {describe,expect,it} from "vitest";
import {PUT,DELETE} from "./route";
describe("兼容写入退役：新模型不能被旧入口绕过",()=>{
it("PUT 不可改正文、状态或关系",async()=>{const r=await PUT();expect(r.status).toBe(410);expect((await r.json()).error).toContain("兼容写入已退役");});
it("DELETE 不可改正文、状态或关系",async()=>{const r=await DELETE();expect(r.status).toBe(410);expect((await r.json()).error).toContain("兼容写入已退役");});
});
