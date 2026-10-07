const {mkdirSync,copyFileSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..'),output=join(__dirname,'public');mkdirSync(output,{recursive:true});
for(const file of ['index.html','app.js','styles.css','logo-cropped.png','Logo transparent.png'])copyFileSync(join(root,file),join(output,file));
writeFileSync(join(output,'_headers'),`/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
`);
console.log('Prepared storefront assets. Backend source and private data are excluded.');
