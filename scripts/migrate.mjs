import {readdirSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sqlite} from '../runtime/storage.mjs';

export function migrate() {
    const db = sqlite();
    db.exec('CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY,hash TEXT NOT NULL)');
    for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql')).sort()) {
        const sql = readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8');
        const hash = createHash('sha256').update(sql).digest('hex');
        const previous = db.prepare('SELECT hash FROM _migrations WHERE name=?').get(name);
        if (previous) {
            if (previous.hash !== hash) throw new Error('Applied migration changed: ' + name);
            continue;
        }
        db.exec('BEGIN IMMEDIATE');
        try {
            for (const part of sql.split('--> statement-breakpoint').filter(s => s.trim())) db.exec(part);
            db.prepare('INSERT INTO _migrations VALUES(?,?)').run(name, hash);
            db.exec('COMMIT');
        } catch (e) {
            db.exec('ROLLBACK');
            throw e;
        }
    }
}

migrate();
console.log('Database migrations ready');
