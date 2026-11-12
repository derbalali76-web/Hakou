/* قفل البوصلة (الهاتف واللوحي فقط): يظهر التطبيق كبوصلة عادية؛ يُفتح بثلاث نقرات سريعة على الشاشة.
   السهم يتحرك كبوصلة عادية للتمويه فقط. في الحاسوب (فأرة بلا شاشة لمس) لا يظهر القفل.
   ملاحظة: هذا تمويه بصري فقط — الحماية الحقيقية لبياناتك هي تسجيل الدخول إلى حسابك. */
(function(){
'use strict';
var KA='gp_lock_ang',TOL=8,AUTO_MS=90*1000;
var L=window.GPLOCK={locked:true,secret:null};
var DESK=(function(){try{return navigator.maxTouchPoints===0&&!matchMedia('(pointer:coarse)').matches&&!/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);}catch(e){return false;}})();
if(DESK){L.locked=false;L.off=true;L.lock=L.change=function(){};L._ang=L._release=function(){};L._state=function(){return {locked:false,off:true};};return;}
var TAPS=3,TAP_MS=700,taps=[],tapStart=null;
function lsget(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsset(k,v){try{localStorage.setItem(k,v)}catch(e){}}
var s=lsget(KA);L.secret=(s===null||s===''||isNaN(+s))?null:((+s%360)+360)%360;
var NAMES=['شمال','شمال شرق','شرق','جنوب شرق','جنوب','جنوب غرب','غرب','شمال غرب'];
var AR=function(n){return String(n).replace(/\d/g,function(d){return '٠١٢٣٤٥٦٧٨٩'[d]});};
var ov=null,ang=0,setup=false,drag=false,hiddenAt=0;
function diff(a,b){var d=Math.abs(a-b)%360;return d>180?360-d:d;}
function ticks(){var h='';for(var i=0;i<72;i++){var big=i%6===0,mid=i%3===0;
  h+='<rect x="'+(150-(big?2.2:1.2))+'" y="14" width="'+(big?4.4:2.4)+'" height="'+(big?20:mid?13:8)+'" rx="1.5" fill="#e8d9a8" fill-opacity="'+(big?1:.55)+'" transform="rotate('+(i*5)+' 150 150)"/>';}return h;}
function build(){
  var d=document.createElement('div');d.id='gp-lock';
  d.setAttribute('style','position:fixed;inset:0;z-index:2147483647;background:radial-gradient(circle at 50% 35%,#0f6b5c,#052e28);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Cairo,Tahoma,sans-serif;color:#e8d9a8;touch-action:none;-webkit-user-select:none;user-select:none;direction:rtl');
  d.innerHTML='<div style="font-weight:800;font-size:22px;letter-spacing:.5px;margin-bottom:14px">بوصلة</div>'
   +'<svg id="gp-dial" viewBox="0 0 300 300" style="width:min(78vw,60vh,340px);height:min(78vw,60vh,340px);touch-action:none;cursor:grab">'
   +'<circle cx="150" cy="150" r="144" fill="#0a4a40" stroke="#e8d9a8" stroke-width="5"/><circle cx="150" cy="150" r="132" fill="none" stroke="#e8d9a8" stroke-opacity=".3" stroke-width="1.5"/>'
   +ticks()
   +'<g font-family="Cairo,Tahoma,sans-serif" font-weight="800" font-size="22" text-anchor="middle" fill="#f2c94c"><text x="150" y="66">ش</text><text x="244" y="158">ق</text><text x="150" y="250">ج</text><text x="56" y="158">غ</text></g>'
   +'<g id="gp-needle"><polygon points="150,48 166,150 150,138 134,150" fill="#f2c94c"/><polygon points="150,252 166,150 150,138 134,150" fill="#f4f1e6" fill-opacity=".88"/></g>'
   +'<circle cx="150" cy="150" r="11" fill="#052e28" stroke="#e8d9a8" stroke-width="3.5"/></svg>'
   +'<div id="gp-read" style="margin-top:16px;font-weight:700;font-size:20px;min-height:30px;direction:rtl"></div>'
   +'<div id="gp-setup" style="display:none;text-align:center;margin-top:10px;padding:0 22px"><div style="font-size:13.5px;line-height:1.9;opacity:.9">أول مرة: حرّك السهم نحو <b>اتجاهك السري</b> ثم اضغط حفظ.<br>سيُفتح التطبيق كلما حرّكت السهم إلى هذا الاتجاه.</div>'
   +'<button id="gp-save" style="margin-top:10px;padding:11px 26px;border-radius:12px;background:#f2c94c;color:#06312e;font-weight:800;font-size:15px;border:0;cursor:pointer;font-family:inherit">حفظ هذا الاتجاه</button>'
   +'<button id="gp-cancel" style="display:none;margin:10px auto 0;padding:8px 18px;border-radius:10px;background:none;color:#e8d9a8;font-weight:700;font-size:13px;border:1px solid rgba(232,217,168,.4);cursor:pointer;font-family:inherit">إلغاء</button></div>';
  return d;}
function paint(){if(!ov)return;var n=ov.querySelector('#gp-needle');if(n)n.setAttribute('transform','rotate('+ang+' 150 150)');
  var a=Math.round(((ang%360)+360)%360);var r=ov.querySelector('#gp-read');if(r)r.textContent='\u2066'+AR(a)+'°\u2069  '+NAMES[Math.round(a/45)%8];}
function point(e){var dial=ov.querySelector('#gp-dial'),r=dial.getBoundingClientRect(),
  cx=r.left+r.width/2,cy=r.top+r.height/2,t=e.touches?e.touches[0]:e,
  dx=t.clientX-cx,dy=t.clientY-cy;if(Math.abs(dx)<2&&Math.abs(dy)<2)return;
  ang=(Math.atan2(dx,-dy)*180/Math.PI+360)%360;paint();}
function release(){unlock();} // للاختبارات فقط
/* ثلاث نقرات سريعة في أي مكان من الشاشة (النقرة = لمسة بلا سحب) */
function tapDown(e){var t=e.touches?e.touches[0]:e;tapStart={x:t.clientX,y:t.clientY,t:Date.now()};}
function tapUp(e){if(!tapStart)return;var t=e.changedTouches?e.changedTouches[0]:e,s=tapStart;tapStart=null;
  if(Math.abs(t.clientX-s.x)>18||Math.abs(t.clientY-s.y)>18||Date.now()-s.t>350){taps=[];return;}
  var now=Date.now();if(taps.length&&now-taps[taps.length-1]>TAP_MS)taps=[];taps.push(now); // كل نقرة خلال 0.7 ث من سابقتها
  if(taps.length>=TAPS){taps=[];swallow();unlock();}}
/* النقرة الثالثة لا «تمرّ» إلى التطبيق تحت البوصلة (كانت تفتح البطاقة التي تحت الإصبع) */
function swallow(){var until=Date.now()+600,f=function(e){if(Date.now()<until){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();}};
  ['click','pointerup','mouseup','touchend'].forEach(function(t){window.addEventListener(t,f,true);setTimeout(function(){window.removeEventListener(t,f,true);},700);});}
function bind(){
  var dial=ov.querySelector('#gp-dial');
  var down=function(e){drag=true;point(e);try{dial.setPointerCapture&&e.pointerId!=null&&dial.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault&&e.preventDefault();};
  var move=function(e){if(drag){point(e);e.preventDefault&&e.preventDefault();}};
  var up=function(){drag=false;};
  if(window.PointerEvent){dial.addEventListener('pointerdown',down);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);}
  else{dial.addEventListener('mousedown',down);window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);dial.addEventListener('touchstart',down,{passive:false});window.addEventListener('touchmove',move,{passive:false});window.addEventListener('touchend',up);}
  if(window.PointerEvent){ov.addEventListener('pointerdown',tapDown,true);ov.addEventListener('pointerup',tapUp,true);}
  else{ov.addEventListener('touchstart',tapDown,{capture:true,passive:true});ov.addEventListener('touchend',tapUp,true);ov.addEventListener('mousedown',tapDown,true);ov.addEventListener('mouseup',tapUp,true);}
  ov.querySelector('#gp-save').onclick=function(){L.secret=Math.round(((ang%360)+360)%360);lsset(KA,String(L.secret));setup=false;unlock();};
  ov.querySelector('#gp-cancel').onclick=function(){setup=false;unlock();};
  ov.addEventListener('contextmenu',function(e){e.preventDefault();});
}
function inert(on){try{var b=document.body;if(!b)return;if(on)b.setAttribute('inert','');else b.removeAttribute('inert');}catch(e){}}
function show(){
  if(ov&&ov.parentNode)return;
  ov=build();document.documentElement.appendChild(ov); // خارج body حتى لا يشمله inert
  if(!document.body)document.addEventListener('DOMContentLoaded',function(){if(L.locked)inert(true);});
  L.locked=true;ang=(Math.random()*360)|0;taps=[];
  paint();bind();inert(true);}
function unlock(){L.locked=false;if(ov&&ov.parentNode)ov.parentNode.removeChild(ov);ov=null;inert(false);try{window.dispatchEvent(new Event('gp-unlocked'));}catch(e){}}
L.lock=function(){setup=false;show();};
L.change=function(){setup=true;show();};
// اختبار
L._ang=function(a){ang=a;paint();};L._release=release;L._state=function(){return {locked:L.locked,secret:L.secret,setup:setup};};
// قفل تلقائي بعد البقاء في الخلفية
document.addEventListener('visibilitychange',function(){
  if(document.hidden){hiddenAt=Date.now();}
  else if(hiddenAt&&Date.now()-hiddenAt>AUTO_MS&&!L.locked){L.lock();}
  if(!document.hidden)hiddenAt=0;});
show();
})();
