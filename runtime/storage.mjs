import {DatabaseSync} from 'node:sqlite';
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

export const dataDir = resolve(process.env.DATA_DIR || './data');
let connection;

export function sqlite() {
    if (!connection) {
        mkdirSync(dataDir, {recursive: true, mode: 0o700});
        connection = new DatabaseSync(join(dataDir, 'academy.sqlite'));
        connection.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    }
    return connection;
}

function prepared(sql, args = []) {
    return {
        bind(...values) {
            return prepared(sql, values)
        }, run() {
            return sqlite().prepare(sql).run(...args)
        }, all() {
            return {results: sqlite().prepare(sql).all(...args)}
        }, first() {
            return sqlite().prepare(sql).get(...args) || null
        }, sql, args
    };
}

export function database() {
    return {
        prepare: prepared, batch(ops) {
            const db = sqlite();
            db.exec('BEGIN IMMEDIATE');
            try {
                const results = ops.map(op => op.run());
                db.exec('COMMIT');
                return results;
            } catch (e) {
                db.exec('ROLLBACK');
                throw e;
            }
        }
    };
}

function objectPath(id) {
    if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw new Error('Invalid file id');
    const directory = join(dataDir, 'uploads');
    mkdirSync(directory, {recursive: true, mode: 0o700});
    return join(directory, id);
}

export function bucket() {
    return {
        async put(id, body, options = {}) {
            const path = objectPath(id);
            const bytes = body instanceof ReadableStream ? Buffer.from(await new Response(body).arrayBuffer()) : Buffer.from(body);
            const tmp = path + '.' + crypto.randomUUID() + '.tmp';
            writeFileSync(tmp, bytes, {mode: 0o600});
            renameSync(tmp, path);
            writeFileSync(path + '.json', JSON.stringify(options.httpMetadata || {}), {mode: 0o600});
        }, async get(id) {
            const path = objectPath(id);
            if (!existsSync(path)) return null;
            const metadata = existsSync(path + '.json') ? JSON.parse(readFileSync(path + '.json', 'utf8')) : {};
            return {body: readFileSync(path), httpMetadata: metadata};
        }, async delete(id) {
            const path = objectPath(id);
            rmSync(path, {force: true});
            rmSync(path + '.json', {force: true});
        }
    };
}
