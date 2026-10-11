import { supabaseAdmin } from '@/integrations/supabase/client.server';
const enc = new TextEncoder();
async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),b=>b.toString(16).padStart(2,'0')).join('')}
async function credentials(){
 const {data}=await supabaseAdmin.from('settings').select('key,value').in('key',['secret_panel_login','secret_panel_password']);
 const settings=Object.fromEntries((data??[]).map(r=>[r.key,r.value]));
 return {login:settings['secret_panel_login']||process.env['PANEL_ADMIN_LOGIN']||'', password:settings['secret_panel_password']||process.env['PANEL_ADMIN_PASSWORD']||'', stored:Boolean(settings['secret_panel_password'])};
}
async function equal(a:string,b:string){const x=await digest(a),y=await digest(b);let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0}
async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256);return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('')}
async function matches(password:string,stored:string,isStored:boolean){if(!isStored)return equal(password,stored);const [salt,hash]=stored.split(':');if(!salt||!hash)return false;return equal(await passwordHash(password,salt),hash)}
async function signingKey(password:string){const secret=process.env['PANEL_SESSION_SECRET'];if(!secret)throw new Error('Brak konfiguracji panelu.');return crypto.subtle.importKey('raw',enc.encode(secret+password),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
function hex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}
export async function verifyPanelSession(token:string){
 try{const [prefix,expiry,signature]=token.split('.');if(prefix!=='panel'||!expiry||!signature||!/^[a-f0-9]{64}$/.test(signature)||Number(expiry)<Date.now())return null;
 const c=await credentials();const bytes=Uint8Array.from(signature.match(/.{2}/g)??[],h=>parseInt(h,16));
 if(!await crypto.subtle.verify('HMAC',await signingKey(c.password),bytes,enc.encode(prefix+'.'+expiry)))return null;
 return {role:'admin' as const,exp:Number(expiry)};}catch{return null}
}
export async function loginPanel(login:string,password:string){
 const {data}=await supabaseAdmin.from('settings').select('value').eq('key','secret_panel_attempts').maybeSingle();
 let state={count:0,until:0};try{state=JSON.parse(data?.value??'{}')}catch{/*empty*/}
 if(state.until>Date.now()&&state.count>=10)return {ok:false as const,error:'Zbyt wiele prób. Spróbuj za 10 minut.'};
 const c=await credentials();if(!c.login||!c.password)return {ok:false as const,error:'Dostęp administratora nie został skonfigurowany.'};
 if(!await equal(login,c.login)||!await matches(password,c.password,c.stored)){
 const next={count:state.until>Date.now()?state.count+1:1,until:state.until>Date.now()?state.until:Date.now()+600000};
 await supabaseAdmin.from('settings').upsert({key:'secret_panel_attempts',value:JSON.stringify(next)});return {ok:false as const,error:'Nieprawidłowy login lub hasło.'};}
 await supabaseAdmin.from('settings').upsert({key:'secret_panel_attempts',value:'{}'});
 const payload='panel.'+(Date.now()+8*60*60*1000);const signature=hex(await crypto.subtle.sign('HMAC',await signingKey(c.password),enc.encode(payload)));
 return {ok:true as const,token:payload+'.'+signature};
}
export async function changePanelCredentials(token:string,current:string,login:string,password:string){
 if(!await verifyPanelSession(token))return {error:'Zaloguj się ponownie.'};const c=await credentials();
 if(!await matches(current,c.password,c.stored))return {error:'Nieprawidłowe obecne hasło.'};
 if(!login.trim()||password.length<12)return {error:'Podaj login i hasło z minimum 12 znakami.'};
 const salt=crypto.randomUUID();const {error}=await supabaseAdmin.from('settings').upsert([{key:'secret_panel_login',value:login.trim()},{key:'secret_panel_password',value:salt+':'+await passwordHash(password,salt)}]);return {error:error?'Nie udało się zapisać.':null};
}
