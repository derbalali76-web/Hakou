/* وضع الكشك (للحاسوب): التطبيق يملأ الشاشة ولا يُغلق بالأزرار المعتادة.
   الإعداد خاص بكل جهاز (localStorage) والخروج منه برمز سري.
   حدود المتصفح: Ctrl+Alt+Del وزر التشغيل لا يمكن لأي صفحة منعهما — للإقفال الكامل استعمل ملف bousla-kiosk.bat */
(function(){
'use strict';
var KO='gp_kiosk',KP='gp_kiosk_pin';
function lg(k){try{return localStorage.getItem(k)}catch(e){return null}}
function ls(k,v){try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}}
var K=window.GPKIOSK={on:lg(KO)==='1'};
var ov=null,wake=null;
async function hash(s){s='gp730-kiosk:'+s;
  try{var b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0')}).join('');}
  catch(e){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return 'w'+h;}}
function covered(){
  if(document.fullscreenElement||document.webkitFullscreenElement)return true;
  try{if(matchMedia('(display-mode: fullscreen)').matches)return true;}catch(e){}
  return window.innerHeight>=screen.height-2&&window.innerWidth>=screen.width-2; // Chrome --kiosk أو F11
}
function enterFS(){
  var el=document.documentElement;
  if(!document.fullscreenElement&&el.requestFullscreen){
    el.requestFullscreen({navigationUI:'hide'}).then(lockKeys).catch(function(){});}
  else lockKeys();
  wakeOn();
}
function lockKeys(){try{if(navigator.keyboard&&navigator.keyboard.lock)navigator.keyboard.lock().catch(function(){});}catch(e){}}
function wakeOn(){try{if(!wake&&navigator.wakeLock)navigator.wakeLock.request('screen').then(function(w){wake=w;w.addEventListener('release',function(){wake=null;});}).catch(function(){});}catch(e){}}
function showOv(){
  if(ov||!document.body)return;
  ov=document.createElement('div');ov.id='gp-kiosk-ov';
  ov.setAttribute('style','position:fixed;inset:0;z-index:2147483646;background:#0b1a33;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#fff;font:800 20px Cairo,Tahoma,sans-serif;cursor:pointer;text-align:center;padding:20px');
  ov.innerHTML='<div style="font-size:54px">🖥️</div><div>اضغط في أي مكان للعودة</div>'+
    '<button id="gp-kx" style="margin-top:30px;background:none;border:1px solid #33456b;color:#6f7fa3;border-radius:10px;padding:8px 14px;font:700 12px Cairo,Tahoma,sans-serif;cursor:pointer">إيقاف وضع الكشك</button>';
  ov.addEventListener('click',function(e){if(e.target.id==='gp-kx'){e.stopPropagation();K.exitSheet();return;}enterFS();setTimeout(check,400);});
  document.body.appendChild(ov);
}
function hideOv(){if(ov&&ov.parentNode)ov.parentNode.removeChild(ov);ov=null;}
function check(){if(!K.on){hideOv();return;}if(covered())hideOv();else showOv();}
/* أي لمسة أو زر = إشارة مستخدم تسمح بطلب ملء الشاشة */
function gesture(e){if(e&&e.target&&e.target.id==='gp-kx')return;if(K.on&&!document.fullscreenElement)enterFS();}
document.addEventListener('pointerdown',gesture,true);
document.addEventListener('keydown',function(e){
  if(!K.on)return;
  var k=e.key,c=e.ctrlKey||e.metaKey,inInput=/^(INPUT|TEXTAREA|SELECT)$/.test((e.target&&e.target.tagName)||'');
  var bad=k==='F5'||k==='F11'||k==='F12'||k==='F3'||k==='F7'||k==='BrowserBack'||k==='BrowserHome'||
    (c&&/^[rwntpjhlduoqsg]$/i.test(k))||(c&&e.shiftKey&&/^[ijcn]$/i.test(k))||
    (e.altKey&&(k==='ArrowLeft'||k==='ArrowRight'||k==='Home'||k==='F4'));
  if(bad){e.preventDefault();e.stopPropagation();}
  if(!document.fullscreenElement)enterFS();
},true);
document.addEventListener('contextmenu',function(e){if(K.on&&!/^(INPUT|TEXTAREA)$/.test(e.target.tagName))e.preventDefault();},true);
window.addEventListener('beforeunload',function(e){if(K.on&&!K._leaving){e.preventDefault();e.returnValue='';return '';}});
document.addEventListener('fullscreenchange',function(){setTimeout(check,150);});
window.addEventListener('resize',function(){setTimeout(check,250);});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&K.on){wakeOn();check();}});
function boot(){if(K.on){check();wakeOn();}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();

/* ===== الإعدادات ===== */
function pinInput(id,ph){return '<input id="'+id+'" type="password" inputmode="numeric" autocomplete="off" placeholder="'+ph+'" style="width:100%;padding:13px;border-radius:12px;border:1.5px solid var(--line,#ccd);font-size:18px;letter-spacing:4px;text-align:center;direction:ltr;margin-bottom:10px;box-sizing:border-box">';}
K.settingsBtn=function(){
  return '<button onclick="GPKIOSK.'+(K.on?'exitSheet':'startSheet')+'()" style="margin-top:10px;width:100%;padding:11px;border-radius:11px;background:#fff;border:1.5px solid #a8e2c4;color:#0d7a48;font-weight:800;font-size:13.5px">🖥️ '+(K.on?'إيقاف وضع الكشك (هذا الجهاز)':'وضع الكشك — ملء الشاشة بلا خروج')+'</button>';
};
K.startSheet=function(){
  sheet('🖥️ وضع الكشك',
    '<div style="font-size:12.5px;color:var(--muted);font-weight:700;line-height:1.9;margin-bottom:12px">يملأ التطبيق شاشة هذا الجهاز ويمنع إغلاقه وتحديثه بالأزرار. إن خرج أحد من ملء الشاشة تُغطّى البيانات حتى يعود. الخروج من الوضع يحتاج رمزاً تختاره الآن.</div>'+
    pinInput('kp1','رمز الخروج (4 أرقام أو أكثر)')+pinInput('kp2','أعد كتابة الرمز')+
    '<div id="kp-err" style="color:var(--red,#c0392b);font-weight:800;font-size:12.5px;min-height:18px;margin-bottom:8px"></div>'+
    '<button class="btn primary" onclick="GPKIOSK.start()">تشغيل وضع الكشك</button>');
};
K.start=async function(){
  var a=document.getElementById('kp1').value.trim(),b=document.getElementById('kp2').value.trim(),er=document.getElementById('kp-err');
  if(a.length<4){er.textContent='الرمز 4 أحرف على الأقل';return;}
  if(a!==b){er.textContent='الرمزان غير متطابقين';return;}
  ls(KP,await hash(a));ls(KO,'1');K.on=true;
  try{closeModal();}catch(e){}
  enterFS();setTimeout(check,500);
  try{logAct('إعدادات','تشغيل وضع الكشك على جهاز');save();}catch(e){}
  try{toast('✓ وضع الكشك مفعّل');}catch(e){}
};
K.exitSheet=function(){
  hideOv();
  sheet('إيقاف وضع الكشك',pinInput('kx1','رمز الخروج')+
    '<div id="kx-err" style="color:var(--red,#c0392b);font-weight:800;font-size:12.5px;min-height:18px;margin-bottom:8px"></div>'+
    '<button class="btn primary" onclick="GPKIOSK.stop()">إيقاف</button>');
  setTimeout(function(){var i=document.getElementById('kx1');if(i)i.focus();},50);
};
var tries=0,until=0;
K.stop=async function(){
  var er=document.getElementById('kx-err');
  if(Date.now()<until){er.textContent='محاولات كثيرة — انتظر دقيقة';return;}
  var v=document.getElementById('kx1').value.trim();
  if((await hash(v))!==lg(KP)){tries++;if(tries>=5){tries=0;until=Date.now()+60000;}er.textContent='الرمز خاطئ';return;}
  tries=0;K.on=false;ls(KO,null);ls(KP,null);
  try{navigator.keyboard&&navigator.keyboard.unlock&&navigator.keyboard.unlock();}catch(e){}
  try{if(wake)wake.release();}catch(e){}
  try{if(document.fullscreenElement)document.exitFullscreen();}catch(e){}
  hideOv();try{closeModal();}catch(e){}
  try{logAct('إعدادات','إيقاف وضع الكشك على جهاز');save();}catch(e){}
  try{toast('أُوقف وضع الكشك');}catch(e){}
};
/* لو أُغلقت نافذة الرمز والوضع ما زال مفعّلاً وليس في ملء الشاشة: يعود الغطاء */
document.addEventListener('click',function(){if(K.on)setTimeout(function(){var mr=document.getElementById('modal-root');if(!(mr&&mr.innerHTML.trim()))check();},300);});
})();
