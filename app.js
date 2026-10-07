let products=[];
let csrfToken='';
let selectedPhoto=null,photoPreviewUrl='';
let activeCategory='All finds',editingId=null,toastTimer;
const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(n)||0);
const art=(category='')=>{let type=['Kitchen','Kitchen & Tableware'].includes(category)?'bowl':category==='Accessories'?'bag':category==='Textiles'?'textile':'vase';let forms={vase:'<path d="M39 25h22v14c0 8 11 10 11 24v51c0 14-8 20-22 20h-1c-14 0-22-6-22-20V63c0-14 12-16 12-24z" fill="#bd986f"/><ellipse cx="50" cy="25" rx="11" ry="4" fill="#8d704f"/><path d="M49 24 45 5m6 19 12-13m-13 12L35 12" fill="none" stroke="#586347" stroke-width="2"/><path d="M44 14q-9-9-13 0 8 2 13 0m7 1q3-12 12-8-4 9-12 8" fill="#68744f"/>',bowl:'<path d="M18 65h64c0 31-12 50-32 50S18 96 18 65z" fill="#d18e60"/><ellipse cx="50" cy="65" rx="32" ry="9" fill="#f4d7b5"/><ellipse cx="50" cy="65" rx="22" ry="5" fill="#fbf0de"/><path d="M28 84q22 13 44 0" fill="none" stroke="#af704a" stroke-width="2"/>',bag:'<path d="M28 43h44l5 61H23z" fill="#aa8665"/><path d="M37 45c0-25 26-25 26 0" fill="none" stroke="#806349" stroke-width="5"/><path d="M31 58h38" stroke="#c3a17e" stroke-width="2"/>',textile:'<path d="M26 25h48v88q-10-8-20 0-10-8-28 0z" fill="#c18c75"/><path d="M26 42h48M26 59h48M26 76h48M26 93h48" stroke="#e3bea8" stroke-width="3"/><path d="M35 25v88m18-88v88m16-88v88" stroke="#ad7664" stroke-width="1"/>'};return `<div class="fallback-art"><svg viewBox="0 0 100 150" aria-hidden="true">${forms[type]}</svg></div>`};
const categories=()=>['All finds',...new Set(products.map(p=>p.category).filter(Boolean))];
function renderTabs(){ $('categoryTabs').innerHTML=categories().map(c=>`<button class="category-tab ${c===activeCategory?'selected':''}" data-category="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join(''); }
function renderStore(){renderTabs();let q=$('searchInput').value.trim().toLowerCase();let list=products.filter(p=>(activeCategory==='All finds'||p.category===activeCategory)&&(!q||`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q))).sort((a,b)=>Number(b.featured)-Number(a.featured));$('productGrid').innerHTML=list.map((p,i)=>`<article class="product-card" data-open-product="${escapeHTML(p.id)}"><div class="product-image">${p.image?`<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" loading="lazy" onerror="this.remove()">`:''}${art(p.category)}${p.featured?'<span class="product-badge">GSV FAVOURITE</span>':''}<span class="heart-mark" aria-hidden="true">♡</span></div><div class="product-info"><div class="product-meta"><span>${escapeHTML(p.category||'Everyday')}</span><span>${String(i+1).padStart(2,'0')}</span></div><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.description)}</p><div class="product-price-row"><span class="product-price">${money(p.price)}</span><span class="quick-view">Take a closer look ↗</span></div></div></article>`).join('');$('productGrid').classList.toggle('hidden',!list.length);$('emptyState').classList.toggle('hidden',Boolean(list.length));$('productCount').textContent=`${list.length} thoughtfully chosen ${list.length===1?'find':'finds'}`; }
function marketplace(p){return `<div class="dialog-market-label">SHOP WITH OUR MARKETPLACE PARTNERS</div><div class="market-buttons"><a class="market-button ${p.amazon?'':'disabled'}" ${p.amazon?`href="${escapeHTML(p.amazon)}" target="_blank" rel="noopener noreferrer"`:''}><span style="color:#df8a19">a</span> &nbsp;Amazon ↗</a><a class="market-button ${p.flipkart?'':'disabled'}" ${p.flipkart?`href="${escapeHTML(p.flipkart)}" target="_blank" rel="noopener noreferrer"`:''}><span style="color:#1768df">f</span> &nbsp;Flipkart ↗</a></div>`;}
function openProduct(id){let p=products.find(x=>x.id===id);if(!p)return;$('dialogContent').innerHTML=`<div class="dialog-product-art">${art(p.category)}${p.image?`<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" onerror="this.remove()">`:''}</div><div class="dialog-product-copy"><div class="eyebrow"><span class="eyebrow-dot"></span> ${escapeHTML(p.category||'GSV MART FIND')}</div><h2>${escapeHTML(p.name)}</h2><p>${escapeHTML(p.description)}</p><div class="dialog-price">${money(p.price)}</div>${marketplace(p)}<p style="font-size:8px;margin-top:18px">Prices and availability are managed by each marketplace.</p></div>`;$('productDialog').showModal();}
function notify(message){let t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2400);}
function renderAdmin(){let q=$('adminSearch').value.toLowerCase().trim(),list=products.filter(p=>`${p.name} ${p.category}`.toLowerCase().includes(q));$('statAll').textContent=products.length;$('statActive').textContent=products.length;$('statLinks').textContent=products.reduce((n,p)=>n+Number(Boolean(p.amazon))+Number(Boolean(p.flipkart)),0);$('adminCount').textContent=list.length;$('adminRows').innerHTML=list.map(p=>`<tr><td><div class="admin-product">${p.image?`<img class="admin-thumb" src="${escapeHTML(p.image)}" alt="" onerror="this.remove()">`:`<div class="admin-thumb">${art(p.category)}</div>`}<span><b>${escapeHTML(p.name)}</b><small>${escapeHTML(p.description.slice(0,39))}${p.description.length>39?'…':''}</small></span></div></td><td>${escapeHTML(p.category)}</td><td class="admin-price">${money(p.price)}</td><td>${p.amazon?'<span class="mini-market">a</span>':''}${p.flipkart?'<span class="mini-market flip">f</span>':''}${!p.amazon&&!p.flipkart?'—':''}</td><td><span class="status-pill">On display</span></td><td><div class="row-actions"><button data-edit="${escapeHTML(p.id)}">Edit</button><button data-delete="${escapeHTML(p.id)}">Delete</button></div></td></tr>`).join('');$('adminEmpty').classList.toggle('hidden',list.length!==0);}
function editProduct(id){editingId=id||null;$('productForm').reset();let p=products.find(x=>x.id===id);$('formTitle').textContent=p?'Edit product':'Add a product';if(p)for(let [key,value] of Object.entries(p)){let input=$('productForm').elements.namedItem(key);if(input){if(input.type==='checkbox')input.checked=Boolean(value);else input.value=value??'';}}selectedPhoto=null;showPhotoPreview(p?.image || '');$('formDialog').showModal();}

async function api(path, options={}) {
  let response;
  try { response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken,...options.headers}}); }
  catch { throw new Error('Could not reach the website server. Please try again.'); }
  const data=await response.json();
  if(!response.ok){if(response.status===401){csrfToken='';$('formDialog').close();$('adminDialog').close();if(!$('loginDialog').open)$('loginDialog').showModal();}throw new Error(data.error || 'Please try again.');}
  return data;
}
async function loadProducts(){products=(await api('/api/products')).products;if(!categories().includes(activeCategory))activeCategory='All finds';renderStore();renderAdmin();}
async function openAdmin(){try{const session=await api('/api/auth/session');if(session.authenticated){csrfToken=session.csrf;await loadProducts();$('adminDialog').showModal();}else{$('loginError').textContent='';$('loginDialog').showModal();}}catch(error){notify(error.message);}}
document.addEventListener('click',async e=>{
  let tab=e.target.closest('[data-category]');if(tab){activeCategory=tab.dataset.category;renderStore();}
  let card=e.target.closest('[data-open-product]');if(card)openProduct(card.dataset.openProduct);
  let edit=e.target.closest('[data-edit]');if(edit)editProduct(edit.dataset.edit);
  let del=e.target.closest('[data-delete]');
  if(del){let p=products.find(x=>x.id===del.dataset.delete);if(p&&confirm(`Remove “${p.name}” from the catalogue?`)){del.disabled=true;try{await api(`/api/products/${encodeURIComponent(p.id)}`,{method:'DELETE'});await loadProducts();notify('Product removed.');}catch(error){notify(error.message);}finally{del.disabled=false;}}}
  if(e.target.matches('[data-close]'))e.target.closest('dialog').close();
  if(e.target===$('productDialog')||e.target===$('formDialog'))e.target.close();
});
$('searchInput').addEventListener('input',renderStore);
$('adminSearch').addEventListener('input',renderAdmin);
$('adminOpen').addEventListener('click',openAdmin);
$('addProduct').addEventListener('click',()=>editProduct());
$('productForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  const data={name:f.get('name').trim(),category:f.get('category'),price:Number(f.get('price')),description:f.get('description').trim(),image:f.get('image').trim(),amazon:f.get('amazon').trim(),flipkart:f.get('flipkart').trim(),featured:f.has('featured')};
  $('saveProduct').disabled=true;
  try{if(selectedPhoto){const photo=await preparePhoto(selectedPhoto);data.image=(await api('/api/uploads',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:photo})).image;selectedPhoto=null;$('productForm').elements.image.value=data.image;}await api(editingId?`/api/products/${encodeURIComponent(editingId)}`:'/api/products',{method:editingId?'PUT':'POST',body:JSON.stringify(data)});await loadProducts();$('formDialog').close();notify(editingId?'Product updated.':'Product added to your catalogue.');}
  catch(error){notify(error.message);}finally{$('saveProduct').disabled=false;}
});
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();$('loginSubmit').disabled=true;$('loginError').textContent='';
  const form=e.currentTarget,f=new FormData(form);
  try{const session=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:f.get('email'),password:f.get('password')})});csrfToken=session.csrf;form.reset();await loadProducts();$('loginDialog').close();$('adminDialog').showModal();}
  catch(error){$('loginError').textContent=error.message;}finally{$('loginSubmit').disabled=false;}
});
$('adminLogout').addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});csrfToken='';$('adminDialog').close();notify('Signed out.');}catch(error){notify(error.message);}});
$('menuToggle').addEventListener('click',()=>document.querySelector('.main-nav').classList.toggle('open'));
$('searchToggle').addEventListener('click',()=>{document.querySelector('#collection').scrollIntoView({behavior:'smooth'});setTimeout(()=>$('searchInput').focus(),450);});
$('year').textContent=new Date().getFullYear();
loadProducts().catch(error=>{$('productCount').textContent='Catalogue unavailable';$('emptyState').classList.remove('hidden');$('emptyState').innerHTML='<h3>The catalogue could not load.</h3><p>Open the website through its server and refresh to try again.</p>';notify(error.message);});

function showPhotoPreview(url){
  if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl='';}
  $('photoPreview').classList.toggle('hidden',!url);
  if(url)$('photoPreviewImage').src=url;else $('photoPreviewImage').removeAttribute('src');
  $('photoHint').textContent=url?'This photo will appear in the catalogue.':'No photo? We’ll use a placeholder.';
}
$('productPhoto').addEventListener('change',()=>{
  const file=$('productPhoto').files[0];
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){$('productPhoto').value='';notify('Choose a JPEG, PNG or WebP photo smaller than 10 MB.');return;}
  selectedPhoto=file;showPhotoPreview('');photoPreviewUrl=URL.createObjectURL(file);$('photoPreviewImage').src=photoPreviewUrl;$('photoPreview').classList.remove('hidden');$('photoHint').textContent='Photo selected. Save the product to upload it.';
});
$('removePhoto').addEventListener('click',()=>{selectedPhoto=null;$('productPhoto').value='';$('productForm').elements.image.value='';showPhotoPreview('');});
async function preparePhoto(file){
  let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('This photo could not be opened. Please choose another image.');}
  try{
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f7f5f0';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));if(!blob)throw new Error('Photo could not be prepared.');return blob;
  }finally{bitmap.close();}
}
