import { scrypt, timingSafeEqual, createHash } from 'node:crypto';

const CATEGORIES=['Home & Living','Home Decor','Lighting','Kitchen','Kitchen & Tableware','Textiles','Storage & Organisation','Accessories','Other'];
const json=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin',...headers}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const digest=token=>createHash('sha256').update(token).digest('hex');
const cookie=(token,age,secure)=>`gsv_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
async function readBytes(request,max){const reader=request.body?.getReader();if(!reader)return new Uint8Array();let size=0,chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();fail(413,'Request is too large.');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
async function readJson(request){if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))fail(415,'JSON required.');const bytes=await readBytes(request,16384);try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'Invalid JSON.');}}
async function verifyPassword(password,hash){const [salt,key]=hash.split(':');if(!salt||!key)return false;const value=await new Promise((resolve,reject)=>scrypt(password,salt,64,(error,key)=>error?reject(error):resolve(key)));return timingSafeEqual(Buffer.from(key,'hex'),value);}
async function session(request,db){const token=/(?:^|;\s*)gsv_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie')||'')?.[1];if(!token)return null;return db.prepare('SELECT sessions.*, admins.email FROM sessions JOIN admins ON admins.id=sessions.admin_id WHERE token=? AND expires>?').bind(digest(token),Date.now()).first();}
async function validate(data,env){
  if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Product required.');const p={};
  for(const [key,max] of [['name',80],['description',220],['category',60],['image',2048],['amazon',2048],['flipkart',2048]]){if(typeof data[key]!=='string'||data[key].trim().length>max)fail(400,`Invalid ${key}.`);p[key]=data[key].trim();}
  if(!p.name||!p.description||!CATEGORIES.includes(p.category))fail(400,'Name, description and a valid category are required.');
  if(typeof data.price!=='number'||!Number.isFinite(data.price)||data.price<0||data.price>10000000)fail(400,'Invalid price.');
  if(typeof data.featured!=='boolean')fail(400,'Invalid featured value.');
  for(const key of ['image','amazon','flipkart'])if(p[key]){
    if(key==='image'&&/^\/uploads\/[a-f0-9-]{36}\.jpg$/.test(p[key])){if(!await env.PHOTOS.head(p[key].slice('/uploads/'.length)))fail(400,'Uploaded photo not found.');continue;}
    let url;try{url=new URL(p[key]);}catch{fail(400,`Invalid ${key} URL.`);}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail(400,`Use an HTTP or HTTPS ${key} URL.`);
  }
  return {...p,price:data.price,featured:data.featured};
}
export default {
  async fetch(request,env){
    try{
      const url=new URL(request.url),path=decodeURIComponent(url.pathname),db=env.DB;
      // Incoming origin is Cloudflare's canonical request URL, never a forwarded header.
      const allowedOrigin=env.APP_ORIGIN||url.origin;
      if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==allowedOrigin)return json(403,{error:'Request origin is not allowed.'});
      if(path==='/healthz'){await db.prepare('SELECT 1 FROM products LIMIT 1').first();return json(200,{status:'ok'});}
      if(/^\/uploads\/[a-f0-9-]{36}\.jpg$/.test(path)&&['GET','HEAD'].includes(request.method)){
        const object=await env.PHOTOS.get(path.slice('/uploads/'.length));if(!object)return json(404,{error:'Photo not found.'});
        return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff',ETag:object.httpEtag}});
      }
      if(path==='/api/products'&&request.method==='GET'){const result=await db.prepare('SELECT content FROM products ORDER BY rowid DESC').all();return json(200,{products:result.results.map(p=>JSON.parse(p.content))});}
      if(path==='/api/auth/session'&&request.method==='GET'){const s=await session(request,db);return json(200,s?{authenticated:true,email:s.email,csrf:s.csrf}:{authenticated:false});}
      if(path==='/api/auth/login'&&request.method==='POST'){
        const data=await readJson(request);if(typeof data.email!=='string'||data.email.length>254||typeof data.password!=='string'||data.password.length>256)fail(400,'Email and password required.');
        const ip=digest(request.headers.get('CF-Connecting-IP')||'local');const now=Date.now();
        await db.prepare('INSERT INTO login_limits(ip,count,until) VALUES (?,1,?) ON CONFLICT(ip) DO UPDATE SET count=CASE WHEN until<? THEN 1 ELSE count+1 END, until=CASE WHEN until<? THEN excluded.until ELSE until END').bind(ip,now+900000,now,now).run();
        const limit=await db.prepare('SELECT count FROM login_limits WHERE ip=?').bind(ip).first();if(limit.count>8)fail(429,'Too many sign-in attempts. Try again in 15 minutes.');
        const admin=await db.prepare('SELECT * FROM admins WHERE email=?').bind(data.email.trim().toLowerCase()).first();
        // Use an existing hash to avoid skipping password derivation for unknown accounts.
        const fallback=admin||await db.prepare('SELECT password FROM admins LIMIT 1').first();
        const valid=fallback?await verifyPassword(data.password,fallback.password):false;
        if(!admin||!valid)fail(401,'Email or password is incorrect.');
        const token=randomToken(),csrf=randomToken(),old=await session(request,db);
        await db.batch([
          db.prepare('DELETE FROM login_limits WHERE ip=? OR until<?').bind(ip,now),
          db.prepare('DELETE FROM sessions WHERE expires<=? OR token=?').bind(now,old?.token||''),
          db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(digest(token),admin.id,csrf,now+28800000)
        ]);
        return json(200,{authenticated:true,email:admin.email,csrf},{'Set-Cookie':cookie(token,28800,url.protocol==='https:')});
      }
      if(path.startsWith('/api/')){
        const s=await session(request,db);if(!s)fail(401,'Sign in as an admin to continue.');
        if(!['GET','HEAD'].includes(request.method)&&request.headers.get('X-CSRF-Token')!==s.csrf)fail(403,'Refresh the page and sign in again.');
        if(path==='/api/auth/logout'&&request.method==='POST'){await db.prepare('DELETE FROM sessions WHERE token=?').bind(s.token).run();return json(200,{ok:true},{'Set-Cookie':cookie('',0,url.protocol==='https:')});}
        if(path==='/api/uploads'&&request.method==='POST'){
          if(request.headers.get('Content-Type')!=='image/jpeg')fail(415,'Please upload a JPEG photo.');const bytes=await readBytes(request,5*1024*1024);
          if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)fail(400,'Invalid photo file.');
          const name=crypto.randomUUID()+'.jpg';await env.PHOTOS.put(name,bytes,{httpMetadata:{contentType:'image/jpeg'}});return json(201,{image:'/uploads/'+name});
        }
        if(path==='/api/products'&&request.method==='POST'){const p={...await validate(await readJson(request),env),id:crypto.randomUUID()};await db.prepare('INSERT INTO products VALUES (?,?)').bind(p.id,JSON.stringify(p)).run();return json(201,{product:p});}
        const match=/^\/api\/products\/([a-zA-Z0-9-]+)$/.exec(path);
        if(match&&['PUT','DELETE'].includes(request.method)){
          if(!await db.prepare('SELECT id FROM products WHERE id=?').bind(match[1]).first())fail(404,'Product not found.');
          if(request.method==='DELETE'){await db.prepare('DELETE FROM products WHERE id=?').bind(match[1]).run();return json(200,{ok:true});}
          const p={...await validate(await readJson(request),env),id:match[1]};await db.prepare('UPDATE products SET content=? WHERE id=?').bind(JSON.stringify(p),p.id).run();return json(200,{product:p});
        }
        return json(404,{error:'Endpoint not found.'});
      }
      return env.ASSETS.fetch(request);
    }catch(error){if(!error.status)console.error(error.message);return json(error.status||500,{error:error.status?error.message:'Something went wrong. Please try again.'});}
  }
};
