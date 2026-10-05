import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'dar-selfhost-test-'));const env={...process.env,DATA_DIR:dir,APP_ORIGIN:'http://127.0.0.1:3105',PORT:'3105',BIND_HOST:'127.0.0.1',TRUST_PROXY:'0',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',TWILIO_VERIFY_SERVICE_SID:''};
let server;
async function start(){server=spawn(process.execPath,['scripts/start.mjs'],{env,stdio:['ignore','ignore','inherit']});for(let i=0;i<80;i++){if(server.exitCode!==null)throw new Error('Test server exited');try{const r=await fetch(env.APP_ORIGIN+'/api/app');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('Test server unavailable');}
async function stop(){if(!server||server.exitCode!==null)return;await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')});}
try{await start();const r=spawnSync(process.execPath,['tests/selfhost.mjs'],{env,stdio:'inherit'});if(r.status!==0)throw new Error('Integration checks failed');await stop();await start();const login=await fetch(env.APP_ORIGIN+'/api/app',{method:'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({action:'login',data:{phone:'+201000000000',password:'Temporary-test-only-731'}})});if(!login.ok)throw new Error('Restart persistence failed');const cookie=login.headers.get('set-cookie').split(';')[0];const state=await (await fetch(env.APP_ORIGIN+'/api/app',{headers:{cookie}})).json();if(!state.students.length||!state.records.length)throw new Error('Data missing after restart');console.log('Restart persistence passed');}finally{await stop();rmSync(dir,{recursive:true,force:true});}
