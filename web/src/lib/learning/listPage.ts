import { NodeTeachingError } from "./nodeTeaching";

export function listPage(offset: unknown, limit: unknown, defaultLimit: number) {
    const start = offset === undefined || offset === null || offset === "" ? 0 : Number(offset);
    const size = limit === undefined || limit === null || limit === "" ? defaultLimit : Number(limit);
    if (!Number.isSafeInteger(start) || start < 0 || start > 1000000 || !Number.isSafeInteger(size) || size < 1 || size > 300) throw new NodeTeachingError("列表页码或每页条数无效。");
    return { offset: start, limit: size };
}
