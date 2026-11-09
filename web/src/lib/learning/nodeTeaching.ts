export class NodeTeachingError extends Error {
 constructor(message:string,public readonly status=400){super(message);this.name="NodeTeachingError";}
}
export function teachingObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new NodeTeachingError("请求必须是一个对象。");return value as Record<string,unknown>;}
export function teachingText(value:unknown,label:string,max=6000,allowEmpty=false){if(typeof value!=="string"||value.length>max||(!allowEmpty&&!value.trim()))throw new NodeTeachingError(`${label}需要${allowEmpty?"":"非空"}文本，最多 ${max} 个字符。`);return value.trim();}
