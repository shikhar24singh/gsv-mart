const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const assert=require('node:assert/strict');
const {hashPassword}=require('../database');

(async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({name:'gsv-test',modules:true,scriptPath:join(__dirname,'worker.mjs'),compatibilityDate:'2026-10-07',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['PHOTOS']}));
 try{
 const db=await mf.getD1Database('DB');await db.exec(readFileSync(join(__dirname,'migrations','0001_schema.sql'),'utf8'));
 await db.prepare('INSERT INTO admins(email,password) VALUES (?,?)').bind('worker-test@example.com',hashPassword('temporary-test-password')).run();
 const send=(path,method='GET',body,headers={})=>mf.dispatchFetch('https://gsv-test.example'+path,{method,headers:{Origin:'https://gsv-test.example','Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const product={name:'Worker decor',category:'Home Decor',price:500,description:'Runtime test product.',image:'',amazon:'',flipkart:'',featured:false};
 assert.equal((await send('/healthz')).status,200);
 assert.equal((await send('/api/products','POST',product)).status,401);
 assert.equal((await send('/api/auth/login','POST',{email:'worker-test@example.com',password:'wrong'})).status,401);
 const login=await send('/api/auth/login','POST',{email:'worker-test@example.com',password:'temporary-test-password'});assert.equal(login.status,200);const session=await login.json();
 const cookie=login.headers.get('Set-Cookie');assert.match(cookie,/Secure/);const headers={Cookie:cookie.split(';')[0],'X-CSRF-Token':session.csrf};
 assert.equal((await send('/api/products','POST',product,{Cookie:headers.Cookie})).status,403);
 assert.equal((await send('/api/products','POST',product,{...headers,Origin:'https://evil.example'})).status,403);
 assert.equal((await send('/api/products','POST',{...product,image:'javascript:alert(1)'},headers)).status,400);
 const upload=await mf.dispatchFetch('https://gsv-test.example/api/uploads',{method:'POST',headers:{...headers,Origin:'https://gsv-test.example','Content-Type':'image/jpeg'},body:Uint8Array.from([255,216,255,224,255,217])});assert.equal(upload.status,201);const photo=await upload.json();product.image=photo.image;
 assert.equal((await send(photo.image)).status,200);
 const created=await send('/api/products','POST',product,headers);assert.equal(created.status,201);const saved=(await created.json()).product;
 assert.equal((await send('/api/products/'+saved.id,'PUT',{...product,name:'Updated worker decor'},headers)).status,200);
 assert.equal((await (await send('/api/products')).json()).products[0].name,'Updated worker decor');
 assert.equal((await send('/api/products/'+saved.id,'DELETE',undefined,headers)).status,200);
 assert.equal((await send('/api/auth/logout','POST',{},headers)).status,200);
 assert.equal((await send('/api/products','POST',product,headers)).status,401);
 for(let i=0;i<8;i++)await send('/api/auth/login','POST',{email:'worker-test@example.com',password:'wrong'});
 assert.equal((await send('/api/auth/login','POST',{email:'worker-test@example.com',password:'wrong'})).status,429);
 console.log('Cloudflare runtime checks passed: D1, R2 photos, password verification, cookies, authorization, CSRF, validation, logout, rate limiting.');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1});
