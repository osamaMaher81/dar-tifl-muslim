import './migrate.mjs';
import {sqlite} from '../runtime/storage.mjs';
import {pbkdf2Sync, randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';

const db = sqlite();
if (db.prepare("SELECT id FROM users WHERE role='admin'").get()) throw new Error('Administrator already exists; import data before creating an administrator if migrating.');
const prompt = createInterface({input: process.stdin, output: process.stdout});
const name = await prompt.question('Administrator full name: ');
const phone = await prompt.question('Phone (+201...): ');
prompt.close();
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12 || name.trim().length < 3 || !/^\+[1-9][0-9]{7,14}$/.test(phone)) throw new Error('Set ADMIN_PASSWORD (12+ characters) in your private .env; provide a valid name and international phone.');
const salt = randomUUID();
const hash = salt + ':' + pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)').run('academy-owner', name.trim(), phone, hash, 'admin', 'active', null, '{}', new Date().toISOString());
console.log('Administrator created. Remove ADMIN_PASSWORD from .env now.');
