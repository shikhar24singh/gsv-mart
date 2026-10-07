// Export products and password hashes only; active local sessions are not migrated.
const {DatabaseSync}=require('node:sqlite');
const {existsSync,mkdirSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..'),dbPath=join(root,'data','gsv.sqlite');
if(!existsSync(dbPath))throw new Error('No local database exists. Run the local server and create an admin first.');
const db=new DatabaseSync(dbPath,{readOnly:true});
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
try{
 const adminsOnly=process.argv.includes('--admins-only');
 const products=adminsOnly?[]:db.prepare('SELECT id,content FROM products').all();
 const admins=db.prepare('SELECT id,email,password FROM admins').all();
 if(!admins.length)throw new Error('Create a local admin account before migrating.');
 const statements=[];
 for(const p of products)statements.push(`INSERT INTO products(id,content) VALUES (${quote(p.id)},${quote(p.content)}) ON CONFLICT(id) DO NOTHING;`);
 for(const a of admins)statements.push(`INSERT INTO admins(id,email,password) VALUES (${Number(a.id)},${quote(a.email)},${quote(a.password)}) ON CONFLICT(email) DO NOTHING;`);
 statements.push("INSERT INTO metadata(key,value) VALUES ('seeded','yes') ON CONFLICT(key) DO NOTHING;");
 mkdirSync(join(root,'work'),{recursive:true});writeFileSync(join(root,'work',adminsOnly?'cloudflare-admin.sql':'cloudflare-import.sql'),statements.join('\n'),{mode:0o600});
 console.log(`Prepared private migration file: ${products.length} products, ${admins.length} admins. Passwords and session tokens are not printed.`);
}finally{db.close();}
