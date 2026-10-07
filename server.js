const http = require('node:http');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { openDatabase, hashPassword, verifyPassword } = require('./database');
const CATEGORIES = ['Home & Living', 'Home Decor', 'Lighting', 'Kitchen', 'Kitchen & Tableware', 'Textiles', 'Storage & Organisation', 'Accessories', 'Other'];
const STATIC = { '/':'index.html', '/index.html':'index.html', '/styles.css':'styles.css', '/app.js':'app.js', '/logo-cropped.png':'logo-cropped.png', '/Logo transparent.png':'Logo transparent.png' };
const digest = token => createHash('sha256').update(token).digest('hex');
function createApp(options = {}) {
  const db = openDatabase(options.dataDir);
  const uploadDir = join(options.dataDir || process.env.DATA_DIR || join(__dirname,'data'), 'uploads');
  mkdirSync(uploadDir,{recursive:true});
  const secure = options.secure ?? process.env.NODE_ENV === 'production';
  const configuredOrigin = options.origin || process.env.APP_ORIGIN;
  if(secure && !configuredOrigin){db.close();throw new Error('APP_ORIGIN must be set to the HTTPS website URL in production.');}
  const origin = configuredOrigin || 'http://localhost:'+(process.env.PORT || 3000);
  const originUrl = new URL(origin);
  if(origin!==originUrl.origin || (secure && originUrl.protocol!=='https:')){db.close();throw new Error('APP_ORIGIN must be an exact website origin (HTTPS in production), without a trailing slash or path.');}
  const dummyHash = hashPassword(randomBytes(24).toString('hex'));
  const attempts = new Map();
  if (!db.prepare("SELECT value FROM metadata WHERE key='seeded'").get()) {
    const seed = JSON.parse(readFileSync(join(__dirname, 'seed-products.json'), 'utf8'));
    db.exec('BEGIN');
    try { for (const p of seed) db.prepare('INSERT INTO products VALUES (?,?)').run(p.id, JSON.stringify(p)); db.prepare('INSERT INTO metadata VALUES (?,?)').run('seeded','yes'); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  const cookie = (token, age) => `gsv_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
  function session(req) {
    const token = /(?:^|;\s*)gsv_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!token) return null;
    return db.prepare('SELECT sessions.*, admins.email FROM sessions JOIN admins ON admins.id=sessions.admin_id WHERE token=? AND expires>?').get(digest(token), Date.now());
  }
  function send(res, status, body, headers = {}) { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...headers }); res.end(JSON.stringify(body)); }
  async function body(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON required.'), {status:415});
    let chunks = [], size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 16384) throw Object.assign(new Error('Request too large.'), {status:413}); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw Object.assign(new Error('Invalid JSON.'), {status:400}); }
  }
  function validate(data) {
    const invalid = msg => { throw Object.assign(new Error(msg), {status:400}); };
    if (!data || typeof data !== 'object' || Array.isArray(data)) invalid('Product required.');
    const p = {};
    for (const [key, max] of [['name',80],['description',220],['category',60],['image',2048],['amazon',2048],['flipkart',2048]]) {
      if (typeof data[key] !== 'string' || data[key].trim().length > max) invalid(`Invalid ${key}.`);
      p[key] = data[key].trim();
    }
    if (!p.name || !p.description || !CATEGORIES.includes(p.category)) invalid('Name, description and a valid category are required.');
    if (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price < 0 || data.price > 10000000) invalid('Invalid price.');
    if (typeof data.featured !== 'boolean') invalid('Invalid featured value.');
    for (const key of ['image','amazon','flipkart']) if (p[key]) {
      if(key==='image' && /^\/uploads\/[a-f0-9-]{36}\.jpg$/.test(p[key])) { if(!existsSync(join(uploadDir,p[key].split('/').pop())))invalid('Uploaded photo not found.');continue; }
      let url; try { url = new URL(p[key]); } catch { invalid(`Invalid ${key} URL.`); } if (!['http:','https:'].includes(url.protocol) || url.username || url.password) invalid(`Use an HTTP or HTTPS ${key} URL.`);
    }
    return {...p, price:data.price, featured:data.featured};
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    try {
      const path = decodeURIComponent(new URL(req.url, origin).pathname);
      if(path==='/healthz' && req.method==='GET'){db.prepare('SELECT 1').get();return send(res,200,{status:'ok'});}
      if (!['GET','HEAD'].includes(req.method) && req.headers.origin !== origin) return send(res,403,{error:'Request origin is not allowed.'});
      if(/^\/uploads\/[a-f0-9-]{36}\.jpg$/.test(path) && ['GET','HEAD'].includes(req.method)) {
        const file=join(uploadDir,path.split('/').pop());if(!existsSync(file))return send(res,404,{error:'Photo not found.'});
        res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000, immutable'});return res.end(req.method==='HEAD'?undefined:readFileSync(file));
      }
      if (path === '/api/products' && req.method === 'GET') return send(res,200,{products:db.prepare('SELECT content FROM products ORDER BY rowid DESC').all().map(row=>JSON.parse(row.content))});
      if (path === '/api/auth/session' && req.method === 'GET') { const s=session(req); return send(res,200,s?{authenticated:true,email:s.email,csrf:s.csrf}:{authenticated:false}); }
      if (path === '/api/auth/login' && req.method === 'POST') {
        const address = req.socket.remoteAddress;
        for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key);
        const limit=attempts.get(address); if (limit && limit.count >= 8) return send(res,429,{error:'Too many sign-in attempts. Try again in 15 minutes.'});
        const data=await body(req);
        if (typeof data.email !== 'string' || data.email.length > 254 || typeof data.password !== 'string' || data.password.length > 256) return send(res,400,{error:'Email and password required.'});
        const admin=db.prepare('SELECT * FROM admins WHERE email=?').get(data.email.trim().toLowerCase());
        const valid=verifyPassword(data.password,admin?.password || dummyHash);
        if (!admin || !valid) { attempts.set(address,{count:(limit?.count || 0)+1,until:limit?.until || Date.now()+900000}); return send(res,401,{error:'Email or password is incorrect.'}); }
        attempts.delete(address);
        db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
        const old=session(req); if(old) db.prepare('DELETE FROM sessions WHERE token=?').run(old.token);
        const token=randomBytes(32).toString('hex'), csrf=randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(digest(token),admin.id,csrf,Date.now()+28800000);
        return send(res,200,{authenticated:true,email:admin.email,csrf},{'Set-Cookie':cookie(token,28800)});
      }
      if (path.startsWith('/api/')) {
        const s=session(req); if(!s) return send(res,401,{error:'Sign in as an admin to continue.'});
        if (!['GET','HEAD'].includes(req.method) && req.headers['x-csrf-token']!==s.csrf) return send(res,403,{error:'Refresh the page and sign in again.'});
        if(path==='/api/uploads' && req.method==='POST') {
          if(req.headers['content-type']!=='image/jpeg')return send(res,415,{error:'Please upload a JPEG photo.'});
          const chunks=[];let size=0;
          for await(const chunk of req){size+=chunk.length;if(size>5*1024*1024)throw Object.assign(new Error('Photo must be smaller than 5 MB.'),{status:413});chunks.push(chunk);}
          const bytes=Buffer.concat(chunks);
          if(bytes.length<4 || bytes[0]!==255 || bytes[1]!==216 || bytes[2]!==255 || bytes[bytes.length-2]!==255 || bytes[bytes.length-1]!==217)return send(res,400,{error:'Invalid photo file.'});
          const name=randomUUID()+'.jpg';writeFileSync(join(uploadDir,name),bytes,{flag:'wx'});return send(res,201,{image:'/uploads/'+name});
        }
        if(path==='/api/auth/logout' && req.method==='POST'){ db.prepare('DELETE FROM sessions WHERE token=?').run(s.token);return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)}); }
        if(path==='/api/products' && req.method==='POST'){const p={...validate(await body(req)),id:randomUUID()};db.prepare('INSERT INTO products VALUES (?,?)').run(p.id,JSON.stringify(p));return send(res,201,{product:p});}
        const match=/^\/api\/products\/([a-zA-Z0-9-]+)$/.exec(path);
        if(match && ['PUT','DELETE'].includes(req.method)) {
          if(!db.prepare('SELECT id FROM products WHERE id=?').get(match[1]))return send(res,404,{error:'Product not found.'});
          if(req.method==='DELETE'){db.prepare('DELETE FROM products WHERE id=?').run(match[1]);return send(res,200,{ok:true});}
          const p={...validate(await body(req)),id:match[1]};db.prepare('UPDATE products SET content=? WHERE id=?').run(JSON.stringify(p),p.id);return send(res,200,{product:p});
        }
        return send(res,404,{error:'Endpoint not found.'});
      }
      if (['GET','HEAD'].includes(req.method) && STATIC[path]) {
        const file=STATIC[path], content=readFileSync(join(__dirname,file));
        const type=file.endsWith('.png')?'image/png':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8';
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});return res.end(req.method==='HEAD'?undefined:content);
      }
      send(res,404,{error:'Page not found.'});
    } catch(error){if(!error.status)console.error(error);send(res,error.status || 500,{error:error.status?error.message:'Something went wrong. Please try again.'});}
  });
  server.on('close',()=>db.close());
  return {server,db};
}
if(require.main===module){
  const port=Number(process.env.PORT || 3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535.');
  const {server}=createApp();
  server.listen(port,process.env.HOST || '127.0.0.1',()=>console.log(`GSV Mart running at ${process.env.APP_ORIGIN || 'http://localhost:'+port}`));
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;server.close(()=>process.exit(0));server.closeIdleConnections();setTimeout(()=>process.exit(1),10000).unref();};
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
module.exports={createApp};
