import { prisma } from "../../../../../lib/prisma";
import { generateCourseDesignDraft } from "../../../../../lib/ai/tutorService";
import { readTeachingRequest,teachingRoute } from "../../../../../lib/learning/nodeTeachingRoute";
import { teachingObject,NodeTeachingError } from "../../../../../lib/learning/nodeTeaching";
import { getCourseDesignState } from "../../../../../lib/learning/courseDesignService";
import { POST as generateMapDraft } from "../map/ai-draft/route";
export async function POST(r:Request,c:{params:Promise<{id:string}>}){
 const{id}=await c.params;
 return teachingRoute(async()=>{
  const d=teachingObject(await readTeachingRequest(r)),domain=await prisma.domain.findUnique({where:{id}});
  if(!domain)throw new NodeTeachingError("领域不存在。",404);
  if(!domain.name.trim()||!domain.goal?.trim())throw new NodeTeachingError("请填写领域和学习目标；其他背景可暂时未知。");
  let state=await getCourseDesignState(id);
  if(!state.draft?.qualityGate.passed||!state.aiCallLogId||!["draft","confirmed"].includes(state.status)||d.regenerate===true){
   // Saved materials and concerns belong to the service's single request snapshot.
   // Do not combine them with this earlier entry read or overwrite a user task brief.
   const researched=await generateCourseDesignDraft(id,{feedback:typeof d.feedback==="string"?d.feedback:null});
   if(researched.source!=="ai"||!researched.draft.qualityGate.passed)return{courseDesign:researched,error:researched.warning||"规划材料尚未完整，可调整目标、补充资料并重试。"};
   if(researched.draft.knowledgeReview?.verdict==="confirmed_error")return{courseDesign:researched,error:"课程有尚未修正的明确知识错误；原文和核对已保留，请补充依据或再次修订。"};
   state=await getCourseDesignState(id);
  }
  const result=await generateMapDraft(new Request(r.url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({step:"skeleton",...(state.status==="draft"?{courseDesign:state.draft}:{}),courseDesignAiCallLogId:state.aiCallLogId})}),{params:Promise.resolve({id})});
  const draft=await result.json();return{...draft,courseDesign:state};
 });
}
