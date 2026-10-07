import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const origin = new URL(process.env.SOURCE_URL || 'https://dar-al-tifl-al-muslim.ahmedelgezawy1133.chatgpt.site').origin;
if (!origin.startsWith('https://')) throw new Error('SOURCE_URL must use HTTPS');
if (!process.env.SOURCE_PHONE || !process.env.SOURCE_PASSWORD) throw new Error('Set SOURCE_PHONE and SOURCE_PASSWORD privately in .env (administrator credentials)');
const target = resolve(process.argv[2] || 'backups/migration-export');
if (existsSync(target)) throw new Error('Choose a new empty export directory');
const login = await fetch(origin + '/api/app', {
    method: 'POST',
    redirect: 'error',
    headers: {'Content-Type': 'application/json', Origin: origin},
    body: JSON.stringify({
        action: 'login',
        data: {phone: process.env.SOURCE_PHONE, password: process.env.SOURCE_PASSWORD, expected_role: 'admin'}
    })
});
if (!login.ok) throw new Error('Administrator login failed');
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Missing login session');
try {
    const r = await fetch(origin + '/api/app?action=backup', {redirect: 'error', headers: {cookie}});
    if (!r.ok) throw new Error('Backup download failed');
    const snapshot = await r.json();
    mkdirSync(join(target, 'media'), {recursive: true, mode: 0o700});
    for (const f of snapshot.files) {
        if (!/^[a-zA-Z0-9_-]{1,150}$/.test(f.id)) throw new Error('Invalid file ID');
        const file = await fetch(origin + '/api/app?action=file&id=' + encodeURIComponent(f.id), {
            redirect: 'error',
            headers: {cookie}
        });
        if (!file.ok) throw new Error('Media missing: ' + f.id);
        writeFileSync(join(target, 'media', f.id), Buffer.from(await file.arrayBuffer()), {mode: 0o600});
    }
    writeFileSync(join(target, 'snapshot.json'), JSON.stringify(snapshot), {mode: 0o600});
    console.log('Complete export saved to ' + target + '. Contains private data and password hashes; keep off Git and web directories.');
} finally {
    await fetch(origin + '/api/app', {
        method: 'POST',
        headers: {cookie, Origin: origin, 'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'logout'}),
        redirect: 'error'
    }).catch(() => {
    });
}
