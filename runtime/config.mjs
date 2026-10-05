export function requestOrigin(){const raw=process.env.APP_ORIGIN;if(!raw)throw new Error('APP_ORIGIN is required');return new URL(raw).origin;}
export function cookieSecurity(){return requestOrigin().startsWith('https:')?'Secure; ':'';}
export function clientIp(req){return process.env.TRUST_PROXY==='1'?(req.headers.get('x-real-ip')||'unknown'):'local';}
export function validateConfig(){const origin=new URL(requestOrigin());if(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new Error('Use HTTPS for public APP_ORIGIN');if(!['http:','https:'].includes(origin.protocol))throw new Error('Invalid APP_ORIGIN');}
