/* زر الرجوع في أندرويد (كتطبيق الخروج):
   نافذة مفتوحة ← تُغلق · صفحة غير الرئيسية ← الرئيسية · الرئيسية ← «اضغط مرة أخرى للخروج» */
(function(){
  var armed=false,warned=0;
  function arm(){if(armed)return;try{history.pushState({gpBack:1},'');armed=true;}catch(e){}}
  function page(){var p=document.querySelector('[id^="page-"]:not(.hidden)');return p?p.id.slice(5):'home';}
  window.addEventListener('popstate',function(){
    armed=false;
    if(window.GPLOCK&&GPLOCK.locked){arm();return;}                      // شاشة البوصلة: لا شيء
    var mr=document.getElementById('modal-root');
    if(mr&&mr.innerHTML.trim()){try{closeModal();}catch(e){mr.innerHTML='';}arm();return;}
    if(page()!=='home'){try{go('home');}catch(e){}arm();return;}
    if(window.GPKIOSK&&GPKIOSK.on){arm();return;}                     // وضع الكشك: الرجوع لا يُغلق التطبيق
    if(Date.now()-warned>2500){warned=Date.now();try{toast('اضغط رجوع مرة أخرى للخروج');}catch(e){}arm();return;}
    /* ضغطة ثانية خلال ثانيتين: لا نعيد الفخّ ← الرجوع التالي يُغلق التطبيق */
    try{history.back();}catch(e){}
  });
  // أي لمسة تعيد تفعيل الفخّ (بعد الخروج من نافذة أو تغيير الصفحة)
  document.addEventListener('click',function(){if(!armed)arm();},true);
  window.addEventListener('gp-unlocked',arm);
  if(document.readyState==='complete')arm();else window.addEventListener('load',arm);
})();
