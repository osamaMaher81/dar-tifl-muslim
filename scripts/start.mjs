import {validateConfig} from '../runtime/config.mjs';
import {dataDir} from '../runtime/storage.mjs';
import './migrate.mjs';
import {cpSync} from 'node:fs';
import {spawn} from 'node:child_process';
validateConfig();cpSync('public','.next/standalone/public',{recursive:true});cpSync('.next/static','.next/standalone/.next/static',{recursive:true});
const child=spawn(process.execPath,['.next/standalone/server.js'],{stdio:'inherit',env:{...process.env,DATA_DIR:dataDir,HOSTNAME:process.env.BIND_HOST||'127.0.0.1',PORT:process.env.PORT||'3000'}});for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill(sig));child.on('exit',code=>process.exit(code??1));
