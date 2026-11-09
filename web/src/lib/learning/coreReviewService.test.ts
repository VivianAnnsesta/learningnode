import {beforeEach,expect,it,vi} from 'vitest';
import {getLegacyCoreReview,saveLegacyCoreReview} from './coreReviewService';
const mocks=vi.hoisted(()=>({knowledgePoint:{findFirst:vi.fn(),update:vi.fn()},semanticCoreVersion:{findMany:vi.fn()},coreReviewSession:{findMany:vi.fn()}}));
vi.mock('../prisma',()=>({prisma:mocks}));
beforeEach(()=>vi.clearAllMocks());
it('旧核心和复盘仍能按领域归属读取',async()=>{mocks.knowledgePoint.findFirst.mockResolvedValue({id:'p',coreEssence:'原始解释'});mocks.semanticCoreVersion.findMany.mockResolvedValue([{id:'v1',statement:'原始解释'}]);mocks.coreReviewSession.findMany.mockResolvedValue([{id:'review',userRecall:'原话'}]);const r=await getLegacyCoreReview('p','d');expect(r.core?.summary).toBe('原始解释');expect(r.reviews[0].userRecall).toBe('原话');expect(mocks.knowledgePoint.findFirst).toHaveBeenCalledWith({where:{id:'p',domainId:'d'}});});
it('旧写入退役，不能覆盖个人内容或复习状态',async()=>{await expect(saveLegacyCoreReview('p','d',{userRecall:'原话',revisedStatement:'试图覆盖',passed:true})).rejects.toMatchObject({status:410});expect(mocks.knowledgePoint.update).not.toHaveBeenCalled();});
it('没有旧核心时提供空历史，不制造新解释',async()=>{mocks.knowledgePoint.findFirst.mockResolvedValue(null);expect(await getLegacyCoreReview('p','d')).toEqual({core:null,versions:[],reviews:[]});});
