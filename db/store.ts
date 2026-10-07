export {database, bucket} from '../runtime/storage.mjs';
import {database} from '../runtime/storage.mjs';

export async function all(sql: string, ...args: any[]) {
    return (await database().prepare(sql).bind(...args).all()).results as any[];
}

export async function one(sql: string, ...args: any[]) {
    return await database().prepare(sql).bind(...args).first() as any;
}

export function statement(sql: string, ...args: any[]) {
    return database().prepare(sql).bind(...args);
}

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const parse = (r: any) => r ? {...r, ...(r.data ? {data: JSON.parse(r.data)} : {}), ...(r.details ? {details: JSON.parse(r.details)} : {})} : r;

export function auditStmt(actor: string, action: string, entity: string, before: any, after: any) {
    return statement('INSERT INTO audit VALUES(?,?,?,?,?,?,?)', uid(), actor, action, entity, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, now());
}

export function recordStmt(actor: string, kind: string, d: any, id = uid()) {
    return statement('INSERT INTO records VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, kind, d.student_id || null, d.circle_id || null, d.user_id || null, actor, d.parent_id || null, d.date || now().slice(0, 10), d.status || 'active', Math.round(Number(d.amount || 0)), JSON.stringify(d.data || {}), now());
}
