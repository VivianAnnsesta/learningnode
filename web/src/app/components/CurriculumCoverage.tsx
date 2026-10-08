import Link from "next/link";
import {dimensions} from "../../lib/learning/teachingDimensions";
import type {LearningGoal, RoadmapModuleBlueprint, StageProblem, CourseContentCoverage, CourseContentQuestion} from "../../lib/learning/roadmapPlanningTypes";

export function CurriculumCoverage({goals=[],stage,coverage,domainId,onContentQuestionChange}:{
  goals?:LearningGoal[];stage:{key?:string;goalKeys?:string[];problem?:StageProblem;moduleBlueprints?:RoadmapModuleBlueprint[]};
  coverage?:CourseContentCoverage[];domainId?:string;
  onContentQuestionChange?:(key:string,update:Partial<Pick<CourseContentQuestion,"question"|"contentRequirements"|"dimensionKeys">>)=>void;
}) {
  const registry=new Map(goals.flatMap(goal=>(goal.contentQuestions || []).map(q=>[q.key,{question:q,goal}] as const)));
  const legacy=registry.size===0;
  return <div className="mt-3 space-y-2 text-sm">
    {stage.problem?<><p><strong>本阶段的完整问题：</strong>{stage.problem.question}</p><ol className="list-decimal pl-5">{stage.problem.steps.map((step,index)=><li key={index}>{step}</li>)}</ol></>:null}
    <details><summary>阶段内容覆盖：安排了什么、在哪里讲</summary>
      <p>{legacy?"此记录使用旧规划说明，需要重新规划才能取得具体内容覆盖。":"内容覆盖记录课程安排与材料位置；不表示你已掌握，也不证明知识正确。"}</p>
      {stage.moduleBlueprints?.map(module=><div className="mt-2" key={module.key}><strong>{module.title}</strong><ul className="list-disc pl-5">{module.keyQuestions.map(q=>{
        const registered=registry.get(q.contentQuestionKey || "");const content=registered?.question;
        const record=coverage?.find(item=>item.key===q.contentQuestionKey);
        const assignments=record?.assignments.filter(a=>a.stageKey===stage.key&&a.planningQuestionKey===q.key)||[];
        return <li className="mb-3" key={q.key}>
          <p>{content?.question || q.question}</p>
          {content?<>
            <p>对应课程目标：{registered!.goal.description}</p>
            <p>材料需要说明：{content.contentRequirements.join("；")}</p>
            <p>教学维度：{content.dimensionKeys.map(key=>dimensions[key]).join("、")}</p>
            <p>课程内材料状态：{record?.status==="material_ready"?"已生成材料":record?.status==="needs_supplement"?"待补充":"已安排，正文待生成"}{record?.materials.length&&record.missingDimensionKeys.length?`；正文尚缺：${record.missingDimensionKeys.map(key=>dimensions[key]).join("、")}`:""}</p>
            {record?.unassignedRequirementIndices.length?<p>尚未分工的内容：{record.unassignedRequirementIndices.map(index=>content.contentRequirements[index]).join("；")}</p>:null}
            {record?.unassignedDimensionKeys.length?<p>尚未分工的维度：{record.unassignedDimensionKeys.map(key=>dimensions[key]).join("、")}</p>:null}
            {record?.materials.length&&record.missingRequirementIndices.length?<p>材料尚缺：{record.missingRequirementIndices.map(index=>content.contentRequirements[index]).join("；")}</p>:null}
            {record?.unexpandedAssignments.length?<p>还有 {record.unexpandedAssignments.length} 处模块安排等待展开为概念。</p>:null}
            {assignments.flatMap(a=>a.concepts).map(node=>domainId?<p key={node.key}><Link href={`/learning/domains/${domainId}/items/${node.id}`}>{node.reused?"复用概念：":"承接概念："}{node.title}</Link>{node.contribution?<span>；本课分工：{node.contribution.contribution}（{node.contribution.dimensionKeys.map(key=>dimensions[key]).join("、")}）</span>:null}</p>:null)}
            {record?.pendingConceptKeys.map(key=>{const node=record.assignments.flatMap(a=>a.concepts).find(c=>c.key===key);return node?<p key={`pending:${key}`}>正文待补充：{node.title}</p>:null;})}
            {record?.materials.map(position=>domainId?<p key={`${position.segmentId}:${position.stepKey}`}><Link href={`/learning/domains/${domainId}/items/${position.nodeId}?sessionId=${encodeURIComponent(position.sessionId)}&segmentId=${encodeURIComponent(position.segmentId)}&stepKey=${encodeURIComponent(position.stepKey)}`}>{position.nodeTitle} · 框架 {position.lessonVersion} · 正文 {position.materialVersion} · {position.dimensionKeys.map(key=>dimensions[key]).join("、")}</Link></p>:null)}
            {onContentQuestionChange?<details><summary>修改课程内容要求</summary><label className="block">具体问题<textarea className="w-full rounded border p-2" value={content.question} onChange={e=>onContentQuestionChange(content.key,{question:e.target.value})}/></label><label className="block">材料说明要求（每行一项）<textarea className="w-full rounded border p-2" value={content.contentRequirements.join("\n")} onChange={e=>onContentQuestionChange(content.key,{contentRequirements:e.target.value.split("\n")})}/></label><div>{Object.entries(dimensions).map(([key,label])=><label className="mr-3" key={key}><input type="checkbox" checked={content.dimensionKeys.includes(key as keyof typeof dimensions)} onChange={e=>onContentQuestionChange(content.key,{dimensionKeys:e.target.checked?[...content.dimensionKeys,key as keyof typeof dimensions]:content.dimensionKeys.filter(d=>d!==key)})}/>{label}</label>)}</div></details>:null}
          </>:<p>旧规划说明：{q.checkableOutcome}</p>}
        </li>;
      })}</ul></div>)}
    </details>
  </div>;
}
