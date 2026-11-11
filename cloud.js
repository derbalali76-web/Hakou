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
const LSK={uid:'gp_cloud_uid',dirty:'gp_cloud_dirty',rev:'gp_cloud_rev',tomb:'gp_cloud_tomb',known:'gp_cloud_known'};
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
    const signup=false; // يظهر فقط بعد التأكد أن التطبيق بلا مالك (أدناه)
    ov.innerHTML=`<div style="width:100%;max-width:380px;background:#fff;border-radius:22px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.4)">
      <div style="text-align:center;font-weight:900;font-size:22px;color:#0e1428">ذهب برو <span style="color:#e39a10">730</span></div>
      <div style="text-align:center;font-size:12.5px;color:#8b92a9;font-weight:700;margin:4px 0 18px">سجّل الدخول إلى حساب محلّك</div>
      <input id="cl-mail" type="email" inputmode="email" autocomplete="username" placeholder="البريد الإلكتروني" style="width:100%;padding:13px;border-radius:12px;border:1.5px solid #e1e4ef;font-size:15px;direction:ltr;margin-bottom:10px;box-sizing:border-box">
      <input id="cl-pass" type="password" autocomplete="current-password" placeholder="كلمة السر" style="width:100%;padding:13px;border-radius:12px;border:1.5px solid #e1e4ef;font-size:15px;direction:ltr;margin-bottom:12px;box-sizing:border-box">
      <div id="cl-err" style="color:#e33f57;font-weight:800;font-size:12.5px;min-height:18px;margin-bottom:8px"></div>
      <button id="cl-in" style="width:100%;padding:14px;border-radius:13px;background:linear-gradient(135deg,#141c38,#243158);color:#fff;font-weight:800;font-size:16px;border:0;cursor:pointer">دخول</button>
      <button id="cl-up" style="display:none;width:100%;padding:12px;border-radius:13px;background:#fdf4d6;color:#b9820a;font-weight:800;font-size:14px;border:0;cursor:pointer;margin-top:10px">إنشاء حساب المحل (أول مرة فقط)</button>
      <button id="cl-fg" style="width:100%;padding:10px;background:none;color:#8b92a9;font-weight:700;font-size:12.5px;border:0;cursor:pointer;margin-top:6px">نسيت كلمة السر؟</button></div>`;
    document.body.appendChild(ov);
    const $=id=>ov.querySelector('#'+id),err=m=>{$('cl-err').textContent=m||'';};
    const go=async(mk)=>{const m=$('cl-mail').value.trim(),p=$('cl-pass').value;if(!m||!p)return err('أدخل البريد وكلمة السر');err('… جارٍ');
      try{await mk(m,p);ov.remove();res();}catch(e){err(arErr(e));}};
    $('cl-in').onclick=()=>go((m,p)=>auth.signInWithEmailAndPassword(m,p));
    $('cl-up').onclick=()=>go((m,p)=>auth.createUserWithEmailAndPassword(m,p));
    /* التطبيق لمحل واحد: زر إنشاء الحساب يظهر فقط إن لم يُسجَّل المالك بعد */
    if(CFG.allowSignup!==false)db.ref('owner').once('value').then(s=>{if(!s.val())$('cl-up').style.display='block';}).catch(()=>{});
    $('cl-pass').onkeydown=e=>{if(e.key==='Enter')$('cl-in').click();};
    $('cl-fg').onclick=async()=>{const m=$('cl-mail').value.trim();if(!m)return err('اكتب بريدك أولاً');try{await auth.sendPasswordResetEmail(m);err('أُرسل رابط إعادة التعيين إلى بريدك');}catch(e){err(arErr(e));}};
  });
}
/* ===== محل واحد فقط: أول حساب يدخل يصبح «المالك» ولا يتغيّر (القواعد تمنع غيره من بيانات المحل) ===== */
const OWNK='gp_cloud_owner';
async function ensureOwner(uid){
  const cached=ls.get(OWNK);
  if(!CONNECTED)await new Promise(r=>{const t=setTimeout(r,6000);const h=db.ref('.info/connected').on('value',x=>{if(x.val()){clearTimeout(t);db.ref('.info/connected').off('value',h);r();}});});
  if(!CONNECTED)return cached&&cached!==uid?'blocked':'unknown';
  try{
    let o=(await db.ref('owner').once('value')).val();
    if(!o){ // أول مرة: نسجّل هذا الحساب مالكاً (مرة واحدة فقط)
      try{const r=await db.ref('owner').transaction(cur=>cur?undefined:uid);o=r.committed?uid:(r.snapshot&&r.snapshot.val());}
      catch(e){o=(await db.ref('owner').once('value')).val();}
    }
    if(o)ls.set(OWNK,o);
    return o===uid?'ok':(o?'blocked':'unknown');
  }catch(e){return cached&&cached!==uid?'blocked':'unknown';}
}
function blockedUI(email){
  const ov=document.createElement('div');ov.id='cloud-blocked';
  ov.style.cssText='position:fixed;inset:0;z-index:100001;display:grid;place-items:center;background:#0e1530;padding:18px;font-family:Cairo,Tahoma,sans-serif';
  ov.innerHTML=`<div style="width:100%;max-width:380px;background:#fff;border-radius:22px;padding:24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.4)">
    <div style="font-size:40px">⛔</div>
    <div style="font-weight:900;font-size:18px;color:#0e1428;margin:6px 0 8px">هذا التطبيق مسجَّل لمحل واحد</div>
    <div style="font-size:13px;color:#59607a;font-weight:700;line-height:1.9">الحساب <b dir="ltr">${esc(email||'')}</b> ليس حساب المحل.<br>لا يمكن استعمال حساب جديد هنا.<br>إن كنت زبوناً فادخل من بوابة الزبائن.</div>
    <button id="cb-out" style="width:100%;margin-top:16px;padding:13px;border-radius:13px;background:linear-gradient(135deg,#141c38,#243158);color:#fff;font-weight:800;font-size:15px;border:0;cursor:pointer">تسجيل الخروج</button></div>`;
  document.body.appendChild(ov);
  ov.querySelector('#cb-out').onclick=()=>auth.signOut().then(()=>location.reload());
}
G._ensureOwner=ensureOwner;
function authReady(){return new Promise(res=>{const u=auth.onAuthStateChanged(x=>{u();res(x);});});}

/* ---------- المزامنة ---------- */
function setStatus(s){STATUS=s;const el=document.getElementById('cloud-chip');if(el)el.textContent=chipText();updDot();}
/* نقطة الحالة أعلى الشاشة (كحانوت يسين): 🟢 متصل وكل شيء مرفوع · 🟡 عمليات لم تُرفع بعد · 🔴 لا يوجد إنترنت */
function pendingCount(){let n=0;try{n=getOutbox().length;}catch(e){}if(ls.get(LSK.dirty)==='1')n=Math.max(n,1);return n;}
function dotState(){if(!CONNECTED)return 'red';return pendingCount()?'yellow':'green';}
function updDot(){const d=document.getElementById('net-dot');if(!d)return;const st=dotState(),p=pendingCount();
  const C={green:['#19c37d','rgba(25,195,125,.55)','متصل — كل العمليات مرفوعة'],yellow:['#f5b700','rgba(245,183,0,.6)','متصل — توجد عمليات لم تُرفع بعد'],red:['#ef3b4f','rgba(239,59,79,.6)','لا يوجد إنترنت'+(p?' — توجد عمليات ستُرفع عند الاتصال':'')]}[st];
  d.style.background=C[0];d.style.boxShadow='0 0 0 3px rgba(255,255,255,.08),0 0 10px 2px '+C[1];d.title=C[2];d.dataset.st=st;
  d.style.animation=st==='yellow'?'gpdot 1s ease-in-out infinite':'none';
  const b=d.firstChild;if(b){b.textContent=(st==='red'&&p)?'!':'';}}
G._dotState=dotState;
const chipText=()=>STATUS==='ok'?'☁️ محفوظ في السحابة':STATUS==='sync'?'☁️ جارٍ الحفظ…':STATUS==='off'?'⚠️ غير متصل — سيُرفع لاحقاً':STATUS==='stale'?'⛔ نسخة قديمة':'☁️';
db.ref('.info/connected').on('value',s=>{CONNECTED=!!s.val();updDot();if(CONNECTED&&G.active&&SNAP===null&&ls.get(LSK.dirty)!=='1')setTimeout(()=>initialSync(false),300);if(CONNECTED&&G.active&&ls.get(LSK.dirty)==='1')G.push();});
/* ===== مزامنة لكل سجلّ على حدة + شواهد حذف صريحة (كتطبيق الخروج) =====
   • كل فاتورة/عملية/زبون عقدة مستقلة؛ جهازان يُدخلان أشياء مختلفة → تبقى كلّها، بلا رفض ولا إعادة إدخال.
   • الحذف بشاهد صريح في عقدة del؛ لا يُحذف محلياً إلا ما له شاهد — لا حذف بالاعتماد على التوقيت إطلاقاً.
   • عند تعديل نفس السجلّ من جهازين وهما متصلان: الأحدث (_u) يفوز. */
const TOMB='k';
const noU=o=>{if(o==null)return o;const t=(typeof o==='string'?JSON.parse(o):o),{_u,...r}=t;return JSON.stringify(r);};
const hasIds=a=>Array.isArray(a)&&a.some(x=>x&&typeof x==='object'&&typeof x.id==='string'&&x.id);
const allIds=a=>Array.isArray(a)&&a.every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&typeof x.id==='string'&&x.id);
function fnv(t){let h=0x811c9dc5;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(36);}
/* سجلّات قديمة بلا id داخل مجموعة فيها ids (مثل الأرصدة الافتتاحية): نعطيها id ثابتاً من محتواها
   — يُحسب بنفس الطريقة على كل جهاز فلا تتكرّر ولا تضيع */
function assignIds(d){if(!d)return d;
  for(const k of Object.keys(d)){const a=d[k];if(!Array.isArray(a)||!a.length||!hasIds(a))continue;
    const seen={};
    for(const x of a){if(!x||typeof x!=='object'||Array.isArray(x)||(typeof x.id==='string'&&x.id))continue;
      const b='z'+fnv(k+'|'+JSON.stringify(x)),n=seen[b]=(seen[b]||0)+1;x.id=b+(n>1?'_'+n:'');}}
  return d;}
G._assignIds=assignIds;
function stash(){try{localStorage.setItem(KEY+'_stale_'+Date.now(),JSON.stringify(DB));}catch(e){}}
/* توفير التنزيل: المستمع اللحظي يحمل نسخة السحابة الحيّة (Firebase يرسل له التغييرات فقط بعد أول تحميل)،
   فنقرأ منها بدل تنزيل البيانات كاملة مرة أخرى عند كل مزامنة */
let WATCHING=false,LD=null,LX=null,HD=false,HX=false;
async function pull(){
  if(WATCHING){const t0=Date.now();while(!(HD&&HX)&&Date.now()-t0<20000)await sleep(150);
    if(HD&&HX)return {flat:flatten(LD),del:LX||{},exists:LD!=null};}
  const [ds,xs]=await Promise.all([db.ref('shops/'+UID+'/d').once('value'),db.ref('shops/'+UID+'/del').once('value')]);
  return {flat:flatten(ds.val()),del:xs.val()||{},exists:ds.val()!=null};
}
/* ===== صندوق انتظار الحذف (مثل outbox في حانوت يسين) =====
   عند كل حفظ — ولو بلا إنترنت — نقارن السجلّات الموجودة بما كان موجوداً قبلها؛ كل ما اختفى يُسجَّل «شاهد حذف» محلياً
   ويبقى في الصندوق حتى يُرفع. فلا تعود عملية حُذفت دون اتصال. */
let KNOWN=null;
const loadJ=(k,d)=>{try{const v=JSON.parse(ls.get(k));return v==null?d:v;}catch(e){return d;}};
function idsOf(d){const o={};if(!d)return o;for(const k of Object.keys(d))if(allIds(d[k]))o[k]=d[k].map(x=>x.id);return o;}
function setKnown(){KNOWN=idsOf(DB);ls.set(LSK.known,JSON.stringify(KNOWN));}
const getOutbox=()=>loadJ(LSK.tomb,[]);
function markDeletes(){
  if(!DB)return;assignIds(DB);
  if(!KNOWN){KNOWN=loadJ(LSK.known,null);if(!KNOWN){setKnown();return;}}
  const cur=idsOf(DB),ob=getOutbox(),now=Date.now();let ch=false;
  for(const k in KNOWN){const s=new Set(cur[k]||[]);
    for(const id of KNOWN[k])if(!s.has(id)){ob.push({k,id,t:now});ch=true;}}
  if(ch)ls.set(LSK.tomb,JSON.stringify(ob));
  KNOWN=cur;ls.set(LSK.known,JSON.stringify(cur));
}
G._outbox=getOutbox;
/* يدمج بيانات السحابة في DB. localWins: عند عودة الاتصال، تفوز نسختي المحلية غير المرفوعة. يعيد true إن بقي ما يُرفع */
function mergeInto(rflat,del,localWins){
  assignIds(DB);
  const LT={};getOutbox().forEach(e=>{const m=LT[e.k]=LT[e.k]||{};m[e.id]=Math.max(m[e.id]||0,+e.t||0);}); // حذفي المحلي غير المرفوع
  const rDB=assignIds(unpack(rflat||{})),keys=new Set([...Object.keys(DB||{}),...Object.keys(rDB)]);
  const out=seed();let needPush=false;const dirty=ls.get(LSK.dirty)==='1';
  for(const k of keys){
    const L=DB?DB[k]:undefined,R=rDB[k];
    const emp=x=>!Array.isArray(x)||!x.length;
    if((allIds(L)||emp(L))&&(allIds(R)||emp(R))&&!(emp(L)&&emp(R))&&(hasIds(L)||hasIds(R))){ // مجموعة سجلّات كلّها بـ id
      const dm=(del&&del[enc(k)])||{};
      const Lm=new Map(),Rm=new Map();
      (Array.isArray(L)?L:[]).forEach(x=>{if(x&&x.id)Lm.set(x.id,x);});
      (Array.isArray(R)?R:[]).forEach(x=>{if(x&&x.id)Rm.set(x.id,x);});
      const res=new Map();
      for(const id of new Set([...Lm.keys(),...Rm.keys()])){
        const l=Lm.get(id),r=Rm.get(id),tomb=Math.max(+((dm[TOMB+enc(id)])||0),l?0:+(((LT[k]||{})[id])||0));
        if(l&&r){
          const chosen=localWins?l:((+(r._u||0)>=+(l._u||0))?r:l);
          if(tomb&&tomb>=(+(chosen._u||0))&&!localWins)continue;   // شاهد حذف أحدث → محذوف
          res.set(id,chosen);
          if(chosen===l&&noU(l)!==noU(r))needPush=true;      // تعديلي يفوز → ارفع
        }else if(l&&!r){
          if(tomb&&tomb>=(+(l._u||0)))continue;                    // شاهد حذف من جهاز آخر → أسقطه
          res.set(id,l);needPush=true;                       // عندي فقط وغير محذوف → احتفظ وارفع (لا فقد)
        }else{                                               // على السحابة فقط
          if(tomb&&tomb>=(+(r._u||0)))continue;                    // شاهد حذف → أسقطه
          res.set(id,r);                                     // إضافة جديدة من جهاز آخر
        }
      }
      out[k]=[...res.values()];
    }else if(Array.isArray(L)||Array.isArray(R)){   // سجلّ بلا id (actLog…) → اتحاد بلا فقد
      const seen=new Set(),u=[];
      (Array.isArray(R)?R:[]).concat(Array.isArray(L)?L:[]).forEach(x=>{const s=JSON.stringify(x);if(!seen.has(s)){seen.add(s);u.push(x);}});
      u.sort((a,b)=>((a&&(a.at||a.date))||0)-((b&&(b.at||b.date))||0));
      out[k]=u;if(JSON.stringify(u)!==JSON.stringify(Array.isArray(R)?R:[]))needPush=true;
    }else{                                          // قيمة مفردة
      const lv=DB?DB[k]:undefined,rv=rDB[k];
      if(k==='counter'||k==='sCounter')out[k]=Math.max(+lv||0,+rv||0,+out[k]||0);
      else if(rv===undefined)out[k]=lv;
      else if((localWins||dirty)&&lv!==undefined&&JSON.stringify(lv)!==JSON.stringify(rv)){out[k]=lv;needPush=true;}
      else out[k]=rv;
    }
  }
  DB=normDB(out);SNAP=Object.assign({},rflat||{});lsSave();setKnown();
  if(!needPush){ // اختلاف في الصيغة (بيانات قديمة) أو سجلّ ناقص على السحابة → نرفع؛ الترتيب وحده لا يكفي (تفادياً للتكرار)
    const cur=pack(DB);
    for(const p in cur)if(p[0]!=='o'&&SNAP[p]!==cur[p]){needPush=true;break;}
    if(!needPush)for(const p in SNAP)if(p[0]!=='o'&&!(p in cur)){needPush=true;break;}}
  try{renderHome&&renderHome();renderDebts&&renderDebts();renderArchive&&renderArchive();}catch(e){}
  return needPush;
}
G._mergeInto=mergeInto;
G.push=function(){try{markDeletes();}catch(e){}clearTimeout(TIMER);TIMER=setTimeout(doPush,700);ls.set(LSK.dirty,'1');setStatus(CONNECTED?'sync':'off');};
async function doPush(){
  if(!G.active)return;if(BUSY){AGAIN=true;return;}
  if(!CONNECTED){setStatus('off');return;}
  BUSY=true;
  try{
    if(SNAP===null){ // بدأنا دون اتصال: ادمج أولاً (تعديلاتي تفوز) حتى لا نعدّ إضافات الأجهزة الأخرى «محذوفة»
      const sv=await pull();
      if(sv.exists){stash();mergeInto(sv.flat,sv.del,true);}else SNAP={};}
    assignIds(DB);const now=Date.now();
    for(const k of Object.keys(DB)){if(!allIds(DB[k]))continue;          // ختم آخر تعديل للسجلّات المتغيّرة
      for(const it of DB[k]){const p='r/'+enc(k)+'/k'+enc(it.id),prev=SNAP[p];
        if(prev===undefined){if(!it._u)it._u=now;}else if(noU(prev)!==noU(it))it._u=now;}}
    const cur=pack(DB),upd={};let n=0;
    for(const p in cur)if(SNAP[p]!==cur[p]){upd['d/'+p]=cur[p];
      if(p[0]==='r'){const a=p.split('/');upd['del/'+a[1]+'/'+a[2]]=null;}n++;}   // رُفع/عُدّل → امسح أي شاهد قديم
    for(const p in SNAP)if(!(p in cur)){upd['d/'+p]=null;
      if(p[0]==='r'){const a=p.split('/');upd['del/'+a[1]+'/'+a[2]]=now;}n++;}     // حُذف عندي → اكتب شاهداً
    const ob=getOutbox(),have=idsOf(DB),sent=new Set();
    for(const e of ob){const ek=enc(e.k),kid='k'+enc(e.id),key=e.k+'|'+e.id+'|'+e.t;
      if((have[e.k]||[]).indexOf(e.id)>=0){sent.add(key);continue;}            // أُعيدت إضافته → لا شاهد
      const dp='del/'+ek+'/'+kid;upd[dp]=Math.max(+upd[dp]||0,+e.t||0);upd['d/r/'+ek+'/'+kid]=null;sent.add(key);n++;}
    const clearOb=()=>{if(sent.size)ls.set(LSK.tomb,JSON.stringify(getOutbox().filter(e=>!sent.has(e.k+'|'+e.id+'|'+e.t))));};
    if(!n){clearOb();ls.del(LSK.dirty);setStatus('ok');return;}
    upd['meta/savedAt']=now;
    const to=new Promise((_,rej)=>setTimeout(()=>rej({code:'gp/timeout'}),30000));
    await Promise.race([db.ref('shops/'+UID).update(upd),to]);
    SNAP=cur;clearOb();lsSave();ls.del(LSK.dirty);setStatus('ok');portalSync();
  }catch(e){setStatus('off');ls.set(LSK.dirty,'1');
  }finally{BUSY=false;if(AGAIN){AGAIN=false;G.push();}}
}
G._doPush=doPush;
let PENDING_LIVE=false,MTIMER=null;
function modalOpen(){const m=document.getElementById('modal-root');return !!(m&&m.innerHTML.trim()!=='')||!!document.querySelector('.fs');}
function flashLive(){
  let t=document.getElementById('live-toast');
  if(!t){t=document.createElement('div');t.id='live-toast';
    t.style.cssText='position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;background:#12a866;color:#fff;padding:8px 16px;border-radius:30px;font:800 12.5px Cairo,Tahoma,sans-serif;box-shadow:0 6px 18px -6px rgba(0,0,0,.4);transition:opacity .4s';
    document.body.appendChild(t);}
  t.textContent='🔄 تم تحديث البيانات من جهاز آخر';t.style.opacity='1';
  clearTimeout(t._h);t._h=setTimeout(()=>{t.style.opacity='0';},2200);
}
function scheduleMerge(){clearTimeout(MTIMER);MTIMER=setTimeout(runMerge,180);}
async function runMerge(){   // تحديث لحظي: اسحب وادمج ما إن يتغيّر شيء على السحابة
  if(!G.active||SNAP===null)return;
  if(BUSY){setTimeout(scheduleMerge,300);return;}
  if(modalOpen()){PENDING_LIVE=true;return;}          // نافذة إدخال مفتوحة → أجّل حتى تُغلق
  try{const sv=await pull();const before=JSON.stringify(DB);
    const need=mergeInto(sv.flat,sv.del,false);
    if(JSON.stringify(DB)!==before)flashLive();
    PENDING_LIVE=false;if(need)G.push();setStatus(ls.get(LSK.dirty)==='1'?'sync':'ok');
  }catch(e){PENDING_LIVE=true;}
}
G._runMerge=runMerge;
/* ===== إعدادات مشتركة بين أجهزة المحل (خارج بيانات الحسابات فلا تدخل النسخ الاحتياطية) =====
   cfg/tg = إعداد تيليجرام (يُضبط مرة على أي جهاز) · cfg/tgLast = آخر إرسال (حجز ذرّي يمنع التكرار بين الأجهزة) */
const CFG_VAL={};
G.cfgVal=k=>CFG_VAL[k];
G.setCfg=(k,v)=>{if(!G.active)return;CFG_VAL[k]=v;try{db.ref('shops/'+UID).update({['cfg/'+k]:v==null?null:v});}catch(e){}};
G.claim=async(k,every)=>{ // يحجز إرسالاً واحداً لكل المحل خلال المدة
  if(!G.active||!CONNECTED)return {ok:false,offline:true};
  let prev=null;
  try{const r=await db.ref('shops/'+UID+'/cfg/'+k).transaction(cur=>{prev=cur;const now=Date.now();if(cur&&now-(+cur)<every-60000)return;return now;});
    if(!r.committed){CFG_VAL[k]=+prev||CFG_VAL[k];return {ok:false,prev};}
    CFG_VAL[k]=Date.now();return {ok:true,prev};
  }catch(e){return {ok:false,err:true};}
};
G.release=(k,prev)=>{try{CFG_VAL[k]=prev||null;db.ref('shops/'+UID+'/cfg/'+k).set(prev||null);}catch(e){}};
function watchCfg(){
  db.ref('shops/'+UID+'/cfg').on('value',s=>{const v=s.val()||{};
    Object.keys(CFG_VAL).forEach(k=>{if(!(k in v))delete CFG_VAL[k];});Object.assign(CFG_VAL,v);
    try{ // مزامنة إعداد تيليجرام إلى هذا الجهاز
      const K='goldpro730_tg';let t={};try{t=JSON.parse(localStorage.getItem(K))||{};}catch(_){}
      let ch=false;
      if(v.tg&&typeof v.tg==='object'){for(const f of ['token','chat','on'])if(v.tg[f]!==undefined&&t[f]!==v.tg[f]){t[f]=v.tg[f];ch=true;}}
      if(v.tgLast&&+v.tgLast>(+t.last||0)){t.last=+v.tgLast;t.err='';ch=true;}
      if(ch)localStorage.setItem(K,JSON.stringify(t));
      // أول مرة: إعداد محلي موجود ولم يُرفع بعد → نرفعه
      if(!v.tg&&t.token&&t.chat)G.setCfg('tg',{token:t.token,chat:t.chat,on:!!t.on});
    }catch(_){}
  });
}

function watchRev(){
  if(WATCHING)return;WATCHING=true;watchCfg();
  db.ref('shops/'+UID+'/d').on('value',s=>{LD=s.val();HD=true;scheduleMerge();});
  db.ref('shops/'+UID+'/del').on('value',s=>{LX=s.val();HX=true;scheduleMerge();});
  if(window.closeModal&&!window.closeModal._gpLive){const _cm=window.closeModal;
    window.closeModal=function(){const r=_cm.apply(this,arguments);if(PENDING_LIVE)setTimeout(scheduleMerge,60);return r;};
    window.closeModal._gpLive=true;}
}

/* ---------- الدخول والتحميل الأولي ---------- */
let INITING=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function initialSync(wasDirty){
  if(INITING)return;INITING=true;
  try{
    await new Promise(r=>{if(CONNECTED)return r();const t=setTimeout(r,6000);const h=db.ref('.info/connected').on('value',s=>{if(s.val()){clearTimeout(t);db.ref('.info/connected').off('value',h);r();}});});
    if(!CONNECTED)throw {code:'gp/offline'};
    const sv=await pull();
    while(modalOpen()||BUSY)await sleep(400);          // لا نغيّر البيانات تحت نافذة إدخال مفتوحة
    if(SNAP!==null)return;                               // رفعٌ سبقنا ودمج بنفسه
    wasDirty=wasDirty||ls.get(LSK.dirty)==='1';
    const haveLocal=DB&&(DB.customers.length||DB.invoices.length);
    if(sv.exists){
      if(wasDirty&&haveLocal)stash();
      const need=mergeInto(sv.flat,sv.del,!!(wasDirty&&haveLocal));
      if(need||wasDirty)G.push();
    }else{ // أول مرة على السحابة
      SNAP={};setKnown();
      if(haveLocal&&confirm('هذا حساب جديد على السحابة.\nهل ترفع البيانات الموجودة على هذا الجهاز إلى حسابك؟\n\nموافق = رفعها · إلغاء = البدء بحساب فارغ'))G.push();
      else{DB=normDB(seed());lsSave();G.push();try{renderHome();renderDebts();renderArchive();}catch(_){}}
    }
    setStatus(ls.get(LSK.dirty)==='1'?'sync':'ok');
  }catch(e){ // بلا اتصال: نعمل على النسخة المحلية ونزامن عند عودة الإنترنت
    SNAP=null;setStatus('off');
    if(e&&e.code==='PERMISSION_DENIED')setTimeout(()=>alert('⛔ قاعدة البيانات رفضت القراءة.\nتأكد من نشر ملف database.rules.json في Firebase (Realtime Database ← Rules).'),300);
    if(!(DB&&(DB.customers.length||DB.invoices.length)))toast('لا يوجد اتصال — افتح التطبيق مرة واحدة متصلاً بالإنترنت');
  }finally{INITING=false;}
}
G.init=async function(){
  let u=await authReady();
  if(!u){await loginUI();u=auth.currentUser;}
  UID=u.uid;EMAIL=u.email||'';
  if(await ensureOwner(UID)==='blocked'){blockedUI(EMAIL);return new Promise(()=>{});} // قبل أي مساس ببيانات هذا الجهاز
  if(ls.get(LSK.uid)&&ls.get(LSK.uid)!==UID){try{localStorage.removeItem(KEY);}catch(e){} ls.del(LSK.tomb);ls.del(LSK.known);DB=normDB(seed());} // حساب آخر على نفس الجهاز: لا نخلط البيانات
  ls.set(LSK.uid,UID);
  const wasDirty=ls.get(LSK.dirty)==='1';
  G.active=true;
  watchRev(); // المستمع أولاً: تحميل واحد يخدم المزامنة الأولى والتحديث اللحظي معاً
  const ov=document.getElementById('store-ov');
  const haveLocal0=!!(DB&&(DB.customers.length||DB.invoices.length));
  if(haveLocal0){ // كحانوت يسين: نفتح فوراً من البيانات المحلية، والمزامنة تجري في الخلفية
    setStatus(CONNECTED?'sync':'off');initialSync(wasDirty);
  }else{
    if(ov)ov.textContent='… جارٍ تحميل بياناتك من السحابة';
    await initialSync(wasDirty);
  }
  if(window.photosBlock)window.photosBlock=function(){return '';}; // الصور تحتاج خادم ويندوز المحلي
  if(window.renderInvPhotos)window.renderInvPhotos=function(){};
  const st=document.createElement('style');st.textContent='.phbox,.phbtn{display:none!important}';document.head.appendChild(st);
  if(!document.getElementById('net-dot')){
    const ks=document.createElement('style');ks.textContent='@keyframes gpdot{0%,100%{opacity:1}50%{opacity:.35}}';document.head.appendChild(ks);
    const dot=document.createElement('span');dot.id='net-dot';
    dot.style.cssText='width:13px;height:13px;border-radius:50%;flex:none;display:grid;place-items:center;cursor:pointer;transition:background .3s';
    dot.innerHTML='<b style="font:900 9px/1 Tahoma,sans-serif;color:#fff"></b>';
    dot.onclick=()=>{try{toast(dot.title);}catch(e){}};
    const ck=document.getElementById('clock');
    if(ck&&ck.parentNode)ck.parentNode.insertBefore(dot,ck);
    else{dot.style.cssText+=';position:fixed;top:12px;left:12px;z-index:9999';document.body.appendChild(dot);}
    setInterval(updDot,1500);}
  {const cs=document.createElement('style');cs.textContent='@media (max-width:899px){#cloud-chip{display:none!important}}';document.head.appendChild(cs);} // على الهاتف تكفي نقطة الحالة
  const chip=document.createElement('div');chip.id='cloud-chip';chip.style.cssText='position:fixed;bottom:4px;left:8px;z-index:50;font:700 10.5px Cairo,Tahoma,sans-serif;color:#8b92a9;pointer-events:none';chip.textContent=chipText();document.body.appendChild(chip);
  setStatus(STATUS==='idle'?'ok':STATUS);
};
G.settingsBlock=function(){
  return `<div style="background:linear-gradient(135deg,#e9f9f1,#d4f2e3);border:1px solid #a8e2c4;border-radius:var(--r-md);padding:15px 16px;margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:10px"><span style="font-size:22px">☁️</span><div style="font-weight:900;font-size:14.5px;color:#0d7a48">بياناتك محفوظة في السحابة</div></div>
    <div style="font-size:12px;color:#2e7a57;font-weight:700;line-height:1.9;margin-top:8px;direction:ltr;text-align:right;word-break:break-all">${esc(EMAIL)}</div>
    <div style="font-size:11.5px;color:#2e7a57;font-weight:700;line-height:1.8">${esc(chipText())}</div>
    ${window.GPLOCK?`<div style="display:flex;gap:8px;margin-top:10px"><button onclick="closeModal();GPLOCK.lock()" style="flex:1;padding:11px;border-radius:11px;background:#fff;border:1.5px solid #a8e2c4;color:#0d7a48;font-weight:800;font-size:13px">🧭 قفل الآن</button><button onclick="closeModal();GPLOCK.change()" style="flex:1;padding:11px;border-radius:11px;background:#fff;border:1.5px solid #a8e2c4;color:#0d7a48;font-weight:800;font-size:13px">تغيير الاتجاه السري</button></div>`:''}
    <button onclick="GPCLOUD.passSheet()" style="margin-top:10px;width:100%;padding:11px;border-radius:11px;background:#fff;border:1.5px solid #a8e2c4;color:#0d7a48;font-weight:800;font-size:13.5px">🔑 تغيير كلمة السر</button>
    <button onclick="GPCLOUD.logout()" style="margin-top:10px;width:100%;padding:11px;border-radius:11px;background:#fff;border:1.5px solid #a8e2c4;color:#0d7a48;font-weight:800;font-size:13.5px">تسجيل الخروج</button></div>`;
};
/* ===== تغيير كلمة سر حساب المحل ===== */
async function changePass(cur,np,np2){
  if(!cur)return 'اكتب كلمة السر الحالية';
  if(String(np).length<6)return 'كلمة السر الجديدة 6 أحرف على الأقل';
  if(np!==np2)return 'تأكيد كلمة السر غير مطابق';
  if(np===cur)return 'كلمة السر الجديدة مثل الحالية';
  if(!CONNECTED)return 'يلزم اتصال بالإنترنت لتغيير كلمة السر';
  const u=auth.currentUser;if(!u||!u.email)return 'سجّل الدخول أولاً';
  try{
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,cur));
    await u.updatePassword(np);
    return '';
  }catch(e){
    if(e&&(e.code==='auth/wrong-password'||e.code==='auth/invalid-credential'||e.code==='auth/invalid-login-credentials'))return 'كلمة السر الحالية خاطئة';
    return arErr(e);
  }
}
G.changePass=changePass;
G.passSheet=function(){
  const inp=(id,ph,ac)=>`<input id="${id}" type="password" autocomplete="${ac}" placeholder="${ph}" style="width:100%;padding:13px;border-radius:12px;border:1.5px solid var(--line);font-size:15px;direction:ltr;margin-bottom:10px;box-sizing:border-box">`;
  sheet('تغيير كلمة السر',`
    <div style="font-size:12.5px;color:var(--muted);font-weight:700;margin-bottom:12px;line-height:1.8">الحساب: <b dir="ltr">${esc(EMAIL)}</b></div>
    ${inp('pw-cur','كلمة السر الحالية','current-password')}
    ${inp('pw-new','كلمة السر الجديدة (6 أحرف على الأقل)','new-password')}
    ${inp('pw-new2','أعد كتابة كلمة السر الجديدة','new-password')}
    <div id="pw-err" style="color:var(--red);font-weight:800;font-size:12.5px;min-height:18px;margin-bottom:8px"></div>
    <button class="btn primary" id="pw-go" onclick="GPCLOUD.passSave()">حفظ كلمة السر الجديدة</button>
    <div style="font-size:11.5px;color:var(--muted);font-weight:700;margin-top:10px;line-height:1.8">بعد التغيير قد تطلب أجهزتك الأخرى الدخول من جديد بكلمة السر الجديدة. بياناتها لا تضيع.</div>`);
};
G.passSave=async function(){
  const v=id=>document.getElementById(id).value,err=document.getElementById('pw-err'),b=document.getElementById('pw-go');
  err.textContent='… جارٍ';b.disabled=true;
  const m=await changePass(v('pw-cur'),v('pw-new'),v('pw-new2'));
  b.disabled=false;
  if(m){err.textContent=m;return;}
  try{logAct('إعدادات','تغيير كلمة سر حساب المحل');save();}catch(e){}
  closeModal();toast('✓ تغيّرت كلمة السر');
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
