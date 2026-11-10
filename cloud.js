/* ذهب برو 730 — طبقة السحابة (Firebase Auth + Realtime Database)
   تعمل فقط في نسخة PWA حين يكون firebase-config.js مملوءاً. نسخة ويندوز المحلية لا تحمّل هذا الملف. */
(function(){
'use strict';
const CFG=window.GP_FIREBASE;
const G=window.GPCLOUD={enabled:false,active:false};
if(!CFG||!CFG.apiKey||!CFG.databaseURL||/YOUR_|ضع_/i.test(CFG.apiKey)||typeof firebase==='undefined')return;
G.enabled=true;
firebase.initializeApp(CFG);
const auth=firebase.auth(),db=firebase.database();
const MAIL='@gp730.app';
const LSK={uid:'gp_cloud_uid',dirty:'gp_cloud_dirty',rev:'gp_cloud_rev'};
const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}},del:k=>{try{localStorage.removeItem(k)}catch(e){}}};
let UID=null,EMAIL='',REV=null,SNAP=null,BUSY=false,AGAIN=false,TIMER=null,STATUS='idle',STALEBAR=false,CONNECTED=false;
const PSNAP={};

/* ---------- تحويل DB ⇄ مسارات نصية (كل سجلّ عقدة مستقلة: لا نرفع الملف كاملاً عند كل حفظ) ---------- */
const enc=s=>String(s).replace(/[.$#\[\]\/%]/g,c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0'));
const dec=s=>s.replace(/%([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)));
const CH=50;
const isRecs=a=>Array.isArray(a)&&a.length>0&&a.every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&typeof x.id==='string'&&x.id);
function pack(d){
  const m={};
  for(const k of Object.keys(d)){
    const v=d[k];if(v===undefined||k==='savedAt')continue;
    if(isRecs(v)){
      m['o/'+enc(k)]=JSON.stringify(v.map(x=>x.id));
      for(const x of v)m['r/'+enc(k)+'/k'+enc(x.id)]=JSON.stringify(x);
    }else if(Array.isArray(v)){
      const n=Math.max(1,Math.ceil(v.length/CH));
      for(let i=0;i<n;i++)m['a/'+enc(k)+'/c'+String(i).padStart(4,'0')]=JSON.stringify(v.slice(i*CH,(i+1)*CH));
    }else m['s/'+enc(k)]=JSON.stringify(v);
  }
  return m;
}
function flatten(dv){ // ما يعيده Firebase (شجرة) → نفس شكل pack
  const m={};if(!dv)return m;
  for(const k in (dv.o||{}))m['o/'+k]=dv.o[k];
  for(const k in (dv.r||{}))for(const id in dv.r[k])m['r/'+k+'/'+id]=dv.r[k][id];
  for(const k in (dv.a||{}))for(const c in dv.a[k])m['a/'+k+'/'+c]=dv.a[k][c];
  for(const k in (dv.s||{}))m['s/'+k]=dv.s[k];
  return m;
}
function unpack(m){
  const d={},recs={},arrs={};
  for(const p in m){const a=p.split('/');
    if(a[0]==='s')d[dec(a[1])]=JSON.parse(m[p]);
    else if(a[0]==='r'){(recs[a[1]]=recs[a[1]]||{})[a[2]]=JSON.parse(m[p]);}
    else if(a[0]==='a'){(arrs[a[1]]=arrs[a[1]]||[]).push([a[2],m[p]]);}
  }
  for(const p in m){const a=p.split('/');
    if(a[0]==='o'){const ids=JSON.parse(m[p]),R=recs[a[1]]||{},out=[],seen={};
      for(const id of ids){const r=R['k'+enc(id)];if(r){out.push(r);seen['k'+enc(id)]=1;}}
      for(const key in R)if(!seen[key])out.push(R[key]);
      d[dec(a[1])]=out;}}
  for(const k in arrs){arrs[k].sort((x,y)=>x[0]<y[0]?-1:1);let out=[];for(const [,s] of arrs[k])out=out.concat(JSON.parse(s));d[dec(k)]=out;}
  for(const k in recs){if(!(dec(k) in d))d[dec(k)]=Object.values(recs[k]);}
  return d;
}
G._pack=pack;G._unpack=unpack;G._flatten=flatten;

/* ---------- واجهة: دخول / أخطاء ---------- */
const AR={'auth/invalid-email':'البريد غير صحيح','auth/user-not-found':'لا يوجد حساب بهذا البريد','auth/wrong-password':'كلمة السر خاطئة','auth/invalid-credential':'البريد أو كلمة السر خاطئة','auth/invalid-login-credentials':'البريد أو كلمة السر خاطئة','auth/email-already-in-use':'هذا البريد/الاسم مستعمل مسبقاً','auth/weak-password':'كلمة السر ضعيفة (6 أحرف على الأقل)','auth/network-request-failed':'لا يوجد اتصال بالإنترنت','auth/too-many-requests':'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة','auth/missing-password':'أدخل كلمة السر','auth/operation-not-allowed':'تسجيل البريد/كلمة السر غير مفعّل في Firebase'};
const arErr=e=>AR[e&&e.code]||('خطأ: '+((e&&e.message)||e));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function loginUI(){
  return new Promise(res=>{
    const ov=document.createElement('div');ov.id='cloud-login';
    ov.style.cssText='position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:#0e1530;padding:18px;font-family:Cairo,Tahoma,sans-serif;overflow:auto';
    const signup=CFG.allowSignup!==false;
    ov.innerHTML=`<div style="width:100%;max-width:380px;background:#fff;border-radius:22px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.4)">
      <div style="text-align:center;font-weight:900;font-size:22px;color:#0e1428">ذهب برو <span style="color:#e39a10">730</span></div>
      <div style="text-align:center;font-size:12.5px;color:#8b92a9;font-weight:700;margin:4px 0 18px">سجّل الدخول إلى حساب محلّك</div>
      <input id="cl-mail" type="email" inputmode="email" autocomplete="username" placeholder="البريد الإلكتروني" style="width:100%;padding:13px;border-radius:12px;border:1.5px solid #e1e4ef;font-size:15px;direction:ltr;margin-bottom:10px;box-sizing:border-box">
      <input id="cl-pass" type="password" autocomplete="current-password" placeholder="كلمة السر" style="width:100%;padding:13px;border-radius:12px;border:1.5px solid #e1e4ef;font-size:15px;direction:ltr;margin-bottom:12px;box-sizing:border-box">
      <div id="cl-err" style="color:#e33f57;font-weight:800;font-size:12.5px;min-height:18px;margin-bottom:8px"></div>
      <button id="cl-in" style="width:100%;padding:14px;border-radius:13px;background:linear-gradient(135deg,#141c38,#243158);color:#fff;font-weight:800;font-size:16px;border:0;cursor:pointer">دخول</button>
      ${signup?'<button id="cl-up" style="width:100%;padding:12px;border-radius:13px;background:#fdf4d6;color:#b9820a;font-weight:800;font-size:14px;border:0;cursor:pointer;margin-top:10px">إنشاء حساب جديد</button>':''}
      <button id="cl-fg" style="width:100%;padding:10px;background:none;color:#8b92a9;font-weight:700;font-size:12.5px;border:0;cursor:pointer;margin-top:6px">نسيت كلمة السر؟</button></div>`;
    document.body.appendChild(ov);
    const $=id=>ov.querySelector('#'+id),err=m=>{$('cl-err').textContent=m||'';};
    const go=async(mk)=>{const m=$('cl-mail').value.trim(),p=$('cl-pass').value;if(!m||!p)return err('أدخل البريد وكلمة السر');err('… جارٍ');
      try{await mk(m,p);ov.remove();res();}catch(e){err(arErr(e));}};
    $('cl-in').onclick=()=>go((m,p)=>auth.signInWithEmailAndPassword(m,p));
    if($('cl-up'))$('cl-up').onclick=()=>go((m,p)=>auth.createUserWithEmailAndPassword(m,p));
    $('cl-pass').onkeydown=e=>{if(e.key==='Enter')$('cl-in').click();};
    $('cl-fg').onclick=async()=>{const m=$('cl-mail').value.trim();if(!m)return err('اكتب بريدك أولاً');try{await auth.sendPasswordResetEmail(m);err('أُرسل رابط إعادة التعيين إلى بريدك');}catch(e){err(arErr(e));}};
  });
}
function authReady(){return new Promise(res=>{const u=auth.onAuthStateChanged(x=>{u();res(x);});});}

/* ---------- المزامنة ---------- */
function setStatus(s){STATUS=s;const el=document.getElementById('cloud-chip');if(el)el.textContent=chipText();}
const chipText=()=>STATUS==='ok'?'☁️ محفوظ في السحابة':STATUS==='sync'?'☁️ جارٍ الحفظ…':STATUS==='off'?'⚠️ غير متصل — سيُرفع لاحقاً':STATUS==='stale'?'⛔ نسخة قديمة':'☁️';
db.ref('.info/connected').on('value',s=>{CONNECTED=!!s.val();if(CONNECTED&&G.active&&ls.get(LSK.dirty)==='1')G.push();});
async function fetchServer(){
  const s=await db.ref('shops/'+UID).once('value'),v=s.val();
  return {rev:v&&v.meta&&+v.meta.rev||0,flat:v?flatten(v.d):{},exists:!!v};
}
function adopt(flat,rev){ // اعتماد نسخة الخادم
  const d=unpack(flat);DB=normDB(Object.assign(seed(),d));
  REV=rev;SNAP=flat;lsSave();ls.del(LSK.dirty);ls.set(LSK.rev,String(rev));
  try{renderHome();renderDebts();renderArchive();}catch(e){}
}
function stash(why){try{localStorage.setItem(KEY+'_stale_'+Date.now(),JSON.stringify(DB));}catch(e){}return why;}
async function resync(){ // بعد رفض أو انقطاع: نحدّد هل غيّر أحدٌ البيانات
  const sv=await fetchServer(),mine=pack(DB),same=(a,b)=>{const ka=Object.keys(a),kb=Object.keys(b);if(ka.length!==kb.length)return false;for(const k of ka)if(a[k]!==b[k])return false;return true;};
  if(!SNAP&&sv.rev===(+ls.get(LSK.rev)||0)){SNAP=sv.flat;REV=sv.rev;return 'retry';} // بدأنا دون اتصال والخادم لم يتغيّر
  if(SNAP&&same(sv.flat,SNAP)){REV=sv.rev;return 'retry';}      // لم يتغيّر شيء على الخادم → نعيد رفع تعديلاتي
  if(same(sv.flat,mine)){SNAP=sv.flat;REV=sv.rev;ls.del(LSK.dirty);return 'same';} // وصلت فعلاً
  stash();adopt(sv.flat,sv.rev);setStatus('stale');
  setTimeout(()=>alert('⛔ بياناتك على السحابة تغيّرت من جهاز أو نافذة أخرى.\n\nحمّلتُ لك النسخة الأحدث حمايةً لها، وحُفظت نسختك المحلية جانباً (يمكن تصديرها).\nراجع آخر عملياتك وأعد إدخال ما ينقص.'),200);
  return 'adopted';
}
G.push=function(){clearTimeout(TIMER);TIMER=setTimeout(doPush,700);ls.set(LSK.dirty,'1');setStatus(CONNECTED?'sync':'off');};
async function doPush(){
  if(!G.active)return;if(BUSY){AGAIN=true;return;}
  if(!CONNECTED){setStatus('off');return;}
  BUSY=true;
  try{
    if(REV===null||!SNAP){const r=await resync();if(r==='adopted'||r==='same'){return;}}
    const cur=pack(DB),upd={};let n=0;
    for(const p in cur)if(SNAP[p]!==cur[p]){upd['d/'+p]=cur[p];n++;}
    for(const p in SNAP)if(!(p in cur)){upd['d/'+p]=null;n++;}
    if(!n){ls.del(LSK.dirty);setStatus('ok');return;}
    upd['meta/rev']=REV+1;upd['meta/savedAt']=Date.now();
    const to=new Promise((_,rej)=>setTimeout(()=>rej({code:'gp/timeout'}),30000));
    await Promise.race([db.ref('shops/'+UID).update(upd),to]);
    REV+=1;SNAP=cur;ls.del(LSK.dirty);ls.set(LSK.rev,String(REV));setStatus('ok');
    portalSync();
  }catch(e){
    if(e&&(e.code==='PERMISSION_DENIED'||/permission_denied/i.test(e.message||''))){
      try{const r=await resync();if(r==='retry')AGAIN=true;}catch(_){setStatus('off');}
    }else{SNAP=SNAP;REV=(e&&e.code==='gp/timeout')?null:REV;setStatus('off');ls.set(LSK.dirty,'1');}
  }finally{BUSY=false;if(AGAIN){AGAIN=false;G.push();}}
}
G._doPush=doPush;
function watchRev(){
  db.ref('shops/'+UID+'/meta/rev').on('value',s=>{const v=+s.val()||0;
    if(REV===null||BUSY||ls.get(LSK.dirty)==='1'||v<=REV||document.getElementById('stale-bar'))return;
    const b=document.createElement('div');b.id='stale-bar';
    b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#1a6ca8;color:#fff;padding:12px;text-align:center;font-weight:700;font-size:15px;cursor:pointer';
    b.textContent='🔄 تم تحديث البيانات من جهاز آخر — اضغط لتحميل الجديد';
    b.onclick=async()=>{b.remove();const sv=await fetchServer();adopt(sv.flat,sv.rev);setStatus('ok');};
    document.body.appendChild(b);});
}

/* ---------- الدخول والتحميل الأولي ---------- */
G.init=async function(){
  let u=await authReady();
  if(!u){await loginUI();u=auth.currentUser;}
  UID=u.uid;EMAIL=u.email||'';
  if(ls.get(LSK.uid)&&ls.get(LSK.uid)!==UID){try{localStorage.removeItem(KEY);}catch(e){} DB=normDB(seed());} // حساب آخر على نفس الجهاز: لا نخلط البيانات
  ls.set(LSK.uid,UID);
  const wasDirty=ls.get(LSK.dirty)==='1';
  G.active=true;
  const ov=document.getElementById('store-ov');if(ov)ov.textContent='… جارٍ تحميل بياناتك من السحابة';
  try{
    await new Promise(r=>{if(CONNECTED)return r();const t=setTimeout(r,6000);const h=db.ref('.info/connected').on('value',s=>{if(s.val()){clearTimeout(t);db.ref('.info/connected').off('value',h);r();}});});
    if(!CONNECTED)throw {code:'gp/offline'};
    const sv=await fetchServer();
    if(wasDirty&&DB&&(DB.customers.length||DB.invoices.length)){ // عدّلتَ دون اتصال سابقاً
      if(sv.rev===(+ls.get(LSK.rev)||0)){SNAP=sv.flat;REV=sv.rev;G.push();} // الخادم لم يتغيّر → نرفع تعديلاتي
      else{stash();adopt(sv.flat,sv.rev);setTimeout(()=>alert('⚠️ كانت لديك تعديلات دون اتصال لكن بياناتك على السحابة تغيّرت في الأثناء.\nحمّلتُ النسخة الأحدث وحفظتُ نسختك المحلية جانباً.'),300);}
    }else if(sv.exists){adopt(sv.flat,sv.rev);}
    else{ // أول مرة على السحابة
      REV=0;SNAP={};
      const local=DB&&(DB.customers.length||DB.invoices.length);
      if(local&&confirm('هذا حساب جديد على السحابة.\nهل ترفع البيانات الموجودة على هذا الجهاز إلى حسابك؟\n\nموافق = رفعها · إلغاء = البدء بحساب فارغ'))G.push();
      else{DB=normDB(seed());lsSave();G.push();}
    }
  }catch(e){ // بلا اتصال: نعمل على النسخة المحلية ونرفع لاحقاً
    SNAP=null;REV=+ls.get(LSK.rev)||null;setStatus('off');
    if(e&&e.code==='PERMISSION_DENIED')setTimeout(()=>alert('⛔ قاعدة البيانات رفضت القراءة.\nتأكد من نشر ملف database.rules.json في Firebase (Realtime Database ← Rules).'),300);
    if(!(DB&&(DB.customers.length||DB.invoices.length)))toast('لا يوجد اتصال — افتح التطبيق مرة واحدة متصلاً بالإنترنت');
  }
  watchRev();
  if(window.photosBlock)window.photosBlock=function(){return '';}; // الصور تحتاج خادم ويندوز المحلي
  if(window.renderInvPhotos)window.renderInvPhotos=function(){};
  const st=document.createElement('style');st.textContent='.phbox,.phbtn{display:none!important}';document.head.appendChild(st);
  const chip=document.createElement('div');chip.id='cloud-chip';chip.style.cssText='position:fixed;bottom:4px;left:8px;z-index:50;font:700 10.5px Cairo,Tahoma,sans-serif;color:#8b92a9;pointer-events:none';chip.textContent=chipText();document.body.appendChild(chip);
  setStatus(STATUS==='idle'?'ok':STATUS);
};
G.settingsBlock=function(){
  return `<div style="background:linear-gradient(135deg,#e9f9f1,#d4f2e3);border:1px solid #a8e2c4;border-radius:var(--r-md);padding:15px 16px;margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:10px"><span style="font-size:22px">☁️</span><div style="font-weight:900;font-size:14.5px;color:#0d7a48">بياناتك محفوظة في السحابة</div></div>
    <div style="font-size:12px;color:#2e7a57;font-weight:700;line-height:1.9;margin-top:8px;direction:ltr;text-align:right;word-break:break-all">${esc(EMAIL)}</div>
    <div style="font-size:11.5px;color:#2e7a57;font-weight:700;line-height:1.8">${esc(chipText())}</div>
    ${window.GPLOCK?`<div style="display:flex;gap:8px;margin-top:10px"><button onclick="closeModal();GPLOCK.lock()" style="flex:1;padding:11px;border-radius:11px;background:#fff;border:1.5px solid #a8e2c4;color:#0d7a48;font-weight:800;font-size:13px">🧭 قفل الآن</button><button onclick="closeModal();GPLOCK.change()" style="flex:1;padding:11px;border-radius:11px;background:#fff;border:1.5px solid #a8e2c4;color:#0d7a48;font-weight:800;font-size:13px">تغيير الاتجاه السري</button></div>`:''}
    <button onclick="GPCLOUD.logout()" style="margin-top:10px;width:100%;padding:11px;border-radius:11px;background:#fff;border:1.5px solid #a8e2c4;color:#0d7a48;font-weight:800;font-size:13.5px">تسجيل الخروج</button></div>`;
};
G.logout=async function(){
  if(ls.get(LSK.dirty)==='1'&&!confirm('توجد تعديلات لم تُرفع بعد إلى السحابة. الخروج الآن قد يُضيعها.\nمتابعة؟'))return;
  try{await auth.signOut();}catch(e){}
  try{localStorage.removeItem(KEY);}catch(e){}ls.del(LSK.uid);ls.del(LSK.dirty);location.reload();
};

/* ---------- بوابة الزبون ---------- */
function portalSummary(c){
  const cid=c.id,bal=custBalance(cid),ev=[];
  DB.invoices.filter(i=>i.customerId===cid).forEach(i=>ev.push({k:'inv',d:i.date||0,no:i.no,type:i.type,settled:!!i.settled,money:Math.round(i.money||0),g:+(+i.total730||0).toFixed(2),rows:(i.rows||[]).map(r=>[+r.mizan||0,+r.qoubal||0,+(+r.w730||0).toFixed(2),Math.round(+r.price||0),Math.round(+r.total||0)])}));
  DB.cash.filter(x=>x.customerId===cid).forEach(x=>{
    if(x.note==='تسوية'&&x.cur!=='730')return;
    ev.push({k:'cash',d:x.date||0,kind:x.kind,cur:x.cur,amt:x.cur==='730'?+(+x.amount||0).toFixed(2):Math.round(+x.amount||0),note:x.note||'',sno:x.sNo||0,st:x.sType||'',m:x.mizan||0,q:x.qoubal||0,nb:x.noBal?1:0});});
  DB.openings.filter(o=>o.customerId===cid).forEach(o=>ev.push({k:'open',d:o.date||0,adj:o.note==='تعديل'?1:0,din:Math.round(+o.dinar||0),g:+(+o.g730||0).toFixed(2)}));
  ev.sort((a,b)=>b.d-a.d);
  return JSON.stringify({shop:DB.shopName||'',name:c.name,bal:{d:Math.round(bal.dinar),g:+bal.g730.toFixed(2)},ev:ev.slice(0,400),t:Date.now()});
}
G._portalSummary=portalSummary;
function portalSync(){
  (DB.customers||[]).forEach(c=>{if(!c.portal||!c.portal.uid)return;
    const s=portalSummary(c),core=s.replace(/,"t":\d+\}$/,'}');
    if(PSNAP[c.portal.uid]===core)return;
    db.ref('portal/'+c.portal.uid).set({v:s,t:Date.now()}).then(()=>{PSNAP[c.portal.uid]=core;}).catch(()=>{});});
}
G.portalSheet=function(cid){
  const c=DB.customers.find(x=>x.id===cid);if(!c)return;
  const url=location.origin+location.pathname.replace(/[^\/]*$/,'')+'portal.html';
  const shop=`<label style="display:block;font-size:11.5px;font-weight:800;color:var(--muted);margin:0 2px 6px">اسم محلّك (يراه الزبون)</label>
    <input id="pt-shop" value="${esc(DB.shopName||'')}" style="width:100%;padding:12px;border-radius:11px;border:1.5px solid var(--line);font-size:14px;font-weight:700;margin-bottom:12px;box-sizing:border-box">`;
  if(c.portal&&c.portal.uid){
    sheet('بوابة الزبون — '+esc(c.name),`${shop}
      <div style="background:var(--green-soft);border-radius:14px;padding:14px;margin-bottom:12px;font-weight:700;font-size:13px;line-height:2">
        ✅ الحساب مفعّل<br>رقم الدخول: <b dir="ltr">${esc(c.portal.user)}</b><br>رابط الدخول للزبون:<br><b dir="ltr" style="word-break:break-all;user-select:text">${esc(url)}</b></div>
      <button class="btn primary" style="margin-bottom:10px" onclick="GPCLOUD.portalRefresh('${cid}')">↻ تحديث ما يراه الزبون الآن</button>
      <button class="btn ghost" style="margin-bottom:10px" onclick="GPCLOUD.portalRevoke('${cid}')">🚫 إلغاء وصول الزبون</button>
      <div style="font-size:11.5px;color:var(--muted);font-weight:700;line-height:1.8">يرى الزبون رصيده وفواتيره وحركاته فقط. ما يُدخَل في التطبيق يظهر له تلقائياً. لتغيير كلمة سره: ألغِ الوصول ثم أنشئ حساباً جديداً برقم جديد أو كلمة سر جديدة.</div>`);
  }else{
    sheet('بوابة الزبون — '+esc(c.name),`${shop}
      <div style="font-size:12.5px;color:var(--muted);font-weight:700;line-height:1.9;margin-bottom:12px">أدخل رقم هاتف الزبون وكلمة سر ليرى رصيده وفواتيره من هاتفه. لن يرى أي زبون آخر ولا بياناتك.</div>
      <label style="display:block;font-size:11.5px;font-weight:800;color:var(--muted);margin:0 2px 6px">رقم هاتف الزبون (هو اسم دخوله)</label>
      <input id="pt-user" autocomplete="off" inputmode="tel" value="${esc(c.phone||'')}" placeholder="مثال: 0550123456" style="width:100%;padding:12px;border-radius:11px;border:1.5px solid var(--line);font-size:14px;font-weight:700;direction:ltr;margin-bottom:10px;box-sizing:border-box">
      <label style="display:block;font-size:11.5px;font-weight:800;color:var(--muted);margin:0 2px 6px">كلمة السر (6 أحرف على الأقل)</label>
      <input id="pt-pass" autocomplete="off" style="width:100%;padding:12px;border-radius:11px;border:1.5px solid var(--line);font-size:14px;font-weight:700;direction:ltr;margin-bottom:12px;box-sizing:border-box">
      <div id="pt-err" style="color:var(--red);font-weight:800;font-size:12.5px;min-height:18px;margin-bottom:8px"></div>
      <button class="btn primary" onclick="GPCLOUD.portalCreate('${cid}')">إنشاء حساب الزبون</button>`);
  }
};
function saveShopName(){const el=document.getElementById('pt-shop');if(el&&el.value.trim()!==(DB.shopName||'')){DB.shopName=el.value.trim();return true;}return false;}
function normUser(raw){raw=String(raw||'').trim().toLowerCase();
  if(/[a-z]/.test(raw))return /^[a-z0-9._-]{3,30}$/.test(raw)?raw:null;
  let d=raw.replace(/[٠-٩]/g,x=>'٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace(/\D/g,'');
  if(d.startsWith('00213'))d='0'+d.slice(5);else if(d.startsWith('213')&&d.length>=12)d='0'+d.slice(3);
  return /^\d{8,15}$/.test(d)?d:null;}
G.normUser=normUser;
// ينشئ حساب بوابة لزبون: يعيد '' عند النجاح أو نص الخطأ
async function portalMake(c,userRaw,pass){
  const user=normUser(userRaw);
  if(!user)return 'رقم الهاتف غير صحيح (8 أرقام على الأقل) أو اسم مستخدم إنجليزي 3–30 حرفاً';
  if(String(pass||'').length<6)return 'كلمة السر 6 أحرف على الأقل';
  let sec=null;
  try{
    sec=firebase.initializeApp(CFG,'sec'+Date.now());
    const cred=await sec.auth().createUserWithEmailAndPassword(user+MAIL,pass);
    const cuid=cred.user.uid;await sec.auth().signOut();
    await db.ref('portalOwner/'+cuid).set(UID);
    saveShopName();
    c.portal={uid:cuid,user,at:Date.now()};if(/^\d+$/.test(user)&&!c.phone)c.phone=user;
    logAct('زبائن','إنشاء حساب بوابة للزبون «'+c.name+'» — '+user);save();
    portalSync();return '';
  }catch(e){return e&&e.code==='auth/email-already-in-use'?'هذا الرقم/الاسم مسجّل من قبل — استعمل غيره':arErr(e);}
  finally{try{sec&&sec.delete();}catch(_){}}
}
G.portalMake=portalMake;
G.portalCreate=async function(cid){
  const c=DB.customers.find(x=>x.id===cid),err=m=>{const e=document.getElementById('pt-err');if(e)e.textContent=m||'';};
  err('… جارٍ الإنشاء');
  const m=await portalMake(c,document.getElementById('pt-user').value,document.getElementById('pt-pass').value);
  if(m)return err(m);toast('تم إنشاء حساب الزبون');G.portalSheet(cid);
};
G.portalRefresh=function(cid){if(saveShopName())save();delete PSNAP[(DB.customers.find(x=>x.id===cid).portal||{}).uid];portalSync();toast('تم التحديث');};
G.portalRevoke=async function(cid){
  const c=DB.customers.find(x=>x.id===cid);if(!c||!c.portal)return;
  if(!confirm('إلغاء وصول «'+c.name+'»؟\nلن يستطيع رؤية أي شيء بعد الآن.'))return;
  try{await db.ref('portal/'+c.portal.uid).remove();}catch(e){return toast('تعذّر الإلغاء — تأكد من الاتصال');}
  delete PSNAP[c.portal.uid];logAct('زبائن','إلغاء وصول الزبون «'+c.name+'» للبوابة');delete c.portal;save();toast('أُلغي الوصول');closeModal();
};
})();
