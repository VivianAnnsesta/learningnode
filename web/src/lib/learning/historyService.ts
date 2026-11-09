import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NodeTeachingError } from "./nodeTeaching";
function candidates() {
    const url = process.env.DATABASE_URL || "", database = url.startsWith("file:") ? decodeURIComponent(url.slice(5).split("?")[0]) : "";
    const dir = database ? path.dirname(path.resolve(database)) : null;
    let paths: string[] = [];
    try {
        const configured = JSON.parse(process.env.ENGLISHNODE_LEGACY_DATABASE_PATHS || "[]");
        if (Array.isArray(configured))
            paths = configured.filter((x): x is string => typeof x === "string").map(x => path.resolve(x));
    }
    catch { }
    if (dir && fs.existsSync(dir))
        paths.push(...fs.readdirSync(dir).filter(x => /^(englishnode|dev)[\w.-]*\.db$/i.test(x) && path.resolve(dir, x) !== path.resolve(database)).map(x => path.join(dir, x)));
    return [...new Set(paths)].filter(x => fs.existsSync(x) && fs.statSync(x).isFile()).map(file => ({ id: createHash("sha256").update(file).digest("hex").slice(0, 24), file, name: path.basename(file) }));
}
async function readFile(id: string, options:{offset?:number;recordId?:string;recordTable?:string}={}) {
    const offset=options.offset??0;
    if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new NodeTeachingError("历史页码无效。");
    if(options.recordTable&&!['KnowledgePoint','Word'].includes(options.recordTable))throw new NodeTeachingError("历史记录类型不存在。",404);
    const candidate = candidates().find(x => x.id === id);
    if (!candidate)
        throw new NodeTeachingError("历史来源不存在。", 404);
    const client = new PrismaClient({ datasources: { db: { url: `file:${candidate.file.replace(/\\/g, "/")}?connection_limit=1` } } });
    try {
        await client.$executeRawUnsafe("PRAGMA query_only=ON");
        const tables = await client.$queryRawUnsafe<{
            name: string;
        }[]>("SELECT name FROM sqlite_master WHERE type='table'");
        const found = new Set(tables.map(x => x.name));
        const allowed=['KnowledgePoint','Word','KnowledgePointRevision','Domain','LearningNode','NodeTeachingSession','TeachingInteraction','TeachingSegment','KnowledgeGraphEdge','WordRelation','CoreEssence','LearningProgress'];
        const counts:Record<string,number>={};for(const table of allowed)if(found.has(table)){const result=await client.$queryRawUnsafe<{n:bigint}[]>(`SELECT COUNT(*) AS n FROM "${table}"`);counts[table]=Number(result[0].n);}
        const read = async (table: string) => found.has(table) ? client.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${table}" ORDER BY rowid LIMIT 100 OFFSET ?`,offset) : [];
        const rows=async(table:string)=>{if(!found.has(table)||(options.recordTable&&options.recordTable!==table))return[];return options.recordId?client.$queryRawUnsafe<Record<string,unknown>[]>(`SELECT * FROM "${table}" WHERE id=?`,options.recordId):read(table);};
        const records:(Record<string,unknown>&{id:string;historicalTable:string})[]=[...(await rows('KnowledgePoint')).map(r=>({...r,id:String(r.id),historicalTable:'KnowledgePoint'})),...(await rows('Word')).map(r=>({...r,id:String(r.id),historicalTable:'Word'}))];
        const ids=records.map(r=>r.id as string);
        const revisions=found.has('KnowledgePointRevision')&&ids.length?await client.$queryRawUnsafe<Record<string,unknown>[]>(`SELECT * FROM "KnowledgePointRevision" WHERE knowledgePointId IN (${ids.map(()=>'?').join(',')}) ORDER BY sequence DESC`,...ids):[];
        const cores=options.recordId&&found.has('CoreEssence')?await client.$queryRawUnsafe<Record<string,unknown>[]>('SELECT * FROM "CoreEssence" WHERE wordId=?',options.recordId):await read('CoreEssence');
        const output = { source: { id: candidate.id, name: candidate.name }, page:{offset,take:100,hasMore:Object.values(counts).some(n=>n>offset+100),counts}, records, revisions, domains: await read("Domain"), nodes: await read("LearningNode"), sessions: await read("NodeTeachingSession"), interactions: await read("TeachingInteraction"), segments: await read("TeachingSegment"), relations: [...await read("KnowledgeGraphEdge"),...await read("WordRelation")], cores, audit: await read("LearningProgress") };
        // Unseen reference answers are private even in an old database.
        return JSON.parse(JSON.stringify(output, (_k, v) => typeof v === "bigint" ? String(v) : v)) as typeof output;
    }
    finally {
        await client.$disconnect();
    }
}
export async function listHistorySources() { return { sources: candidates().map(x => ({ id: x.id, name: x.name })), limitation: "历史数据库只读分页，全部原文件保留；旧状态不认证当前掌握。" }; }
const hidden = new Set(["answer", "solution", "expectedAnswer", "referenceAnswer", "hints", "criteria", "responseCriteria"]);
function hide(value: unknown): unknown { if (Array.isArray(value))
    return value.map(hide); if (typeof value === "string") {
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object")
            return hide(parsed);
    }
    catch { }
    return value;
} if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).filter(([k]) => !hidden.has(k)).map(([k, v]) => [k, hide(v)])); return value; }
export async function getHistorySource(id: string,options:{offset?:number;showReferences?:boolean}={}) { const data=await readFile(id,options);return options.showReferences?data:hide(data); }
export async function historyRecordSnapshot(sourceId: string, recordId: string,recordTable?:string) { const data = await readFile(sourceId,{recordId,recordTable}); const record = data.records.find(x => x.id === recordId&&(!recordTable||x.historicalTable===recordTable)); if (!record)
    throw new NodeTeachingError("历史记录不存在。", 404); return { kind: "history", source: data.source, record: hide(record), revisions: hide(record.historicalTable === 'KnowledgePoint' ? data.revisions.filter(x => x.knowledgePointId === recordId) : []), cores: hide(record.historicalTable === 'Word' ? data.cores.filter(x => x.wordId === recordId) : []) }; }
