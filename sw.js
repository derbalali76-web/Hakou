/* ذهب برو 730 — Service Worker: يعمل التطبيق دون اتصال بعد أول فتح */
const V='gp730-v24';
const SHELL=['./','index.html','portal.html','manifest.json','portal.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','portal-192.png','portal-512.png','portal-apple.png','firebase-config.js','cloud.js','lock.js','kiosk.js','back.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js','https://www.gstatic.com/firebasejs/10.12.5/firebase-database-compat.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('gp730-')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET')return;
  if(u.origin===location.origin){ // شبكة أولاً ثم الذاكرة: التحديثات تصل فور توفر الإنترنت
    e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match(/portal/.test(u.pathname)?'portal.html':'index.html'))));
  }else if(u.hostname==='www.gstatic.com'){ // مكتبات Firebase: من الذاكرة أولاً
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;})));
  }
});
