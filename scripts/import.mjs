// Import the existing encrypted application backup into an EMPTY target only.
import './migrate.mjs';
import {sqlite,bucket} from '../runtime/storage.mjs';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pbkdf2Sync,createDecipheriv} from 'node:crypto';
const source=process.argv[2],mediaDir=process.argv[3];if(!source)throw new Error('Usage: npm run data:import -- backup.encrypted.json [media-directory]');
const db=sqlite();if(db.prepare('SELECT count(*) n FROM users').get().n)throw new Error('Target must be empty. Do not create administrator before importing.');
let snap=JSON.parse(readFileSync(source,'utf8'));if(snap.format==='dar-backup-v1'){if(!process.env.BACKUP_PASSPHRASE)throw new Error('Set BACKUP_PASSPHRASE privately in .env');const key=pbkdf2Sync(process.env.BACKUP_PASSPHRASE,Buffer.from(snap.salt,'base64'),200000,32,'sha256');const bytes=Buffer.from(snap.cipher,'base64');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(snap.iv,'base64'));decipher.setAuthTag(bytes.subarray(-16));snap=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]).toString());}
if(snap.version!==1)throw new Error('Unsupported backup');
const tables=['users','circles','assignments','students','links','records','audit','files','settings'];
for(const t of tables)if(!Array.isArray(snap[t]))throw new Error('Missing table '+t);
for(const f of snap.files){if(!/^[a-zA-Z0-9_-]{1,150}$/.test(f.id))throw new Error('Invalid file ID');}
const missing=snap.files.filter(f=>!mediaDir||!existsSync(join(resolve(mediaDir),f.id)));if(missing.length)throw new Error(`${missing.length} media files missing. Download all files by original ID before import.`);
for(const f of snap.files)await bucket().put(f.id,readFileSync(join(resolve(mediaDir),f.id)),{httpMetadata:{contentType:f.type}});
db.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;');try{for(const t of tables){const cols=db.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name);const insert=db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`);for(const row of snap[t]){if(!cols.every(c=>c in row))throw new Error('Incomplete '+t);insert.run(...cols.map(c=>row[c]));}}if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Broken relationships');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');for(const f of snap.files)await bucket().delete(f.id);throw e;}
console.log('Imported all records and media. Existing passwords remain valid; sessions are not imported. Remove BACKUP_PASSPHRASE from .env.');
