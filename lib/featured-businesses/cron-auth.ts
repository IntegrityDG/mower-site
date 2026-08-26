import { timingSafeEqual } from "node:crypto";
export function isCronAuthorized(authorization:string|null,secret:string|undefined){const value=secret??"",provided=authorization??"",expected=`Bearer ${value}`;return value.length>=32&&provided.length===expected.length&&timingSafeEqual(Buffer.from(provided),Buffer.from(expected))}
