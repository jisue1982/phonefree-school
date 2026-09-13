/* ===== v8.0 same-origin API bridge =====
   Existing UI code can keep using google.script.run.
   Browser -> /api/gas (same origin) -> Apps Script API.
*/
(function(){
  function runner(success, failure){
    return new Proxy({}, {
      get(_target, prop){
        if(prop === 'withSuccessHandler') return fn => runner(fn, failure);
        if(prop === 'withFailureHandler') return fn => runner(success, fn);
        return (...args) => {
          fetch('/api/gas', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            credentials: 'same-origin',
            cache: 'no-store',
            body: JSON.stringify({action:String(prop), args})
          })
          .then(async r => {
            const data = await r.json().catch(()=>({ok:false,msg:'서버 응답을 읽지 못했습니다.'}));
            if(!r.ok) throw new Error(data && data.msg ? data.msg : ('HTTP '+r.status));
            return data;
          })
          .then(data => { if(success) success(data); })
          .catch(err => { if(failure) failure(err); else console.error(err); });
        };
      }
    });
  }
  window.google = window.google || {};
  window.google.script = { run: runner(null, null) };
})();

/* ---------- 데이터 ---------- */
const START = new Date(2026,8,7);           // 2026-09-07
let CODE = null;
let S = {info:{}, days:{}, weeks:{}, pf:{}, growth:{}, milestones:{}, acts:[]};
let saveTimer=null, dirty=false;
function showBar(t,keep){
  const b=document.getElementById('savebar');
  if(!b){ console.log('[상태]',t); return; }
  b.textContent=t; b.classList.add('show');
  if(!keep) setTimeout(()=>b.classList.remove('show'),1200);
}
function persist(){
  dirty=true; clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    showBar('저장 중…',true);
    google.script.run
      .withSuccessHandler(r=>{ if(r&&r.ok){ dirty=false; showBar('저장됨 ✓'); } else showBar('저장 실패: '+(r&&r.msg||''),true); })
      .withFailureHandler(e=>showBar('인터넷을 확인해줘 (저장 안 됨)',true))
      .save(CODE, S);
  },600);
}
window.addEventListener('beforeunload',e=>{ if(dirty){ e.preventDefault(); e.returnValue=''; } });
function enter(code){
  const btn=document.getElementById('loginBtn'), err=document.getElementById('loginErr');
  btn.textContent='확인 중…'; btn.disabled=true; err.textContent='';
  google.script.run.withSuccessHandler(r=>{
    btn.textContent='🚀 폰프리 여행 시작하기'; btn.disabled=false;
    if(!r.ok){ err.textContent=r.msg; return; }
    CODE=code; S=r.state; S.days=S.days||{}; S.weeks=S.weeks||{}; S.pf=S.pf||{}; S.info=S.info||{}; S.acts=S.acts||[]; S.growth=S.growth||{}; S.milestones=S.milestones||{}; migrateOld();
    document.getElementById('login').classList.add('hidden');
    document.querySelector('.app').classList.remove('hidden'); document.querySelector('.tabs').classList.remove('hidden');
    renderTop(); renderGrid(); renderDay(); renderWeeks(); renderInfo(); renderPf(); renderGrowth(); renderMilestones(); renderCollections(); renderDailyMission(); maybeShowGrowthDayPopup();
  }).withFailureHandler(e=>{ btn.textContent='🚀 폰프리 여행 시작하기'; btn.disabled=false; err.textContent='연결이 안 돼. 잠시 후 다시 해봐.'; }).login(code);
}
document.getElementById('loginBtn').onclick=()=>{
  const input=document.getElementById('codeIn');
  const c=(input.value||'').trim().toUpperCase();
  const err=document.getElementById('loginErr');
  if(!c){ err.textContent='학생코드를 입력해 주세요.'; input.focus(); return; }
  enter(c);
};
document.getElementById('codeIn').addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('loginBtn').click(); });

function todayIdx(){
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.floor((t - START)/86400000) + 1; // 1..100, 0 이하면 시작 전
}
function dateOf(i){ const d=new Date(START); d.setDate(d.getDate()+i-1); return d; }
function fmt(d){ return (d.getMonth()+1)+'/'+d.getDate()+' ('+'일월화수목금토'[d.getDay()]+')'; }

let sel = Math.min(Math.max(todayIdx(),1),100);
const SYM = {star:'★', part:'△', retry:'↺'};

/* ---------- 상단 ---------- */
function renderTop(){
  const ti = todayIdx();
  const n = document.getElementById('ddayNum'), l = document.getElementById('ddayLabel');
  if(ti<1){ n.textContent='D-'+(1-ti); l.textContent='시작까지'; }
  else if(ti>100){ n.textContent='끝!'; l.textContent='100일 완주'; }
  else { n.textContent=ti; l.textContent='일째 · '+(100-ti)+'일 남음'; }
  document.getElementById('who').textContent = S.info.name ? S.info.name+'의 100일' : '이름을 먼저 적어줘';
  const day = Math.min(Math.max(ti,1),100);
  const stars = Object.values(S.days||{}).filter(d=>d&&d.r==='star').length;
  const recorded = Object.values(S.days||{}).filter(d=>d&&d.r).length;
  let streak=0; for(let i=Math.min(ti,100);i>=1;i--){ if(S.days[i]&&S.days[i].r) streak++; else break; }
  const actsN=(S.acts||[]).filter(a=>a&&a.use!==false).length;
  const jd=document.getElementById('journeyDay'); if(jd) jd.textContent=day;
  const js=document.getElementById('journeyStars'); if(js) js.textContent=stars;
  const jr=document.getElementById('journeyRemain'); if(jr) jr.textContent=ti<1?'곧 100일의 여정이 시작돼요.':(ti>100?'100일 여정을 완주했어요!':'앞으로 '+(100-ti)+'일 · 천천히 꾸준히 가보자');
  const jf=document.getElementById('journeyFill'); if(jf) jf.style.width=Math.max(0,Math.min(100,recorded))+'%';
  const a=document.getElementById('jmRecorded'); if(a) a.textContent=recorded;
  const b=document.getElementById('jmStreak'); if(b) b.textContent=streak;
  const c=document.getElementById('jmActs'); if(c) c.textContent=actsN;
  const copy=document.getElementById('journeyCopy'); if(copy) copy.textContent = recorded>=100?'100개의 기록을 모두 채웠어!':(streak>=7?'일주일 연속 기록 중! 정말 꾸준해 🌟':'오늘도 별 하나를 만들어 볼까?');
  const hn=document.getElementById('heroName'); if(hn) hn.textContent=S.info.name?(S.info.name+'아'):'친구야';
  const pn=document.getElementById('profileName'); if(pn) pn.textContent=S.info.name||'학생';
  const pc=document.getElementById('profileClass'); if(pc) pc.textContent=S.info.cls||'5·6학년';
  const ds=document.getElementById('dashStars'); if(ds) ds.textContent=stars+'개';
  const dd=document.getElementById('dashDays'); if(dd) dd.textContent=recorded+'일';
  const dst=document.getElementById('dashStreak'); if(dst) dst.textContent=streak+'일';
  const da=document.getElementById('dashActs'); if(da) da.textContent=(S.acts||[]).length+'개';
  document.querySelectorAll('[data-badge]').forEach(x=>x.classList.toggle('unlocked',recorded>=Number(x.dataset.badge)));
  renderCharacterGrowth();
  const fn=document.getElementById('finishName'); if(fn) fn.textContent=(S.info.name||'친구')+'아';
  const fs=document.getElementById('finishStars'); if(fs) fs.textContent=stars;
  const fa=document.getElementById('finishActs'); if(fa) fa.textContent=(S.acts||[]).length;
  const fd=document.getElementById('finishDays'); if(fd) fd.textContent=recorded;

  const rf=document.getElementById('roadFill'); if(rf) rf.style.width=Math.min(86,recorded*.86)+'%';
  [10,30,50,70,100].forEach((n,i,arr)=>{const e=document.getElementById('rp'+n);if(e){e.classList.remove('done','now');if(recorded>=n)e.classList.add('done');else{const prev=i===0?0:arr[i-1];if(recorded>=prev)e.classList.add('now');}}});

}

/* ---------- 격자 ---------- */
function renderGrid(){
  const g = document.getElementById('grid'); g.innerHTML='';
  const ti = todayIdx();
  let stars=0;
  for(let i=1;i<=100;i++){
    const d = S.days[i]||{};
    const b = document.createElement('button');
    b.className='cell'+(d.r?' '+d.r:'')+(i===ti?' today':'')+(i>ti?' future':'');
    b.innerHTML = d.r ? '<span class="sym">'+SYM[d.r]+'</span>' : i;
    b.title = fmt(dateOf(i));
    b.onclick = ()=>{ sel=i; renderDay(); document.getElementById('dayTitle').scrollIntoView({behavior:'smooth',block:'center'}); };
    g.appendChild(b);
    if(d.r==='star') stars++;
  }
  document.getElementById('starCount').textContent = '별 '+stars+'개';
  const st = document.getElementById('stages'); st.innerHTML='';
  for(let k=0;k<10;k++){
    let filled=0; for(let i=k*10+1;i<=k*10+10;i++) if(S.days[i]&&S.days[i].r) filled++;
    const s=document.createElement('div'); s.className='stage'+(filled===10?' done':''); s.title=(k+1)+'단계';
    if(filled>0&&filled<10) s.style.background='linear-gradient(90deg,var(--star) '+filled*10+'%,rgba(255,255,255,.14) '+filled*10+'%)';
    st.appendChild(s);
  }
  // 통계
  let streak=0; for(let i=Math.min(ti,100);i>=1;i--){ if(S.days[i]&&S.days[i].r) streak++; else break; }
  let tot=0; for(const i in S.days) tot += (S.days[i].min||0);
  document.getElementById('stStar').textContent=stars;
  document.getElementById('stStreak').textContent=streak;
  document.getElementById('stTotal').textContent=Math.floor(tot/60)+'h '+(tot%60)+'m';
  renderTop();
}

/* ---------- 하루 기록 ---------- */
const PROMPT_SETS={
  star:[
    '오늘 휴대폰 대신 무엇을 했어?','오늘 나를 칭찬한다면 어떤 점을 칭찬하고 싶어?',
    '오늘 휴대폰을 잘 내려놓았던 순간은 언제였어?','휴대폰을 덜 보니까 좋았던 점 하나는 뭐야?',
    '오늘 가장 재미있었던 순간은?','오늘 가족이나 친구와 함께한 일은?',
    '오늘 새롭게 해본 것은 무엇이야?','오늘 스스로 뿌듯했던 선택은 무엇이야?'
  ],
  part:[
    '오늘 그래도 잘해낸 한 가지는 뭐야?','조금만 더 해볼 수 있었던 순간은 언제였어?',
    '오늘 휴대폰을 가장 보고 싶었던 순간은 언제였어?','목표를 지키는 데 도움이 된 것은 무엇이었어?',
    '오늘 생각보다 어려웠던 점은 무엇이야?','그래도 포기하지 않은 순간이 있었어?',
    '내일 한 가지만 바꾼다면 무엇을 바꾸고 싶어?'
  ],
  retry:[
    '괜찮아! 내일 다시 해볼 한 가지는 뭐야?','오늘 휴대폰을 오래 보게 된 이유는 무엇이었어?',
    '다시 시작한다면 어떤 방법을 써보고 싶어?','오늘 중 휴대폰을 잠깐이라도 내려놓았던 순간은?',
    '내일 나에게 해주고 싶은 응원 한마디는?','다음에는 어떤 순간에 휴대폰을 먼저 내려놓아 볼까?'
  ],
  neutral:[
    '오늘 휴대폰 대신 무엇을 했어?','오늘 가장 기억에 남는 순간은?',
    '오늘 휴대폰을 내려놓고 해본 일은?','오늘 가족이나 친구와 어떤 이야기를 했어?',
    '오늘 새롭게 발견한 재미는 무엇이야?','오늘 나를 칭찬해주고 싶은 점은?'
  ],
  early:['폰프리를 시작하고 처음 달라진 점이 있어?','요즘 휴대폰 대신 해보는 일이 생겼어?','처음보다 쉬워진 점이 있다면 무엇이야?'],
  middle:['지금까지 가장 힘들었던 순간은 언제였어?','절반쯤 와보니 처음과 달라진 점은 무엇이야?','폰 대신 하게 된 활동 중 가장 마음에 드는 것은?'],
  late:['요즘 새롭게 알게 된 내 모습은 무엇이야?','100일 전의 나와 비교하면 무엇이 달라졌어?','완주 뒤에도 이어가고 싶은 좋은 습관은 무엇이야?']
};
function getAdaptivePrompt(dayIndex,result){
  let pool=PROMPT_SETS[result]||PROMPT_SETS.neutral;
  let stage=null;
  if(dayIndex>=25&&dayIndex<45)stage='early';
  else if(dayIndex>=45&&dayIndex<70)stage='middle';
  else if(dayIndex>=70)stage='late';
  if(stage&&dayIndex%3===0)pool=PROMPT_SETS[stage];
  const salt=result==='star'?3:result==='part'?7:result==='retry'?11:1;
  return pool[(dayIndex*5+salt)%pool.length];
}
let curR=null;
function renderDay(){
  const d = S.days[sel]||{};
  const ti=todayIdx();
  document.getElementById('dayTitle').textContent = (sel===ti?'학교에서 기록하기':sel+'일째 기록');
  document.getElementById('dayDate').textContent = fmt(dateOf(sel));
  document.getElementById('h').value = d.min!=null ? Math.floor(d.min/60) : '';
  document.getElementById('m').value = d.min!=null ? d.min%60 : '';
  document.getElementById('note').value = d.note||'';
  curR = d.r||null;
  document.querySelectorAll('.choice').forEach(c=>c.classList.toggle('on',c.dataset.v===curR));
  document.getElementById('promptBox').textContent=getAdaptivePrompt(sel,d.r);
  const pm=document.getElementById('promptMode');
  if(pm)pm.textContent=d.r==='star'?'⭐ 성공한 날 질문':d.r==='part'?'△ 노력한 날 질문':d.r==='retry'?'↺ 다시 도전하는 날 질문':'💬 오늘의 한 줄 질문';
}
document.querySelectorAll('.choice').forEach(c=>c.onclick=()=>{
  curR=c.dataset.v; document.querySelectorAll('.choice').forEach(x=>x.classList.toggle('on',x===c));
});
document.getElementById('save').onclick=()=>{
  if(!curR){ alert('오늘은 어땠는지 ★ △ ↺ 중에 하나 골라줘.'); return; }
  const h=+document.getElementById('h').value||0, m=+document.getElementById('m').value||0;
  S.days[sel]={r:curR, min:h*60+m, note:document.getElementById('note').value.trim()};
  persist(); renderGrid(); renderTop(); renderCharacterGrowth(); maybePlayLevelUp();
  sfx('save');
  buddySay(characterResultLine(curR));
  checkNewBadges();
  maybeCelebrate100();
  const btn=document.getElementById('save'); btn.textContent='저장했어! '+ACTIVE_CHAR.name+'도 함께 성장했어 ✓';
  renderDailyMission(); setTimeout(()=>btn.textContent='① 오늘 기록 저장하기',1800);
};

/* ---------- 룰렛 ---------- */
const IDEAS = {
  R:['학교 도서관에서 책 한 권 빌리기','만화책 말고 글책 10쪽 읽기','동생한테 그림책 읽어주기','읽은 책 한 줄 감상 쓰기','신문이나 잡지에서 재밌는 기사 찾기'],
  A:['오늘 하루를 그림 한 장으로 그리기','종이접기 3개 만들기','색연필로 내 방 그리기','만들기: 상자로 뭔가 만들기','우리 동네 사진 찍고 제목 붙이기(폰 카메라만 1분)'],
  S:['줄넘기 100개','동네 한 바퀴 걷기','친구랑 축구·농구 30분','계단 오르내리기 10번','스트레칭 10분'],
  M:['리코더나 피아노 한 곡 연습','노래 한 곡 외워 부르기','가족 앞에서 작은 발표회','좋아하는 노래 가사 손으로 써보기'],
  F:['가족이랑 보드게임 한 판','부모님께 오늘 있었던 일 3가지 말하기','할머니·할아버지께 전화하기','친구 집에 놀러 가서 폰 없이 놀기','저녁 준비 도와드리기','동네 청소나 봉사 30분']
};
let cat='all';
document.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{ cat=c.dataset.c; document.querySelectorAll('.chip').forEach(x=>x.classList.toggle('on',x===c)); });
document.getElementById('spin').onclick=()=>{
  let pool;
  if(cat==='all'){
    const counts=getActivityBalance(), keys=['R','A','S','F'];
    const min=Math.min(...keys.map(k=>counts[k]||0));
    const needs=keys.filter(k=>(counts[k]||0)===min);
    const balanced=needs.flatMap(k=>IDEAS[k]||[]);
    pool=balanced.concat(balanced).concat(Object.values(IDEAS).flat());
  }else{ pool=IDEAS[cat]||[]; }
  const out=document.getElementById('rout'); let n=0, chosen='';
  const t=setInterval(()=>{
    chosen=pool[Math.floor(Math.random()*pool.length)];
    out.textContent=chosen;
    if(++n>8){
      clearInterval(t);
      sfx('roulette');
      buddySay('균형 성장 추천! '+chosen);
    }
  },70);
};

/* ---------- 부모님 주간 ---------- */

function parentCharacterSummary(week,from,to,stars,part,ret){
  const src=CHARACTER_AVATARS[ACTIVE_CHAR.id]||CHARACTER_AVATARS.maehwabyeol;
  let recorded=0;
  for(let i=from;i<=to;i++){if(S.days[i]&&S.days[i].r)recorded++;}
  let msg='';
  if(recorded===0) msg='이번 주 기록은 아직 시작 전이에요. 첫 기록을 함께 응원해주세요!';
  else if(stars>=5) msg='이번 주 '+recorded+'일 기록했고, 성공 별을 '+stars+'개나 모았어요! 많이 칭찬해주세요.';
  else if(ret>=2) msg='이번 주에는 다시 도전한 날도 있었어요. 포기하지 않고 기록한 점을 응원해주세요.';
  else msg='이번 주 '+recorded+'일을 기록했어요. 작은 변화를 함께 찾아서 칭찬해주세요.';
  const bal=getBalanceStatus(); msg+=' 전체 활동 균형도는 '+bal.score+'점이에요.';
  return '<div class="parent-char-summary"><div class="pcs-avatar"><img src="'+src+'" alt="'+ACTIVE_CHAR.name+'"></div><div class="pcs-copy"><b>'+ACTIVE_CHAR.name+'이 부모님께 알려드려요</b><span>'+msg+'</span></div></div>';
}

function renderWeeks(){
  const w=document.getElementById('weeks'); if(!w) return;
  w.innerHTML='';
  const ti=todayIdx();
  const maxW=Math.max(1,Math.min(15,Math.ceil(Math.min(ti,100)/7)));

  for(let k=maxW;k>=1;k--){
    const from=(k-1)*7+1, to=Math.min(k*7,100);
    let stars=0,ret=0,part=0;
    for(let i=from;i<=to;i++){
      const d=S.days[i];
      if(d){
        if(d.r==='star')stars++;
        if(d.r==='part')part++;
        if(d.r==='retry')ret++;
      }
    }

    const isCurrent=(k===maxW);
    const saved=(S.weeks[k]||'').trim();
    const card=document.createElement('div');
    card.className='week-card'+(isCurrent?' current open':'');
    card.dataset.week=k;

    card.innerHTML=
      '<button type="button" class="week-head" aria-expanded="'+(isCurrent?'true':'false')+'">'
      +'<div class="week-title">'
        +(isCurrent?'<span class="week-pill">✨ 이번 주</span>':'')
        +'<strong>'+k+'주차</strong>'
        +'<span class="week-date">'+fmt(dateOf(from))+' ~ '+fmt(dateOf(to))+'</span>'
        +'<span class="week-stats">★'+stars+' △'+part+' ↺'+ret+'</span>'
      +'</div>'
      +'<div class="week-toggle"><span class="closed">펼쳐보기 ▾</span><span class="opened">접기 ▴</span></div>'
      +'</button>'
      +'<div class="week-body">'
        +(isCurrent?parentCharacterSummary(k,from,to,stars,part,ret):'')
        +(isCurrent?'<div class="week-current-label">이번 주 부모님 한마디 💌</div>':'<div class="week-current-label">지난 주 부모님 한마디</div>')
        +'<textarea data-w="'+k+'" placeholder="부모님이 짧게 한마디 남겨주세요.">'+saved+'</textarea>'
        +(saved?'<div class="week-saved-preview">저장된 한마디: '+saved.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>':'<div class="week-empty">아직 남긴 한마디가 없어요.</div>')
        +'<div class="week-save-note">내용을 바꾸고 다른 곳을 누르면 자동 저장됩니다.</div>'
      +'</div>';

    w.appendChild(card);
  }

  w.querySelectorAll('.week-head').forEach(btn=>btn.onclick=()=>{
    const card=btn.closest('.week-card');
    card.classList.toggle('open');
    btn.setAttribute('aria-expanded',card.classList.contains('open')?'true':'false');
  });

  w.querySelectorAll('textarea').forEach(t=>{
    t.onchange=()=>{
      S.weeks[t.dataset.w]=t.value.trim();
      persist();
      renderWeeks();
    };
  });
}

/* ---------- 정보 ---------- */
function renderInfo(){
  const i=S.info;
  fName.value=i.name||''; fSchool.value=i.school||''; fClass.value=i.cls||''; fRegion.value=i.region||''; fGoal.value=i.goal||'';
}
document.getElementById('saveInfo').onclick=()=>{
  S.info={name:fName.value.trim(),school:fSchool.value.trim(),cls:fClass.value.trim(),region:fRegion.value.trim(),goal:fGoal.value};
  persist(); renderTop(); alert('저장했어.');
};
document.getElementById('reset').onclick=()=>{
  if(confirm('실천·활동·성장 기록을 초기화할까요? 이름·학교·학급 정보는 유지되고, 초기화한 기록은 되돌릴 수 없습니다.')){ S={info:S.info,days:{},weeks:{},pf:{},growth:{},milestones:{},acts:[]}; persist(); renderGrid(); renderDay(); renderWeeks(); renderPf(); renderGrowth(); }
};

function studentLogout(){
  if(dirty && !confirm('아직 저장 중인 내용이 있을 수 있어요. 그래도 로그아웃할까요?')) return;
  CODE=null; S={info:{},days:{},weeks:{},pf:{},growth:{},milestones:{},acts:[]}; dirty=false;
  document.querySelector('.app').classList.add('hidden');
  document.querySelector('.tabs').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');
  const ci=document.getElementById('codeIn'); if(ci){ci.value='';ci.focus();}
  window.scrollTo({top:0,behavior:'instant'});
}
const studentLogoutBtn=document.getElementById('studentLogout'); if(studentLogoutBtn) studentLogoutBtn.onclick=studentLogout;
const deviceResetBtn=document.getElementById('deviceReset'); if(deviceResetBtn) deviceResetBtn.onclick=()=>{
  if(!confirm('이 브라우저에 남은 캐릭터·효과음·알림 확인 기록을 지울까요? 학교에 저장된 학생 기록은 지워지지 않습니다.')) return;
  try{
    Object.keys(localStorage).filter(k=>k.indexOf('phonefree')===0).forEach(k=>localStorage.removeItem(k));
  }catch(e){}
  alert('이 기기의 앱 설정을 초기화했습니다. 학생 기록은 학교 저장소에 그대로 있습니다.');
};


/* ---------- v7.8 하루 2단계 필수 기록 ---------- */
function localDateStr(){ const t=new Date(); const p=n=>String(n).padStart(2,'0'); return t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate()); }
function todayRecordDone(){ const i=Math.min(Math.max(todayIdx(),1),100); return !!(S.days&&S.days[i]&&S.days[i].r); }
function todayActivityDone(){ const d=localDateStr(); return (S.acts||[]).some(a=>a&&a.use!==false&&a.date===d&&a.what&&a.feel); }
function renderDailyMission(){
  const r=todayRecordDone(), a=todayActivityDone();
  const sr=document.getElementById('stepRecord'), sa=document.getElementById('stepActivity'), sf=document.getElementById('stepFinish');
  if(!sr||!sa||!sf)return;
  sr.className='daily-step '+(r?'done':'current');
  sa.className='daily-step '+(a?'done':(r?'current':''));
  sf.className='daily-finish '+(r&&a?'done':'');
  document.getElementById('stepRecordText').textContent=r?'✓ 작성 완료':'먼저 작성해요';
  document.getElementById('stepActivityText').textContent=a?'✓ 작성 완료':(r?'이제 작성해요':'① 다음에 작성');
  sf.textContent=r&&a?'🎉 오늘 기록 완료!':'두 가지를 모두 기록해요';
  const nr=document.getElementById('navRecordCheck'); if(nr)nr.textContent=r?'✓':'';
  const na=document.getElementById('navActCheck'); if(na)na.textContent=a?'✓':'';
  const rn=document.getElementById('recordNextCallout'); if(rn)rn.classList.toggle('show',r&&!a);
  const ad=document.getElementById('activityDoneCallout'); if(ad)ad.classList.toggle('show',r&&a);
}
function goRequiredRecord(){ openStudentPage('home'); setTimeout(()=>{const e=document.getElementById('recordFocus')||document.getElementById('recordEditor');if(e)e.scrollIntoView({behavior:'smooth',block:'start'});},100); }
function goRequiredActivity(){ openStudentPage('pf'); setTimeout(()=>{const e=document.getElementById('activityEntry');if(e)e.scrollIntoView({behavior:'smooth',block:'start'});},100); }
setTimeout(()=>{
  const sr=document.getElementById('stepRecord'),sa=document.getElementById('stepActivity'),ga=document.getElementById('goActivityNow'),pt=document.getElementById('planToggle');
  if(sr)sr.onclick=goRequiredRecord; if(sa)sa.onclick=goRequiredActivity; if(ga)ga.onclick=goRequiredActivity;
  if(pt)pt.onclick=()=>{const c=pt.closest('.plan-card');c.classList.toggle('open');pt.textContent=c.classList.contains('open')?'접기 ▴':'수정하기 ▾';};
},0);

/* ---------- 탭 ---------- */
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('on',p.id==='p-'+b.dataset.p));
  window.scrollTo(0,0);
});

/* ---------- 인쇄 ---------- */
function esc(s){ return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function tm(min){ if(min==null) return ''; return Math.floor(min/60)+'시간 '+(min%60)+'분'; }

function officialHead(no,title){
  return '<div class="official-head"><div class="formno">'+no+'</div><div class="formtitle">'+title+'</div></div>';
}

function buildSheet(ST){ ST=ST||S;
  const i=ST.info||{}; let tot=0; for(const k in ST.days) tot+=(ST.days[k].min||0);
  let rows='';
  for(let r=0;r<10;r++){
    let n='',t='',sym='';
    for(let c=1;c<=10;c++){ const idx=r*10+c, d=ST.days[idx]||{};
      n+='<td>'+idx+'</td>'; t+='<td>'+(d.min!=null?tm(d.min):'')+'</td>'; sym+='<td>'+(d.r?SYM[d.r]:'')+'</td>'; }
    rows+='<tr class="n">'+n+'</tr><tr class="t">'+t+'</tr><tr class="s">'+sym+'</tr>';
  }
  return '<div class="pr-page">'
   +officialHead('서식2','「폰 프리 100일의 기적」우수학생 선정 공모 양식')
   +'<div class="section-title">[2-1] 실천기록지</div>'
   +'<div class="record-banner">폰프리 100일의 기적 실천 기록지</div>'
   +'<table class="pr pr-info"><tr><th style="width:11%">지역</th><th style="width:17%">학교명</th><th style="width:12%">학년/반</th><th style="width:13%">학생명</th><th>나의 목표</th></tr>'
   +'<tr><td>'+esc(i.region)+'</td><td>'+esc(i.school)+'</td><td>'+esc(i.cls)+'</td><td>'+esc(i.name)+'</td><td class="goalcell">나는 하루 ( '+(i.goal?esc(String(i.goal)):'&nbsp;&nbsp;&nbsp;')+' 시간 )이상의 핸드폰 사용을 하지 않겠습니다.</td></tr></table>'
   +'<div class="pr-guide">매일 폰프리 실천 후 (1) 자신이 하루 동안 사용한 휴대폰 사용 시간을 기록하고<br>(2) 자신의 목표 도달도를 (★ (성공), △ (부분 실천), ↺ (다시 시작) ) 기호로 표시해봅시다.</div>'
   +'<table class="pr pr-grid">'+rows+'</table>'
   +'<table class="pr pr-foot" style="margin-top:2.2mm"><tr><th style="width:13%">학생명</th><th>100일의 기적</th><th style="width:18%">담임교사 사인</th><th style="width:18%">보호자 사인</th></tr>'
   +'<tr><td>'+esc(i.name)+'</td><td>나는 100일동안 총( '+Math.floor(tot/60)+'시간 '+(tot%60)+'분 )의 휴대폰을 사용하며 폰프리를 실천하였습니다.</td><td></td><td></td></tr></table>'
   +'</div>';
}
function buildNotes(ST){ ST=ST||S;
  const i=ST.info||{};
  let notes=''; let temptation='';
  for(let k=1;k<=100;k++){ const d=ST.days[k]; if(!d||!d.note) continue;
    notes+='<div><b>'+k+'일 '+SYM[d.r]+'</b> '+esc(d.note)+'</div>';
    if(d.r==='retry') temptation+='<div><b>'+k+'일</b> '+esc(d.note)+'</div>'; }
  let weeks=''; for(let k=1;k<=15;k++) if(ST.weeks[k]) weeks+='<div><b>'+k+'주차</b> '+esc(ST.weeks[k])+'</div>';
  return '<div class="pr-page">'
   +'<div class="pr-title"><span class="tag">참고</span><h1>'+esc(i.name||'')+'의 한 줄 일기 모음 (서식2-3 수기 쓸 때 참고)</h1></div>'
   +'<div class="pr-small">이 종이는 제출하는 서식이 아니에요. 서식2-3 "나의 실천 수기·변화·성장"을 쓸 때 기억을 떠올리는 용도예요. 반드시 네 말로 다시 써야 해.</div>'
   +'<div class="pr-sec"><h2>다시 시작한 날 (폰이 제일 하고 싶었던 순간 · 어떻게 다시 시작했는지)</h2><div class="pr-notes">'+(temptation||'<span style="color:#888">아직 없음</span>')+'</div></div>'
   +'<div class="pr-sec"><h2>매일 한 줄 일기</h2><div class="pr-notes">'+(notes||'<span style="color:#888">아직 기록이 없어요</span>')+'</div></div>'
   +'<div class="pr-sec"><h2>부모님 한마디 (서식2-2 학부모 의견 쓸 때 참고)</h2><div class="pr-notes" style="min-height:30mm">'+(weeks||'<span style="color:#888">아직 없음</span>')+'</div></div>'
   +'</div>';
}
function doPrint(html){
  if(!html){
    showBar('인쇄할 내용이 없습니다',false);
    alert('인쇄할 데이터가 없습니다. 학생 기록을 확인해 주세요.');
    return;
  }
  const area=document.getElementById('print');
  if(!area){
    alert('인쇄 영역을 찾지 못했습니다. 최신 Index.html로 교체해 주세요.');
    return;
  }
  area.innerHTML=html;
  showBar('인쇄 창을 여는 중…',true);
  setTimeout(()=>{
    try{ window.print(); }
    finally{ setTimeout(()=>showBar('인쇄 준비 완료'),500); }
  },180);
}
document.getElementById('printSheet').onclick=()=>doPrint(buildSheet());
document.getElementById('printNotes').onclick=()=>doPrint(buildNotes());


/* ---------- 포트폴리오 ---------- */
const PF_IDS=['H1','H2','H3','G1','G2','G3'];
const CATN={R:'독서',A:'예술',S:'운동',M:'음악',F:'관계·성장'};
function renderPf(){
  PF_IDS.forEach(k=>{ document.getElementById('pf'+k).value=S.pf[k]||''; });
  if(!document.getElementById('actDate').value){ const t=new Date(); const p=n=>String(n).padStart(2,'0'); const v=t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate()); document.getElementById('actDate').value=(v<'2026-09-07')?'2026-09-07':(v>'2026-12-15'?'2026-12-15':v); }
  renderActs();
}
function savePf(){ PF_IDS.forEach(k=>{ S.pf[k]=document.getElementById('pf'+k).value.trim(); }); persist(); }
PF_IDS.forEach(k=>document.getElementById('pf'+k).onchange=savePf);
document.getElementById('savePf').onclick=()=>{ savePf(); const b=document.getElementById('savePf'); b.textContent='저장했어 ✓'; setTimeout(()=>b.textContent='실천 계획 저장',1500); };

/* 활동 = {id, date:'2026-09-12', cat:'R', what, how, feel, use:true} */
function acts(){ S.acts=S.acts||[]; return S.acts; }
function migrateOld(){ // 예전 R/A/S/F 자유입력을 활동으로 옮기기
  ['R','A','S','F'].forEach(c=>{ if(S.pf[c]){ S.pf[c].split('\n').forEach(l=>{ l=l.trim(); if(!l) return;
    const m=l.match(/^(\d{1,2})\/(\d{1,2})\s*(.*)$/); let date='',what=l;
    if(m){ date='2026-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'); what=m[3]; }
    acts().push({id:Date.now()+Math.random(),date,cat:c,what,how:'',feel:'',use:true}); }); delete S.pf[c]; } });
}
let actCat='R', actFilt='all';
document.querySelectorAll('#actCats .chip').forEach(c=>c.onclick=()=>{ actCat=c.dataset.c; document.querySelectorAll('#actCats .chip').forEach(x=>x.classList.toggle('on',x===c)); });
document.querySelectorAll('#actFilter .chip').forEach(c=>c.onclick=()=>{ actFilt=c.dataset.c; document.querySelectorAll('#actFilter .chip').forEach(x=>x.classList.toggle('on',x===c)); renderActs(); });
function addAct(cat,what,how,feel,date){
  if(!what){ alert('무엇을 했는지 적어줘.'); return false; }
  if(!feel){ alert('느낀 점도 한 줄 적어줘. 진짜로 한 일이어야 해.'); return false; }
  acts().push({id:Date.now()+Math.random(),date:date||'',cat,what,how:how||'',feel:feel||'',use:true});
  persist(); renderActs(); return true;
}
document.getElementById('actAdd').onclick=()=>{
  const ok=addAct(actCat,actWhat.value.trim(),actHow.value.trim(),actFeel.value.trim(),actDate.value);
  if(ok){ actWhat.value='';actHow.value='';actFeel.value=''; renderDailyMission(); const b=document.getElementById('actAdd'); b.textContent='🎉 오늘의 2단계 기록 완료!'; setTimeout(()=>b.textContent='② 내 활동 저장하고 오늘 기록 끝내기',1800); }
};
function fmtDate(d){ if(!d) return ''; const [y,m,dd]=d.split('-'); return (+m)+'/'+(+dd); }
function renderActs(){
  const list=document.getElementById('actList'); list.innerHTML='';
  const all=acts().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const cnt={R:0,A:0,S:0,M:0,F:0}; all.forEach(a=>{ if(a.use!==false) cnt[a.cat]=(cnt[a.cat]||0)+1; });
  const bal={R:cnt.R,A:cnt.A+cnt.M,S:cnt.S,F:cnt.F};
  document.getElementById('actSummary').textContent='R '+bal.R+' · A '+bal.A+' · S '+bal.S+' · 관계 '+bal.F;
  const low=['R','A','S','F'].filter(c=>bal[c]<2);
  document.getElementById('actHint').textContent = all.length===0 ? '아직 없어. 오늘 한 일부터 하나 저장해봐.' : (low.length ? 'R·A·S·관계를 골고루 채워보자. '+low.map(c=>({R:'독서',A:'예술',S:'스포츠',F:'관계'}[c])).join('·')+' 활동이 아직 적어.' : 'R·A·S·관계를 고르게 잘 모으고 있어!');
  all.filter(a=>actFilt==='all'||a.cat===actFilt).forEach(a=>{
    const d=document.createElement('div'); d.className='act'+(a.use===false?' off':'');
    d.innerHTML='<input type="checkbox" '+(a.use===false?'':'checked')+' title="포트폴리오에 넣기"><div class="bd"><div class="what"><span class="tag '+a.cat+'">'+a.cat+'</span>'+esc(fmtDate(a.date))+' '+esc(a.what)+(a.how?' <span class="muted">('+esc(a.how)+')</span>':'')+'</div>'+(a.feel?'<div class="feel">'+esc(a.feel)+'</div>':'')+'</div><button class="del">지우기</button>';
    d.querySelector('input').onchange=e=>{ a.use=e.target.checked; persist(); renderActs(); };
    d.querySelector('.del').onclick=()=>{ if(confirm('이 활동을 지울까?')){ S.acts=acts().filter(x=>x.id!==a.id); persist(); renderActs(); } };
    list.appendChild(d);
  });
  renderBalance();
  renderGrowthEvidence();
}
function actLines(ST,cats){
  return (ST.acts||[]).filter(a=>a.use!==false&&cats.includes(a.cat)).sort((a,b)=>(a.date||'').localeCompare(b.date||''))
    .map(a=>'· '+(a.date?fmtDate(a.date)+' ':'')+esc(a.what)+(a.how?'('+esc(a.how)+')':'')+(a.feel?' — '+esc(a.feel):'')).join('\n');
}

function gradeOnly(cls){
  const m=String(cls||'').match(/([1-6])/);
  return m ? m[1]+'학년' : String(cls||'');
}

function buildPf(ST){ ST=ST||S;
  const i=ST.info||{}, p=ST.pf||{}; const W=ST.weeks||{};
  const li=(a,b,c)=>'① '+esc(a)+'\\n② '+esc(b)+'\\n③ '+esc(c);
  let weeks=''; for(let k=1;k<=15;k++) if(W[k]) weeks+=esc(W[k])+'\\n';
  return '<div class="pr-page">'
   +officialHead('서식2','「폰 프리 100일의 기적」우수학생 선정 공모 양식')
   +'<div class="section-title">[2-2] 포트폴리오</div>'
   +'<table class="pr pr-info"><tr><th>지역</th><th>학교명</th><th>학교급/학년</th><th>학생명</th><th>연락처</th><th>보호자 연락처</th></tr>'
   +'<tr><td>'+esc(i.region)+'</td><td>'+esc(i.school)+'</td><td>초등학교 / '+esc(gradeOnly(i.cls))+'</td><td>'+esc(i.name)+'</td><td>출력 후 작성</td><td>출력 후 작성</td></tr></table>'
   +'<div class="pf-h">□ 「폰 프리 100일의 기적」실천 계획</div>'
   +'<table class="pr pf plan-table">'
   +'<tr><th>스마트폰<br>사용습관</th><td>■ 내가 100일 동안 바꾸고 싶은 스마트폰 사용 습관을 적어주세요\\n\\n'+li(p.H1,p.H2,p.H3)+'</td></tr>'
   +'<tr><th>나의<br>목표</th><td>■ 나의 목표를 구체적으로 적어주세요.\\n(예시: 등교 후 하교 전까지 개인 스마트폰 사용하지 않기 / 가족 식사시간 휴대폰 내려놓기 / 취침 1시간 전 사용 중단하기)\\n\\n'+li(p.G1,p.G2,p.G3)+'</td></tr>'
   +'<tr><th>나의<br>다짐</th><td>나는 2026. 9. 7.~12. 15. 100일 동안 내가 정한 폰프리 규칙을 자발적으로 실천하고, 성공한 날뿐 아니라 어려웠던 날과 다시 시작한 과정도 솔직하게 기록하겠습니다.</td></tr>'
   +'</table></div>'
   +'<div class="pr-page">'
   +officialHead('서식2','「폰 프리 100일의 기적」우수학생 선정 공모 양식')
   +'<div class="section-title">[2-2] 포트폴리오</div>'
   +'<div class="pf-h">□ 나의 대체 활동 포트폴리오</div>'
   +'<table class="pr pf portfolio-table">'
   +'<tr><th>R<small>(독서)</small></th><td>'+actLines(ST,['R'])+'</td></tr>'
   +'<tr><th>A<small>(예술문화)</small></th><td>'+actLines(ST,['A','M'])+'</td></tr>'
   +'<tr><th>S<small>(스포츠)</small></th><td>'+actLines(ST,['S'])+'</td></tr>'
   +'<tr><th>관계<br>성장</th><td>'+actLines(ST,['F'])+'</td></tr>'
   +'<tr><th>학부모<br>의견</th><td>'+weeks+'</td></tr>'
   +'</table>'
   +'<div class="pr-small">※ 음악 활동은 예술문화(A) 영역에 함께 정리됩니다. 연락처를 입력하지 않은 경우 출력 후 직접 작성할 수 있습니다.</div>'
   +'</div>';
}
document.getElementById('printPf').onclick=()=>doPrint(buildPf());







/* ---------- v6 캐릭터 / 배지 애니메이션 ---------- */
const CHARACTER_AVATARS={"maehwabyeol":"data:image/webp;base64,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","byeolbit":"data:image/webp;base64,UklGRlINAABXRUJQVlA4IEYNAAAwRACdASrJAL4APp1Gnkqlo6KhpxLbiLATiU3bq8cIAjTPvpAbVyQgK8Fjbx+ajzhecz67f0QOmI8m7VEZcjdX8+r7gJ4AT8u0OgkvsFk6Nb8wr71TMo8r9b6nADLp26tbsoVJxX+FLi3CTCpgc4jDKzzjPmzOFO9cnn60fMytCdk2SGJn+0dv6dgXGpfTdrbXd4Yumo5+eYTGCuSJyR3X3+KsTgNH50m7/0kQFxHKu2dJFP7H803nhNQeXfBD9Y5Pfb6MuHtXMdlSuwxITPV/BkA58+rYtOhJ7YjCez7+HZmOjy8vGLZVX6wFlyhp6/lQq4WCfcAGM/kBXZZXyci338zNHbFKH/cybO9mW4ljhOVXEAVFWcbS3Zs/tvxK90+0mbArHrhdWKfNH3tzzAVOLauRzygO7suoSlDWL5DSBbn7Arcy5sXFxi4xd5MoNxtlrQhT9yxEDSGDC3rMHJTiquDzcXjVN3ATEv//0KJm/L/CI5Gt5GlpdQ4OQgcca89XruevJ7P2OAiKBpafAy7wS6zLcx5A62N8rY4isFoPTDVODvPIt+XEp2E73Om944zujcVa0vSphLvXZf7Bqt6aZqlOCoFndPkD1Qr93oI29nRSngbbOFMmq2TKUychyRISP/PyklGFpvvBxHLapXtyErqMdLkx1AqgPyaZrZZQHac3eKl/8ldpXjx1TtqfN3F4tORIodcPYZp+e8zzZn2hN3YHyQXcjr5sAAD++XZmkUrpcHUVmEqIk7R+AHntDs+mxkFBBwDhBLAAf1YSH0ycZ0umMy9ItJt7MLpyaMNKraf5B/g6wKI7tjT8bMb4WB+EqBWLKwaDck0ADd6N/GbPcVvwxwaNoHghE0glwQvQvKOP6UBH+Fe8f6JSE1aYJv6JE8vbcWVjez1TiCb+jezzf6DXucWCpXcAEmplTQF8b2qnlHiTbvHoV/OtMMPgkbEciFjn7hulqqvAGfQopTxRVCYrsHEYUIWMV0ZDW7YhOgiCQoGEZiHPw/xjnk2R+QCbU5Ie6ZopfxDOLJadcVnNvz7aQoRGgHRGoFE0/N7AY9k9B0SxFw1amDjOXj99NQUwmYtbxREOwOxUHBZtbsbIX9dRDTYXRjVpsydn5mHbNXZMJ2E7DimSXfI1b2mXnx3nIk86w2rDXzj7+HsIPsksgdcQMOwuhb++meD13XzXXGHtMmX2JqdrSoNnUj7hUqCNf1RfmkJqQcso+Chz3WJGQ8bF4tyAgFqZ2TvMrwRYcfmmaeQyHN+mt4TwCwWb0A5SK3+MiRresPoiNcP59ToUIVzMAlq9A3zpJr440hGU4+EK4i4pkMi2kYe3L5f/xLt9nRU9hEm0jsPXxXltciHAGVwOznTK8YAE6Jv9hw57BcSCKB4H1MJN5Mx39A6Q/Yv+rtWcAfYKlaX9DuDiAuguqAIgS1pf4gULN5eA+3NNPbhmbqeIcEyQ/BVObjYkO26KOsRn/X+nyMRPc1mMj7uvK/v0k6ezFFqzYu3PmHB3jJZlVuGsXL9dxsq4jS3f2KBBh0mbYS/+oGAYNBBYJejfLyp90RXRy8uFd67+mVLZcmPAa/0sLmaGXblZZQnvEzZIsaInXHTdqCVGdHTuEQxoisYkl5ydIbA/r4zodRaeh9dI69R3y0BdBvbQo/uo0/ReAGTQ/Dr30Afn8C6lejN7T+qhUZucitkNyEK4XSsgYUzn8w0O335GiaYC7CGd4n6vfLdu0jNgpswp28wTxmHJ47cqYlvfb9lNRzFKBi+34CQayQy9ieDfYmvtcI7TwnGymKfLpnPaW5LqKFu1b1RJjacZo+SEqBlUos1P1y5f0JbOHHQhv6Ou+U4UobBtdC9pqdgLsvQdCi4w6Wi7maUhbAcX1I0WfKYG9B2Ayk5PMX5FuXI4skCwWV9+LF1MaB+eOCfdgS8nCjD9WfHA66o9WP4Elrgz06/Nbb1875zEaWtxtY2hDM87PJoyLK9EOH+WRuZNpOuFJZz3NpgOgAfdLcYgVkAmMdaZtVDt/b6MYIxCNwwCdnW2ybUxfI496Tz/Cq7yuaf9axi/6y/4IEaYN93iYmBmKCAAdmgUBeRAAS7ljWhLvo5I+DDEo7c1gCM8QgmFzgbbXm8H8Id29JrpEAgn3jL80zg9iTbn5uuct+znKbhoNAOWiLel50ySzZQ+3O6VurNWJQ/wd4kKB2oRSU0BmhqnUAL7Xmbbse5swVLeo/2xxRkR4zSw/fJC8FSu4RWhttJra+t3iV978K7U5JKo9Cz2zmVXL0hphD7TVgZ6nNim+9Xt4g0b5apb/MTUSt6B4ubP5DIs8sBpkqM5QiGJMFhkxO/juVjjHEb7kWnZyg8d5MEj/zHKOJPCs4ihI+fgFxhj+yHRYJHnyPFvuXoLCGF46TIe9NWL5CRaPpvh3ahTPBu1VedWGXg2hfkfPUaNThRJjlg3AjFfDosP3/9L3ewDzQpd4x3JHSWMvKFT/fCuvkNWND3u0YbETYmB/7byfhzBwAG3NnUqM0EMDuu3nEzEyMzqwIRwUcRjra5oRDnPjCSbMlkwy+thZOMLHS1ksxDnE7WSsp0VjuYxtzVQ7O3BnpcLT6q+D1OS4iYvZydcEH8zhOivp9qRWiPOrwWRfLg0j64axy0mZSQhzAB2Cmkvw1+gDc/UWs/Qpz3rZKcwegLyRzGXZPx2ob0TlNgq3xTVs7+c3Gpu/qr5BzVTf+opoKg7l2VLX/vPcfPZxrg2AFAopq0zuCFWIYImuU3eTKqyuH4gtz490UMhyvDeAFT0vW4wf4tE9JVSR731fFduc6myqTNnPVyG9StOyfRq9leSYW7NqyFncgvLm1YglFQjRVW11NpVIGhJqsxsnNK/2tC1rhB1oN1306aGk4R7+BwBg1b+P/YvHb4jTpDy2RB6WCR0O51ZAxT/A6M/saSlxuajNG4zVSJQuKPLyrTEbcpYYSxd2LzA47gQQDLrIt5UAdqF/m77q115EP91lCg5g/4KsbZ0XaijA5WAORLK86pZx5dwOGdBhS9MlJrTD05kVZ3BmBQXYJBP6j1wpClAXQtpre/qTA2+27o49O8yiQJ53ao4TgdvRaG0V/VTKfyr2wRgRv3mTkHse1FYG/t9i9mReNzSRh0kLqqCddzBshgIaVevMhKAuV/Jxi/3D8NQbuCkvb25Ez6LkaiulAyRkxfgm2UyOQUtTiQNa0qltBTfBFVy/D7ygbfzbnrBJkiSwGl7IUIFYLJQXgXQjGnFtCe6qO3X56I/cuyyS9vRkK8eUyxDmCTG3H/o2idpFVWJFPaU5rwHC7f74kxeU4k0NKFf6IaICXWGiX/khUq7e4J1UhaNjdJ2IFD51iAJppX3NuMDY/jNYZjItm7Chehx1GDt1pLVs7Ad0fBQcK6KL1uZPGP2k0rQ89ThE0S+LROgpXl0tbRu4HW56cRYBmG79coy//lJWCLzED66dik+3ChohBkVMZO/l8i4c4K5qs26GuJj+sdqx0/0THgLiPgL9vjDmy11lYTFXMjvprgeTOHCt+zCwqdDplMK2adKHaDGU/dvj1JbHc0L9nEA8nNqPvCBTmhLzj1eWnvzTcW6mDPSBNhICDeEgjcpARYLILElTCtonwZg/Vf4QSRZofaeQ1KVwWGGzFUgIOj8l2EzfyqlDD3m6yY6QPAUm9kZ/DsRyDKHkuV+KSiZR5rZTp8XSSm5v0oMqTLPv1/ZOPwiSNChxVLm4H/tD0ce93MSSZblu8PIT6rAPFzCnoxXNJIEEPVmPrJuWWePxJPVujqg6n4BPzhXjfBw+TREq+yA11In42MTlCnsJlHHUoDc58RTHdXzsusbUnqS1VgZHTmPJLuq7fo3Hv1xZMB75qJaMRyvQhvf+vlBXTtl8mmUbQum/JlmdwtvJH5cnvQ7QdBeB6fLAENjHXpc6Dg4wCD5RTWokl8r480LN7BDd/+ozrHcI6G7vDF9tfRAOb3tcs5L9izkM5J3Cg2W4x06f07yaCxWWayTO8SMrs1avYAAEwjBe/b0tadaJfWcD3PLXmH21RWeLQ7eCz991qtN7S+0UUJqJZgajWaUOfl0Rqj2VvdHHb7FjJyvMNIIAaK2f2cHR76uh55fu/lzRFs7rYfRkrCLz4zxQj77dy2nNE1/NXfoRiMn6Vzci8dlgPqhTAuutg99DQAYUPMc17vmvFNiG8gjdreGXxyzkBshqjZAJ9pHuVPKhBrdGFgT8xkD0CMMSlobmHAQ3fmOr3vD46w23gC5aRhgcuiVlTGP2ZJhv4Ej3uvfSyOpWYn57pPvu9RKlK147e6EYXjyNjrXdINjO8PfrCkHlchdJJ+uwWfhEL7plWuGnaPkC+bjJTsbmaG2aRMMJigNChjQOjAzAALpguGRUibC+B4lYXTUcFKheebctfYjs2PADwpQ34FPsqpJ1BVqfbVLW/zhDiQXnGBw8gnuvz3MhVTdJBSn/Y9bjSQWxODN4I3m18ByE05L1ff6DxrDspj20F4FErXkgN3CE846NDaXw3syqdTDZqH2AAAAAA==","coco":"data:image/webp;base64,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","mongsil":"data:image/webp;base64,UklGRjIMAABXRUJQVlA4ICYMAAAwRACdASrcALEAPp1Gnkqlo6Khp1SrYLATiU3bq8Ox1iSOaoxbEfueIETJDE/UW+A83fmwadLvQzAuGwOAzAH1eOsGsQzIuTZqElxpPwnIYEL1j7hU8U9cY+4CSuSvO31Gy7NgVlV92axvmJUZo9vwa1rjYk+0KqSHq+9rBSx/71lCuVgatA6vE5qDs+tu7c9nNrIc89gzi5fXy2B3s4c+F6dmjfikQL0q/LBFWLNqeRiV0FOp0xxlKjenpwkhGPY8xVCoIkVjcZKIgWf0RTPzZPN54hqpWNnhb/CVjqwoVt90hn32RNrgXhdSYJpq67TkT3tTTKi/GjLIGNYgvxZJkhe8vSyyjBeKMWomd8hzUYLfnveGEwRLTwzcxDH2YvCkgCjI939cWuAr7hcMs5CQ6gmSLcHwmwPSDOfMJ1NwufvdKnSclI+UXrAsFZXkwZMXTMoCWUs+WOFVK8fNnk663g3hrLvxg+bQPfMDEbbnkMjXhTx42u6eCA919Q8/g03AuLtRf1b9ykix4XgaUooIVezIR8aSWorOfJzmCqP4fT8ZtQOV9zODr1XZ58A1oeyAFhNACeCn7H0RYOJY2gGPo92i6LflB0qK4pk/C3JSqfwwpv5T7/r4rI1NmB05MrcSkBrt7mBl2M7d7XKYipj724xad2zTGaIzcIsVdH/lR/7JX1YvjDITZMvCPYmwa/nmxKvGz3/LTU12VQhig5reodkVekBGhfVoAAD++Z6eclA14wAAwnSTroSW9x1ziWXjaLN+rA96h0CKT+xIPhB0iekfPajdsNw3PTefBHTf+rUueBsDHsk2saJmIAxn8ZiVIgPD99FDk9ABGlEQHZzR7qagXzfUqRFp5sR7pMrJw3CI8ovaPlBU7ahVtD4GE5rq61JFyPS8UFqmphGMeXUmka8zIoksSSNJIjbYkgemSCr8PZWb3gCq3DAjK3cgwTeZQOg66yZZcxKMXlvsLZQUT+gzyGwqK+ss9Ycr1Gq/xZD8pibvrM658ar8QyA+BCDvOJVkYiRHIIGKoHY4YKVja6D0rk2GiB/0fi0tutCy1Fjl2N70iQUj6EM8oQLFOD9MVuh8GJMCqIOY0eNqZgYWtBBfl1eEQRgUdu77cfr+DRBmd315XpNgELwZqjPPVvljEY1bRqFjXpl4s/s2k20QJzi8UdL1P1LG0joj9GqVwOJeexQQWGB0wc8hDyliTKKKoonM4mZZ+4m7PhDfmheRJWIKzdsesFyRBsRNlZV3odWUPfHS4YA0Tjk/kmoEDz4AOEPoGBkld0EMIcQk225QurG7k6jdVWDgiwySEknzhpASiqsYSkZAvKK4cSi38vyq1YmLM0fv8ebrrL36X23mkmIlDPvGXR5tZWp62ndUAZH9oup9Sql2BZ56lW402Gt6d9EYeeD/G0G+kP7nwF4dcW2uHzOh3672En4T7SYY18+gfXzXsHeiVzqPbqLtwtoI4dI6wj8tEa3bCRYDhMtxNoa2WOWs8BHN3GxGpvMXjsFrU+X/bg60dNqt46nUum2thdmQmgElts0mwQlHarZ8YYFHbG3h5NdAzMdDLpCDMF3lDZ9O5eTfEM40LbyumIkZmAmQZrEhN5y2xsR/AsB9/IgFrgQM/Fsomhryj6ApUuVyalN8dhT1Tp+P7ds9MAYXDT2g5RfjNHJXqSU52ke2g1ZW1OB4MM75khxHLSG14tiMV/6vskmZpU7MkO7LdL65voLQbnUEps7k0+EyoJtVtoGLSJQmdj+vTzMUZZPo5AYrDBraWgwPBl6BLxU9L+kjMVq3q/NyDmiyPMH06kRfX0b13WvIFXOT8+bJwuXWN8kfxEevSJj+cHhin3xdbmFpN13LiCh2LpnE7mejCPMY4xjjMXykmV1AghBvyFJTLjuBBOcKKlG76jrUMoZuOfbg1bsdJ/8VuO9atuceN7QRd3+Dsu/8TNrftT+TyzyI1kDFxPiqhWJQtxd3GFa2wLVNRhBmWc7lM7mF6MseHT758dqYeUW3ZDsVLOdINYLHD5VNAqgiccb9ujdNDMEpJt40ja9aoOo6/GkwjdoDyMSM5Kttr7HmFCyQ1Onr2J4yr/v+3cpn1jHCCM5t/IXE68xizeqSThdsAQW13xKTqJ+rs1YR1GqbrE//aqN1qjojGJJg8wHs0L7TPTuzJMztowkozPicJEqeT+AW/xIlGlBSHW/8BQ7RTLnLY3RLOupFCf4wBqmoLSUpKe9ZYKKa9TQ5Xba5D+1p/FOIpZaf7Atb3lSE7QpZFjGsSqvOu3MzPam75pgxtZx0yDDWuxqSi/AMhm8hc2B3al7bu/l4SobcUjGjUKxrLcLO7p611XMbcsi7KA3v+8RZpa+S64q+Q3IrZoOz2JsYjCZ00Bs3CwY5kWBtinOjX+p3uGULZgUmH3BN36n9MeWc3BbidwlwFb8tMHG0BGQNjE2nRk7tKHjmurpBnIBtJtsQBlWuw5o85Pqh+0MGv22XJjQ3dRZEsMSd2RmBRmzgOuGeASdO00S7FGCxToqZrEQTwdWoc1LvuWDKnH7ouJVm6x5lL/o0mb7sJryO7dSwywfdPL5Ox3SEzN6No2sW1ux1Jix3Uuj7ODyFm9A/tTZeBHZh1/PViFatGgD0iB2c1Ie1OJIu8hG7rWx3vkQat6h4MITRDKrfXe8OecUB93UWJFW6nTzhwJ8FW3E1/YQDm1quBuQ7B+eeirWMU4VoEQRvHtHs90ejyY1VJDNM3csZteZViXUogZwVUlJWNubSsoXpHSAbl5jEjiOYL6pRRuZluDTogSKhsNAwD79+DBdTNtt/eVuYfOP78ci4dwHoCKrfMGrYj3hNA5teHRnwMbQfxG5iJiK2NCjuD3+h1bEHSk5Ih5tPZrTbvpy5V2mrffjuWyxV6oGdBAz3W1z8HA9/sU+isLQF5umD8BvLUVc2Y/LXoixaU3zH9+bt68IN5D4AAdkwI4ki9DQHeJvplJr4JP+QAvK3gfne4kRoDnAl+Z/WCgcNRl+leEBCaRmEnwya6UnmvRkZGbUVWKiCMxxfWR7Y22C1tX6mTNs0OsYlSqAr/lnWCOlnoiH/v5EZfxbPSH+9+Vq7yzAt6hxS8Ty1rMTYJIOw+O86wqyrmIf7VcLYisImRM3co2BFNF+qiMm/N3AlMaj5yhjdUGnVuMhQWB+jZzter5pU9yu6STfL/XiqtPjrinnznmxun0uQ29frZJVvHZ2V9VspMy4J+u7QKxcnidXPHXWTuEiu24rtusfqB/eRmf3pmW1MimRkYnz9jmWauBS+9uE7adwh5tP2oh+UYK41Z5z9orn82tSVHVNO1UqWryNuCkKVtMHrXu9L1NEKvII/YemMmiWm0DGLeykZcw5DIKx5LfSYrVG7Od8fQiTR7BucshLcaUnlpc4IqTu8QqBN9HEiIfmN2+I8TYtu0vweKigeMl8+VXBnNB795XQAowFDBepR9J/bh9cWmnbHGyhy9HQu7i+T/1McGndwwjNLdX1pHLgUzTwb9uDIbrTZ6dLT0PctFyIZ2x5C1q7HBtgzpTdK1dMM7WJ+evlb5d1tdJpxJ+ygoMG2CoFQab3tSmDwQ4+bxmySPBXMMw7DvD0IxmqmQnP9C/UAs1T3v1sZC477I7c1+8y/shA7ftD4fRvWzj2POwZ8OfwXwZPVcULtun+Hclky3gXsq9f7qZ55ns3v5Az/NrtnxJj3CuM77MGCrqBIRPz806DE2weewe+kGqfFP1/RgAAyIZqYegBCE0P7Ci/YEHSAdPPkwmEUTIi19Etg4JDyyJGSUiCgN9PYpAF25/HXhdBdGRKvMZqo3MSUFMX89mFOy/ddDLzETUc7sVzAuJrd2Yy/D1qr7J09KNIABr+THvvTqmaNkdxLWSEEqheGhMpjhi8acbecluL5fZTzJDFy3/WI4BgiXTUUna7Yf1PiBhEmqAAxTmUgpgrI5gVNQ7tdw3clS51sAkeE2u4yAiFUwWcqaN38ViAYd4JNUEhF5EDd2iuoAgZsfcjJ4TPQ3jnw0QcdL3D4cv0PVZe4i8HAU6ricvWCrYHvHlatr3Y6vKmHPNzaC45ZWOrrOKdCiG6bNCD8vbXxMEZPEVuoy58ldd8uXHMyL8DYV5E7LdkENAAApa2D1rkIKwNLwAAAAA==","tori":"data:image/webp;base64,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","rumi":"data:image/webp;base64,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"};
function hydrateCharacterImages(){
  document.querySelectorAll('[data-char-image]').forEach(img=>{
    const id=img.getAttribute('data-char-image');
    if(CHARACTER_AVATARS[id] && !img.getAttribute('src')) img.setAttribute('src',CHARACTER_AVATARS[id]);
  });
}
hydrateCharacterImages();

const CHAR_KEY='phonefree100-character';
let ACTIVE_CHAR={id:'maehwabyeol',name:'매화별',say:'오늘 피운 작은 습관이 100일 뒤 멋진 꽃이 될 거야!'};


/* ===== v7.5 개인정보 보호 유틸 ===== */
function maskStudentCode(code){
  code=String(code||'');
  if(!code)return '';
  if(code.length<=4)return '••••';
  return code.slice(0,Math.min(4,code.length-2))+'••••';
}

/* ===== v7.3 Web Audio 효과음 ===== */
let SOUND_ON = localStorage.getItem('phonefree_sound') !== 'off';
let _audioCtx = null;
function audioCtx(){
  if(!_audioCtx){
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(Ctx) _audioCtx=new Ctx();
  }
  if(_audioCtx && _audioCtx.state==='suspended') _audioCtx.resume();
  return _audioCtx;
}
function tone(freq=440,dur=.10,type='sine',gain=.035,delay=0){
  if(!SOUND_ON)return;
  const ctx=audioCtx(); if(!ctx)return;
  const o=ctx.createOscillator(), g=ctx.createGain();
  const t=ctx.currentTime+delay;
  o.type=type;o.frequency.setValueAtTime(freq,t);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(gain,t+.015);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+dur+.02);
}
function sfx(kind){
  if(!SOUND_ON)return;
  try{
    if(kind==='star'){ tone(660,.10,'sine',.045); tone(880,.13,'sine',.04,.09); tone(1046,.16,'triangle',.035,.19); }
    else if(kind==='part'){ tone(523,.10,'triangle',.035); tone(659,.14,'triangle',.035,.10); }
    else if(kind==='retry'){ tone(440,.10,'sine',.03); tone(523,.13,'sine',.035,.11); }
    else if(kind==='save'){ tone(784,.08,'sine',.035); tone(987,.12,'sine',.04,.08); }
    else if(kind==='level'){ tone(523,.10,'triangle',.035); tone(659,.10,'triangle',.04,.09); tone(784,.11,'triangle',.045,.18); tone(1046,.20,'sine',.04,.28); }
    else if(kind==='milestone'){ tone(523,.09,'triangle',.035); tone(659,.09,'triangle',.038,.08); tone(784,.09,'triangle',.04,.16); tone(1046,.18,'sine',.045,.25); tone(1318,.22,'sine',.035,.42); }
    else if(kind==='roulette'){ tone(330,.05,'square',.018); tone(392,.05,'square',.018,.06); tone(494,.05,'square',.018,.12); tone(659,.11,'sine',.035,.19); }
    else if(kind==='click'){ tone(520,.045,'sine',.018); }
  }catch(e){}
}
function syncSoundButton(showToast=false){
  const b=document.getElementById('soundToggle'), t=document.getElementById('soundToast');
  if(b){b.textContent=SOUND_ON?'🔊':'🔇';b.classList.toggle('off',!SOUND_ON);b.title=SOUND_ON?'효과음 끄기':'효과음 켜기';}
  if(showToast&&t){
    t.textContent=SOUND_ON?'효과음 켜짐':'효과음 꺼짐';t.classList.add('on');
    clearTimeout(window._soundToastTimer);window._soundToastTimer=setTimeout(()=>t.classList.remove('on'),1200);
  }
}
function bindSoundToggle(){
  const b=document.getElementById('soundToggle'); if(!b)return;
  syncSoundButton(false);
  b.onclick=()=>{
    SOUND_ON=!SOUND_ON;
    localStorage.setItem('phonefree_sound',SOUND_ON?'on':'off');
    syncSoundButton(true);
    if(SOUND_ON)sfx('save');
  };
}
document.addEventListener('DOMContentLoaded',bindSoundToggle);

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.nav button,.character-choice').forEach(el=>{
    el.addEventListener('click',()=>sfx('click'));
  });
});



const CHARACTER_PROFILES={
  maehwabyeol:{
    preferred:['A','F'], accessory:['🌱','🌸','🎒','⭐','👑','✨'],
    stages:['씨앗','꽃봉오리','매화 탐험가','빛나는 매화별','매화 리더','100일의 기적'],
    star:['오늘도 좋은 습관 하나가 활짝 피었어!','해냈다! 매화별도 같이 반짝반짝해!'],
    part:['완벽하지 않아도 괜찮아. 오늘도 조금 자랐어!','노력한 오늘도 소중한 꽃잎 하나야.'],
    retry:['다시 피면 돼. 내일은 새 꽃잎부터 시작하자!','괜찮아! 다시 시작하는 것도 멋진 힘이야.']
  },
  byeolbit:{
    preferred:['S','A'], accessory:['🚀','🛰️','🌙','🪐','🌟','🌌'],
    stages:['출발 준비','첫 비행','달 탐험가','행성 탐험가','별빛 대장','은하 완주'],
    star:['미션 성공! 오늘도 우주 한 칸 전진!','멋져! 별빛 속도가 더 빨라졌어!'],
    part:['조금 전진해도 전진이야. 계속 가자!','연료를 채우는 날도 필요한 법이야.'],
    retry:['경로를 다시 잡으면 돼. 내일 재출발!','우주 탐험에는 다시 출발하는 날도 있어!']
  },
  coco:{
    preferred:['R','M'], accessory:['🔋','📡','⚙️','💡','🏅','🤖'],
    stages:['부팅','데이터 수집','습관 분석','성장 업그레이드','마스터 모드','100일 완료'],
    star:['성공 데이터 저장 완료! 아주 좋아!','좋은 습관 수치가 올라갔어!'],
    part:['노력 데이터도 중요한 기록이야!','조금씩 업그레이드 중이야.'],
    retry:['오류가 아니라 학습 데이터야. 다시 실행!','재부팅 완료! 내일 다시 해보자.']
  },
  mongsil:{
    preferred:['S','F'], accessory:['🐾','🧣','🎾','🏅','🦴','🎉'],
    stages:['첫 산책','신나는 친구','활동 대장','튼튼한 몽실','응원 대장','100일 챔피언'],
    star:['멍! 오늘 진짜 잘했어! 같이 뛰고 싶다!','최고야! 꼬리가 절로 흔들려!'],
    part:['조금 해낸 것도 멋져! 멍!','오늘 노력한 만큼 내일 더 쉬워질 거야!'],
    retry:['괜찮아! 내일 다시 같이 뛰자!','한 번 쉬고 다시 출발하면 돼. 멍!']
  },
  tori:{
    preferred:['R','A'], accessory:['🥕','📚','🎨','🎀','🌷','✨'],
    stages:['작은 토끼','책친구','상상 탐험가','마음 성장','다정한 리더','100일 토리'],
    star:['오늘의 너, 정말 멋졌어. 토리가 기억할게!','차근차근 해낸 네가 참 대단해!'],
    part:['천천히 해도 괜찮아. 오늘도 한 걸음이야.','조금씩 자라는 모습이 보여!'],
    retry:['괜찮아. 내일은 새로운 페이지야.','오늘은 쉬어가고 내일 다시 시작하자.']
  },
  rumi:{
    preferred:['R','F'], accessory:['🔎','🗺️','⭐','🧭','🏆','🌠'],
    stages:['단서 찾기','별지도 발견','습관 탐정','미션 해결사','별여우 리더','100일 탐험왕'],
    star:['성공 단서 발견! 오늘의 미션 해결!','역시 멋진 선택이었어. 다음 단서도 찾아보자!'],
    part:['중요한 단서를 하나 찾았어. 충분해!','완벽하지 않아도 성장의 흔적은 남아 있어.'],
    retry:['실패가 아니라 다음 미션의 힌트야!','좋아, 방법을 바꿔서 다시 도전해보자!']
  }
};
const LEVEL_DAYS=[0,10,30,50,70,100];
function charProfile(){return CHARACTER_PROFILES[ACTIVE_CHAR.id]||CHARACTER_PROFILES.maehwabyeol;}
function characterLevel(recorded){
  if(recorded>=100)return 6;if(recorded>=70)return 5;if(recorded>=50)return 4;if(recorded>=30)return 3;if(recorded>=10)return 2;return 1;
}
function characterResultLine(result){
  const list=charProfile()[result]||[ACTIVE_CHAR.say||'오늘도 잘했어!'];
  const day=todayIdx();
  return list[Math.abs(day)%list.length];
}

function getActivityBalance(){
  const c={R:0,A:0,S:0,F:0};
  (S.acts||[]).forEach(a=>{
    if(!a||a.use===false)return;
    let k=a.cat||'';
    if(k==='M')k='A'; // 기존 음악 기록은 예술(A)에 포함
    if(c[k]!==undefined)c[k]++;
  });
  return c;
}
function getBalanceStatus(){
  const c=getActivityBalance(),v=Object.values(c),total=v.reduce((a,b)=>a+b,0),min=Math.min(...v),max=Math.max(...v);
  const coverage=total?v.filter(x=>x>0).length/4:0, evenness=max?min/max:0;
  const score=Math.round((coverage*.6+evenness*.4)*100);
  let title='🌱 시작하는 탐험가';
  if(score>=85&&total>=12)title='👑 균형 성장 마스터';
  else if(score>=70&&total>=8)title='🌈 균형 잡힌 탐험가';
  else if(score>=45&&total>=4)title='⭐ 성장하는 탐험가';
  return {counts:c,total,score,title};
}
function renderBalance(){
  const b=getBalanceStatus(), vals=Object.values(b.counts), min=Math.min(...vals), max=Math.max(...vals);
  document.querySelectorAll('[data-balance]').forEach(el=>{
    const k=el.dataset.balance,n=b.counts[k]||0,bb=el.querySelector('b');if(bb)bb.textContent=n;
    el.classList.toggle('low',b.total>0&&n===min&&min<max);el.classList.toggle('good',b.total>0&&n>min);
  });
  const msg=document.getElementById('balanceMsg');if(!msg)return;
  const names={R:'독서',A:'예술',S:'스포츠',F:'관계'};
  const needs=Object.keys(b.counts).filter(k=>b.counts[k]===min).map(k=>names[k]);
  msg.textContent=b.total===0?'📚 독서 · 🎨 예술 · ⚽ 스포츠 · 🤝 관계를 골고루 해보자!':
    b.score>=85?'🌈 아주 균형 있게 성장하고 있어!':'다음 추천: '+needs.join(' · ')+' 활동';
}


function maybePlayLevelUp(){
  if(typeof S==='undefined')return;
  const recorded=Object.values(S.days||{}).filter(d=>d&&d.r).length;
  const level=characterLevel(recorded);
  const code=(S.info&&S.info.code)||'student';
  const key='phonefree_level_'+code;
  const prev=Number(localStorage.getItem(key)||level);
  if(level>prev)sfx(level>=6?'milestone':'level');
  localStorage.setItem(key,String(level));
}

function renderCharacterGrowth(){
  if(typeof S==='undefined')return;
  const recorded=Object.values(S.days||{}).filter(d=>d&&d.r).length;
  const level=characterLevel(recorded);
  const p=charProfile();
  const src=CHARACTER_AVATARS[ACTIVE_CHAR.id]||CHARACTER_AVATARS.maehwabyeol;
  const av=document.getElementById('cgAvatar'); if(av)av.innerHTML='<img src="'+src+'" alt="'+ACTIVE_CHAR.name+'">';
  const name=document.getElementById('cgName'); if(name)name.textContent=ACTIVE_CHAR.name;
  const lv=document.getElementById('cgLevel'); if(lv)lv.textContent='LV.'+level;
  const st=document.getElementById('cgStage'); if(st)st.textContent=p.stages[level-1];
  const ac=document.getElementById('cgAccessory'); if(ac)ac.textContent=p.accessory[level-1];
  const next=level<6?LEVEL_DAYS[level]:100;
  const prev=LEVEL_DAYS[level-1];
  const pct=level===6?100:Math.max(0,Math.min(100,(recorded-prev)/(next-prev)*100));
  const bar=document.getElementById('cgBar'); if(bar)bar.style.width=pct+'%';
  const nx=document.getElementById('cgNext'); if(nx)nx.textContent=level===6?'완주!':Math.max(0,next-recorded)+'일';
  const cp=document.getElementById('cgCopy');
  if(cp)cp.textContent=level===6?'100일 동안 함께 성장했어!':recorded+'일 기록 완료 · '+p.stages[level-1]+' 단계';
  const cr=document.getElementById('crAvatar'); if(cr)cr.innerHTML='<img src="'+src+'" alt="'+ACTIVE_CHAR.name+'">';
  const crt=document.getElementById('crTitle'); if(crt)crt.textContent=ACTIVE_CHAR.name+'의 추천';
  const crc=document.getElementById('crCopy'); if(crc)crc.textContent='부족한 활동을 먼저 찾아 골고루 추천해줄게!';
  renderBalance();
}


function loadCharacter(){
  try{
    const saved=JSON.parse(localStorage.getItem(CHAR_KEY)||'null');
    if(saved&&saved.id){ACTIVE_CHAR=saved;}
  }catch(e){}
  applyCharacter();
}
function applyCharacter(){
  const src=CHARACTER_AVATARS[ACTIVE_CHAR.id]||CHARACTER_AVATARS.maehwabyeol;
  const hc=document.getElementById('heroChar');
  if(hc) hc.innerHTML='<img src="'+src+'" alt="'+ACTIVE_CHAR.name+'">';
  const hn=document.getElementById('heroCharName'); if(hn) hn.textContent=ACTIVE_CHAR.name;
  const cc=document.getElementById('companionChar');
  if(cc){cc.innerHTML='<img src="'+src+'" alt="'+ACTIVE_CHAR.name+'">';cc.classList.toggle('maehwa',ACTIVE_CHAR.id==='maehwabyeol');}
  document.querySelectorAll('.character-choice').forEach(b=>b.classList.toggle('on',b.dataset.charId===ACTIVE_CHAR.id));
  renderCharacterGrowth();
}
document.querySelectorAll('.character-choice').forEach(b=>b.onclick=()=>{
  ACTIVE_CHAR={id:b.dataset.charId,name:b.dataset.name,say:b.dataset.say||'오늘도 한 걸음이면 충분해!'};
  localStorage.setItem(CHAR_KEY,JSON.stringify(ACTIVE_CHAR));
  applyCharacter();
  buddySay(ACTIVE_CHAR.name+'와 100일 여행 시작! '+ACTIVE_CHAR.say);
});
loadCharacter();

function buddySay(msg){
  const b=document.getElementById('companionBubble'); if(!b)return;
  b.textContent=msg;b.classList.add('show');
  clearTimeout(window.__buddyTimer);
  window.__buddyTimer=setTimeout(()=>b.classList.remove('show'),2600);
}
setTimeout(()=>buddySay(ACTIVE_CHAR.say||'오늘도 한 걸음이면 충분해!'),1100);

const BADGES={
  10:{icon:'🌱',title:'첫걸음 배지',text:'10일 동안 꾸준히 기록했어!'},
  30:{icon:'🌿',title:'습관 배지',text:'30일! 새로운 습관이 자라고 있어.'},
  50:{icon:'🌳',title:'반환점 배지',text:'절반을 넘었어. 정말 대단해!'},
  70:{icon:'🏆',title:'도전자 배지',text:'70일까지 왔어. 끝이 보이기 시작해!'},
  100:{icon:'✨',title:'100일 완주 배지',text:'100일의 기적을 완성했어!'}
};
function makeConfetti(){
  const wrap=document.getElementById('confetti'); if(!wrap)return;
  wrap.innerHTML='';
  const icons=['⭐','✨','🎉','💫','🌟'];
  for(let i=0;i<28;i++){
    const el=document.createElement('i');
    el.textContent=icons[i%icons.length];
    el.style.left=(Math.random()*100)+'vw';
    el.style.animationDuration=(2.1+Math.random()*1.9)+'s';
    el.style.animationDelay=(Math.random()*.45)+'s';
    el.style.fontSize=(14+Math.random()*18)+'px';
    wrap.appendChild(el);
  }
  setTimeout(()=>wrap.innerHTML='',4500);
}
function showBadge(n){
  const d=BADGES[n]; if(!d)return;
  const t=document.getElementById('badgeToast');
  document.getElementById('badgeToastIcon').textContent=d.icon;
  document.getElementById('badgeToastTitle').textContent=d.title+' 획득!';
  document.getElementById('badgeToastText').textContent=d.text;
  t.classList.add('on'); makeConfetti();
}
function checkNewBadges(){
  const recorded=Object.keys(S.days||{}).filter(k=>S.days[k]&&S.days[k].r).length;
  for(const n of [10,30,50,70,100]){
    if(recorded>=n){
      const key='phonefree100-badge-'+n+'-'+(CODE||'student');
      if(!localStorage.getItem(key)){
        localStorage.setItem(key,'1');
        showBadge(n);
        buddySay(ACTIVE_CHAR.name+'도 신났어! '+n+'일 배지를 얻었어!');
        break;
      }
    }
  }
}
const btc=document.getElementById('badgeToastClose');
if(btc)btc.onclick=()=>document.getElementById('badgeToast').classList.remove('on');



/* ===== v7.9 30·50·70·100일 중간 성장 기록일 알림 ===== */
const GROWTH_DAYS={
  30:{icon:'🌱',label:'30일',copy:'30일 동안 처음 달라진 점을 떠올려 한두 문장으로 남겨봐.'},
  50:{icon:'🌳',label:'50일',copy:'절반까지 왔어! 가장 힘들었던 순간과 어떻게 버텼는지 기록해봐.'},
  70:{icon:'🪐',label:'70일',copy:'폰 대신 새롭게 발견한 활동이나 달라진 생활을 기록해봐.'},
  100:{icon:'✨',label:'100일',copy:'100일 완주! 처음과 비교해 내가 가장 성장한 점을 내 말로 남겨봐.'}
};
function currentGrowthDay(){const n=todayIdx();return GROWTH_DAYS[n]?n:null;}
function growthDayIsWritten(n){return !!(S.milestones&&String(S.milestones[n]||'').trim());}
function maybeShowGrowthDayPopup(){
  const n=currentGrowthDay(); if(!n||growthDayIsWritten(n))return;
  const o=document.getElementById('growthDayOverlay'); if(!o)return;
  const d=GROWTH_DAYS[n];
  document.getElementById('growthDayIcon').textContent=d.icon;
  document.getElementById('growthDayNum').textContent=d.label;
  document.getElementById('growthDayCopy').textContent=d.copy+' 오늘 기록해 두면 마지막 성장 수기가 훨씬 쉬워져!';
  o.dataset.day=n; o.classList.add('on');
}
function goToTodayGrowthRecord(){
  const n=currentGrowthDay()||Number(document.getElementById('growthDayOverlay')?.dataset.day)||30;
  const o=document.getElementById('growthDayOverlay'); if(o)o.classList.remove('on');
  openStudentPage('print');
  setTimeout(()=>{
    const e=document.getElementById('ms'+n);
    if(e){e.scrollIntoView({behavior:'smooth',block:'center'});e.focus();e.classList.add('milestone-focus');setTimeout(()=>e.classList.remove('milestone-focus'),2400);}
  },180);
}
const gdGo=document.getElementById('growthDayGo'); if(gdGo)gdGo.onclick=goToTodayGrowthRecord;
const gdLater=document.getElementById('growthDayLater'); if(gdLater)gdLater.onclick=()=>document.getElementById('growthDayOverlay').classList.remove('on');

/* ---------- v5 완주 축하 ---------- */
function maybeCelebrate100(){
  const recorded=Object.keys(S.days||{}).filter(k=>S.days[k]&&S.days[k].r).length;
  if(recorded<100) return;
  const key='phonefree100-celebrated-'+(CODE||'student');
  if(localStorage.getItem(key)) return;
  localStorage.setItem(key,'1');
  const o=document.getElementById('finishOverlay'); if(o)o.classList.add('on');
}
const fc=document.getElementById('finishClose'); if(fc)fc.onclick=()=>document.getElementById('finishOverlay').classList.remove('on');
const fp=document.getElementById('finishToPrint'); if(fp)fp.onclick=()=>{document.getElementById('finishOverlay').classList.remove('on');openStudentPage('print');};

/* ---------- v4 대시보드 내비게이션 ---------- */
function openStudentPage(name){
  const tab=document.querySelector('.tabs button[data-p="'+name+'"]');
  if(tab) tab.click();
  document.querySelectorAll('.desktop-nav button').forEach(x=>x.classList.toggle('on',x.dataset.p===name && !x.dataset.scroll));
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.desktop-nav button').forEach(b=>b.onclick=()=>{
  const p=b.dataset.p||'home';
  openStudentPage(p);
  if(b.dataset.scroll) setTimeout(()=>{const e=document.getElementById(b.dataset.scroll);if(e)e.scrollIntoView({behavior:'smooth',block:'start'});},120);
});
document.querySelectorAll('[data-go-page]').forEach(b=>b.onclick=()=>openStudentPage(b.dataset.goPage));
document.querySelectorAll('[data-go-page]').forEach(b=>b.addEventListener('click',()=>buddySay('좋아! 새로운 활동을 찾아보자 😊')));

['missionTime','missionResult','missionNote'].forEach(id=>{const b=document.getElementById(id);if(b)b.onclick=()=>document.getElementById('recordEditor').scrollIntoView({behavior:'smooth',block:'center'});});
const gq=document.getElementById('growthQuick');
if(gq)gq.onclick=()=>{openStudentPage('print');setTimeout(()=>{const e=document.getElementById('ms30');if(e)e.scrollIntoView({behavior:'smooth',block:'center'});},150);};


/* 결과 선택에 따라 질문도 바로 바뀜 */
document.querySelectorAll('.choice').forEach(b=>b.addEventListener('click',()=>{
  const p=document.getElementById('promptBox');
  if(p)p.textContent=getAdaptivePrompt(sel,b.dataset.v);
  const pm=document.getElementById('promptMode');
  if(pm)pm.textContent=b.dataset.v==='star'?'⭐ 성공한 날 질문':b.dataset.v==='part'?'△ 노력한 날 질문':'↺ 다시 도전하는 날 질문';
}));


/* 캐릭터가 오늘 결과에 반응 */
document.querySelectorAll('.choice').forEach(b=>b.addEventListener('click',()=>{
  sfx(b.dataset.v);
  const line=characterResultLine(b.dataset.v);
  buddySay(line);
  const editor=document.getElementById('recordEditor');
  if(editor){
    let box=editor.querySelector('.result-buddy-line');
    if(!box){box=document.createElement('div');box.className='result-buddy-line';editor.querySelector('.choices').after(box);}
    box.textContent=ACTIVE_CHAR.name+' : “'+line+'”';
  }
}));

/* ---------- 학생경험 강화 ---------- */
function renderCollections(){
  const a=S.acts||[];
  const count=k=>a.filter(x=>x&&x.use!==false&&(k==='A'?(x.cat==='A'||x.cat==='M'):x.cat===k)).length;
  [['colR','R'],['colA','A'],['colS','S'],['colF','F']].forEach(z=>{const e=document.getElementById(z[0]);if(e)e.textContent=count(z[1])+'개';});
}
function renderMilestones(){
  S.milestones=S.milestones||{};
  [30,50,70,100].forEach(n=>{const e=document.getElementById('ms'+n);if(e)e.value=S.milestones[n]||'';});
}
function saveMilestones(){
  S.milestones=S.milestones||{};
  [30,50,70,100].forEach(n=>{const e=document.getElementById('ms'+n);if(e)S.milestones[n]=e.value.trim();});
  persist(); renderGrowthEvidence();
}
const sm=document.getElementById('saveMilestones');
if(sm)sm.onclick=()=>{
  saveMilestones();
  const gd=currentGrowthDay();
  if(gd&&growthDayIsWritten(gd)){
    const o=document.getElementById('growthDayOverlay'); if(o)o.classList.remove('on');
    buddySay(gd+'일 중간 성장 기록 완료! 잘했어 🌟');
  }
  sm.textContent='저장했어 ✓';
  setTimeout(()=>sm.textContent='중간 성장 기록 저장',1300);
};
const gt=document.getElementById('goToday');
if(gt)gt.onclick=()=>document.getElementById('recordFocus').scrollIntoView({behavior:'smooth'});
document.querySelectorAll('.qgo').forEach(b=>b.onclick=()=>{
  if(b.dataset.go==='play'){const t=document.querySelector('.tabs button[data-p="play"]');if(t)t.click();}
  else document.getElementById('recordFocus').scrollIntoView({behavior:'smooth'});
});

/* ---------- [2-3] 변화·성장 수기 ---------- */
const GROWTH_IDS=['Story','Change','Growth','Trip'];

function growthRecordSummary(){
  const days=Object.values(S.days||{}).filter(Boolean);
  const recorded=days.filter(d=>d.r).length;
  const stars=days.filter(d=>d.r==='star').length;
  const parts=days.filter(d=>d.r==='part').length;
  const retries=days.filter(d=>d.r==='retry').length;
  const mins=days.reduce((sum,d)=>sum+(Number(d.min)||0),0);
  const bal=getBalanceStatus();
  return {recorded,stars,parts,retries,mins,bal};
}
function renderGrowthEvidence(){
  const stats=document.getElementById('growthEvidenceStats');
  if(!stats)return;
  const x=growthRecordSummary(), c=x.bal.counts;
  stats.innerHTML=
    '<div class="ge-stat"><b>'+x.recorded+'일</b><span>기록</span></div>'+
    '<div class="ge-stat"><b>'+x.stars+'개</b><span>★ 성공</span></div>'+
    '<div class="ge-stat"><b>'+x.retries+'번</b><span>↺ 다시 도전</span></div>'+
    '<div class="ge-stat"><b>'+x.bal.score+'점</b><span>활동 균형도</span></div>';

  const names={R:'📚 독서',A:'🎨 예술',S:'⚽ 스포츠',F:'🤝 관계'};
  const vals=Object.entries(c);
  const min=Math.min(...vals.map(v=>v[1])), max=Math.max(...vals.map(v=>v[1]));
  const low=vals.filter(v=>v[1]===min).map(v=>names[v[0]]);
  const high=vals.filter(v=>v[1]===max).map(v=>names[v[0]]);
  document.getElementById('growthEvidenceBalance').innerHTML=
    '<strong>R·A·S·관계 실제 활동:</strong> '+
    names.R+' '+c.R+'회 · '+names.A+' '+c.A+'회 · '+names.S+' '+c.S+'회 · '+names.F+' '+c.F+'회<br>'+
    (x.bal.total===0?'아직 포트폴리오에 저장된 활동이 없어요.':
      (x.bal.score>=85?'네 영역을 아주 고르게 경험했어요.':
       '많이 한 영역: '+high.join(' · ')+' / 더 경험해볼 영역: '+low.join(' · ')));

  const usable=(S.acts||[]).filter(a=>a&&a.use!==false).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const recent=usable.slice(0,4);
  document.getElementById('growthEvidenceActs').innerHTML=recent.length
    ? recent.map(a=>{
        const raw=a.cat==='M'?'A':a.cat;
        const nm=names[raw]||'활동';
        const feel=a.feel?'<br>느낀 점: '+esc(a.feel):'';
        return '<div class="ge-act"><b>'+nm+'</b> '+esc(fmtDate(a.date))+' '+esc(a.what||'')+feel+'</div>';
      }).join('')
    : '<div class="ge-act">아직 활동 기록이 없어요. 포트폴리오에 실제로 한 활동을 먼저 저장해보세요.</div>';

  const milestoneTexts=[30,50,70,100].map(n=>(S.milestones&&S.milestones[n])?n+'일: '+S.milestones[n]:'').filter(Boolean);
  let q='위 기록을 보고 “가장 기억에 남는 활동은 무엇이었는지 → 왜 의미 있었는지 → 그 활동 뒤 내가 어떻게 달라졌는지” 순서로 직접 써보세요.';
  if(x.retries>0) q+=' 다시 도전한 경험 '+x.retries+'번도 성장의 근거가 될 수 있어요.';
  if(milestoneTexts.length) q+=' 중간 성장 기록도 떠올려 보세요: '+esc(milestoneTexts[milestoneTexts.length-1]);
  document.getElementById('growthEvidencePrompt').innerHTML='✍️ <b>내가 직접 써볼 질문</b><br>'+q;
}

function renderGrowth(){
  S.growth=S.growth||{};
  GROWTH_IDS.forEach(k=>{ const el=document.getElementById('gr'+k); if(el) el.value=S.growth[k]||''; });
  renderGrowthEvidence();
}
function saveGrowth(){
  S.growth=S.growth||{};
  GROWTH_IDS.forEach(k=>{ const el=document.getElementById('gr'+k); if(el) S.growth[k]=el.value.trim(); });
  persist();
}
GROWTH_IDS.forEach(k=>{
  const el=document.getElementById('gr'+k);
  if(el) el.onchange=saveGrowth;
});
document.getElementById('saveGrowth').onclick=()=>{
  saveGrowth(); const b=document.getElementById('saveGrowth'); b.textContent='저장했어 ✓'; setTimeout(()=>b.textContent='2-3 초안 저장',1500);
};

function buildGrowth(ST){ ST=ST||S;
  const g=ST.growth||{};
  return '<div class="pr-page">'
    +officialHead('서식2','「폰 프리 100일의 기적」우수학생 선정 공모 양식')
    +'<div class="section-title">[2-3] 변화·성장 수기 및 탐방 계획</div>'
    +'<table class="pr pf growth-table">'
    +'<tr><th>나의<br>실천<br>수기</th><td><div class="qtext">100일 동안 스마트폰을 가장 사용하고 싶었던 순간은 언제였나요? 그때 어떻게 대응했고, 실패했더라도 어떻게 다시 시작했는지 구체적으로 적어주세요.</div>'+esc(g.Story||'')+'</td></tr>'
    +'<tr><th>나의<br>변화</th><td><div class="qtext">학습, 친구·가족 관계, 취미, 수면·생활 리듬 등에서 실제로 달라진 점을 전·후 사례 중심으로 적어주세요.</div>'+esc(g.Change||'')+'</td></tr>'
    +'<tr><th>나의<br>성장</th><td><div class="qtext">- R·A·S·관계 활동 가운데 가장 의미 있었던 활동과 그 이유, 새롭게 알게 된 나의 모습을 적어주세요.<br>- 아래 내용은 학생이 자신의 실제 기록을 참고해 직접 작성한 내용입니다.</div>'+esc(g.Growth||'')+'</td></tr>'
    +'<tr><th>탐방<br>계획</th><td><div class="qtext">항저우에서 무엇을 보고·묻고·배우고 싶은지, 탐방 후 학생자치회·학급·동아리·가족·지역사회에 어떻게 공유하고 실천을 이어갈지 적어주세요.</div>'+esc(g.Trip||'')+'</td></tr>'
    +'</table>'
    +'<div class="pr-small">※ 제출물은 학생 본인이 직접 작성하며, AI 생성문을 그대로 제출하거나 타인이 대신 작성한 사실이 확인될 경우 심사에서 제외될 수 있습니다. AI는 맞춤법 확인·아이디어 정리 등 보조적으로 활용할 수 있으나 최종 내용은 자신의 실제 경험을 바탕으로 작성해야 합니다.</div>'
    +'</div>';
}
function buildRecommendation(ST){ ST=ST||S;
  const i=ST.info||{}, cls=esc(i.cls||'');
  return '<div class="pr-page">'
    +officialHead('서식3','「폰 프리 100일의 기적」학교장 추천서 양식')
    +'<div class="rec-title">학교장 추천서</div>'
    +'<div class="rec-body">위 학생은 \'폰프리 100일 실천\' 프로그램에 성실히 참여하여 스마트폰 과의존을 슬기롭게 극복하고, 자기주도적 생활 습관 형성과 건전한 학교 디지털 문화 조성에 솔선수범하며 건강한 디지털 시민 문화 조성에 크게 기여하였기에 우수학생으로 적극 추천합니다.</div>'
    +'<div class="rec-date">2026년 12월 &nbsp;&nbsp;&nbsp;일</div>'
    +'<table class="pr pr-info" style="margin-top:10mm"><tr><th style="width:22%">학교명</th><td>'+esc(i.school||'')+'</td></tr><tr><th>학년 반</th><td>'+cls+'</td></tr><tr><th>이 름</th><td>'+esc(i.name||'')+'</td></tr></table>'
    +'<div class="rec-sign">'+esc(i.school||'')+'장 (직인)</div>'
    +'</div>';
}
document.getElementById('printGrowth').onclick=()=>{ saveGrowth(); doPrint(buildGrowth()); };
document.getElementById('printAllSubmit').onclick=()=>{ saveGrowth(); doPrint(buildSheet()+buildPf()+buildGrowth()); };


/* ---------- 선생님 화면 ---------- */
let TPW=null, TLIST=[];
document.getElementById('tlink').onclick=()=>{ document.getElementById('tbox').classList.toggle('hidden'); };

const adminEntryTop=document.getElementById('adminEntryTop');
const adminModal=document.getElementById('adminModal');
const adminPw=document.getElementById('adminPw');
const adminLoginBtn=document.getElementById('adminLoginBtn');
const adminLoginMsg=document.getElementById('adminLoginMsg');
const adminModalClose=document.getElementById('adminModalClose');
const adminPwToggle=document.getElementById('adminPwToggle');

if(adminEntryTop) adminEntryTop.onclick=()=>{
  adminModal.classList.add('on');
  setTimeout(()=>adminPw.focus(),80);
};
if(adminModalClose) adminModalClose.onclick=()=>adminModal.classList.remove('on');
if(adminPwToggle) adminPwToggle.onclick=()=>{
  const showing=adminPw.type==='text';
  adminPw.type=showing?'password':'text';
  adminPwToggle.textContent=showing?'보기':'숨기기';
  adminPw.focus();
};
function adminSubmit(){
  const pw=(adminPw.value||'').trim();
  if(!pw){
    adminLoginMsg.textContent='비밀번호를 입력해 주세요.';
    adminLoginMsg.className='teacher-login-msg error';
    adminPw.focus();
    return;
  }
  // 기존 교사 로그인 입력창과 흐름을 그대로 재사용
  document.getElementById('tpw').value=pw;
  TPW=pw;
  adminLoginBtn.disabled=true;
  adminLoginBtn.textContent='확인 중…';
  google.script.run.withSuccessHandler(r=>{
    adminLoginBtn.disabled=false;
    adminLoginBtn.textContent='학급 현황 열기';
    if(!r || !r.ok){
      adminLoginMsg.textContent=(r&&r.msg)||'비밀번호를 확인해 주세요.';
      adminLoginMsg.className='teacher-login-msg error';
      return;
    }
    TLIST=Array.isArray(r.list)?r.list:[];
    adminModal.classList.remove('on');
    document.getElementById('login').classList.add('hidden');
    document.getElementById('teacher').classList.remove('hidden');
    renderTeacher();
    window.scrollTo({top:0,behavior:'instant'});
  }).withFailureHandler(()=>{
    adminLoginBtn.disabled=false;
    adminLoginBtn.textContent='학급 현황 열기';
    adminLoginMsg.textContent='서버 연결에 실패했습니다.';
    adminLoginMsg.className='teacher-login-msg error';
  }).teacherLogin(pw);
}
if(adminLoginBtn) adminLoginBtn.onclick=adminSubmit;
if(adminPw) adminPw.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();adminSubmit();}});

function tLoad(){
  const err=document.getElementById('loginErr');
  const msg=document.getElementById('teacherLoginMsg');
  const btn=document.getElementById('tbtn');
  google.script.run.withSuccessHandler(r=>{
    btn.disabled=false; btn.textContent='학급 현황 열기';
    if(!r.ok){
      msg.textContent=r.msg||'비밀번호를 확인해 주세요.';
      msg.className='teacher-login-msg error';
      return;
    }
    msg.textContent='확인됐어요. 학급 현황을 열게요.';
    msg.className='teacher-login-msg ok';
    TLIST=Array.isArray(r.list)?r.list:[];
    const loginEl=document.getElementById('login');
    const teacherEl=document.getElementById('teacher');
    if(!teacherEl){
      msg.textContent='교사 화면을 찾지 못했습니다. 최신 Index.html로 교체해 주세요.';
      msg.className='teacher-login-msg error';
      return;
    }
    loginEl.classList.add('hidden');
    teacherEl.classList.remove('hidden');
    try{
      renderTeacher();
      window.scrollTo({top:0,behavior:'instant'});
    }catch(e){
      console.error(e);
      teacherEl.classList.add('hidden');
      loginEl.classList.remove('hidden');
      msg.textContent='교사 화면을 여는 중 오류가 발생했습니다: '+(e&&e.message?e.message:'알 수 없는 오류');
      msg.className='teacher-login-msg error';
    }
  }).withFailureHandler(e=>{
    btn.disabled=false; btn.textContent='학급 현황 열기';
    msg.textContent='서버 연결에 실패했습니다. 웹앱을 새 버전으로 다시 배포했는지 확인해 주세요.';
    msg.className='teacher-login-msg error';
    err.textContent='';
  }).teacherLogin(TPW);
}

const tpw=document.getElementById('tpw');
const tmsg=document.getElementById('teacherLoginMsg');
const tbtn=document.getElementById('tbtn');
const tpwToggle=document.getElementById('tpwToggle');

if(tpwToggle) tpwToggle.onclick=()=>{
  const showing=tpw.type==='text';
  tpw.type=showing?'password':'text';
  tpwToggle.textContent=showing?'보기':'숨기기';
  tpw.focus();
};

function teacherSubmit(){
  TPW=(tpw.value||'').trim();
  if(!TPW){
    tmsg.textContent='비밀번호를 입력해 주세요.';
    tmsg.className='teacher-login-msg error';
    tpw.focus();
    return;
  }
  tbtn.disabled=true;
  tbtn.textContent='확인 중…';
  tmsg.textContent='비밀번호를 확인하고 있어요.';
  tmsg.className='teacher-login-msg';
  tLoad();
}
tbtn.onclick=teacherSubmit;
tpw.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); teacherSubmit(); }});

const tRefresh=document.getElementById('tRefresh'); if(tRefresh)tRefresh.onclick=tLoad;

const tLogout=document.getElementById('tLogout');
if(tLogout)tLogout.onclick=()=>{
  TPW=null;
  document.getElementById('teacher').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');
  const pw=document.getElementById('tpw'); if(pw) pw.value='';
  const msg=document.getElementById('teacherLoginMsg');
  if(msg){msg.textContent='선생님 비밀번호를 입력해 주세요.';msg.className='teacher-login-msg';}
  window.scrollTo({top:0,behavior:'instant'});
};

function renderTeacher(){
  const b=document.getElementById('tBody'); b.innerHTML='';
  TLIST.sort((a,c)=>(a.cls+a.name).localeCompare(c.cls+c.name,'ko'));
  const ks=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  ks('tkStudents',TLIST.length);
  ks('tkToday',TLIST.filter(x=>(x.n||0)>0).length);
  ks('tkDone',TLIST.filter(x=>(x.n||0)>=80).length);
  ks('tkActs',TLIST.reduce((s,x)=>s+(x.acts||0),0));
  TLIST.forEach(st=>{
    const tr=document.createElement('tr');
    tr.innerHTML='<td><input type="checkbox" class="tchk" value="'+st.code+'" checked></td><td>'+esc(st.cls)+'</td><td class="l">'+esc(st.name)+'</td><td title="학생코드는 화면에서 일부만 표시됩니다">'+esc(maskStudentCode(st.code))+'</td>'
      +'<td>'+(st.n||0)+'</td><td>'+(st.s||0)+'</td><td>'+(st.p||0)+'</td><td>'+(st.r||0)+'</td><td>'+Math.floor((st.min||0)/60)+'h</td><td>'+esc(String(st.last||''))+'</td>'
      +'<td><button class="mini" data-k="sheet" data-c="'+st.code+'">2-1</button><button class="mini" data-k="pf" data-c="'+st.code+'">2-2</button><button class="mini" data-k="growth" data-c="'+st.code+'">2-3</button><button class="mini" data-k="rec" data-c="'+st.code+'">추천서</button><button class="mini" data-k="notes" data-c="'+st.code+'">일기</button><button class="mini tdelete" data-c="'+st.code+'" style="color:#B23A3A">기록삭제</button></td>';
    b.appendChild(tr);
  });
  b.querySelectorAll('.mini:not(.tdelete)').forEach(x=>x.onclick=()=>tPrint([x.dataset.c],x.dataset.k));
  b.querySelectorAll('.tdelete').forEach(x=>x.onclick=()=>{
    const st=TLIST.find(v=>v.code===x.dataset.c);
    if(!TPW){alert('선생님 로그인을 다시 해주세요.');return;}
    if(!confirm((st&&st.name?st.name+' 학생의 ':'')+'학교 저장 기록을 삭제할까요? 학생 기본명단은 유지되며 되돌릴 수 없습니다.'))return;
    google.script.run.withSuccessHandler(r=>{
      if(!r||!r.ok){alert((r&&r.msg)||'삭제하지 못했습니다.');return;}
      alert('학생 저장 기록을 삭제했습니다.'); tLoad();
    }).withFailureHandler(()=>alert('삭제 중 오류가 발생했습니다.')).deleteStudentData(TPW,x.dataset.c);
  });
}
const tAll=document.getElementById('tAll'); if(tAll)tAll.onchange=e=>document.querySelectorAll('.tchk').forEach(c=>c.checked=e.target.checked);
function selected(){ return [...document.querySelectorAll('.tchk:checked')].map(c=>c.value); }
function tPrint(codes,kind){
  if(!codes.length){ alert('학생을 한 명 이상 선택하세요.'); return; }
  if(!TPW){ alert('선생님 로그인을 다시 해주세요.'); return; }
  showBar('선택 학생 자료를 불러오는 중…',true);

  google.script.run
    .withSuccessHandler(r=>{
      if(!r || !r.ok){
        showBar('자료 불러오기 실패');
        alert((r&&r.msg)||'학생 자료를 불러오지 못했습니다.');
        return;
      }
      let html='';
      let found=0;
      codes.forEach(c=>{
        const st=r.states && r.states[c];
        if(!st) return;
        found++;
        if(kind==='sheet'||kind==='both'||kind==='full') html+=buildSheet(st);
        if(kind==='pf'||kind==='both'||kind==='full') html+=buildPf(st);
        if(kind==='growth'||kind==='full') html+=buildGrowth(st);
        if(kind==='rec'||kind==='full') html+=buildRecommendation(st);
        if(kind==='notes') html+=buildNotes(st);
      });
      if(!found){
        showBar('학생 자료 없음');
        alert('선택한 학생의 저장 데이터를 찾지 못했습니다.');
        return;
      }
      showBar(found+'명 인쇄 준비 완료');
      doPrint(html);
    })
    .withFailureHandler(e=>{
      console.error(e);
      showBar('불러오기 실패');
      alert('인쇄 자료를 불러오는 중 오류가 발생했습니다. 웹앱을 최신 버전으로 다시 배포했는지 확인해 주세요.');
    })
    .getStates(TPW,codes);
}
const tPrintSheet=document.getElementById('tPrintSheet'); if(tPrintSheet)tPrintSheet.onclick=()=>tPrint(selected(),'sheet');
const tPrintPf=document.getElementById('tPrintPf'); if(tPrintPf)tPrintPf.onclick=()=>tPrint(selected(),'pf');
const tPrintBoth=document.getElementById('tPrintBoth'); if(tPrintBoth)tPrintBoth.onclick=()=>tPrint(selected(),'both');
const tPrintGrowth=document.getElementById('tPrintGrowth'); if(tPrintGrowth)tPrintGrowth.onclick=()=>tPrint(selected(),'growth');
const tPrintRec=document.getElementById('tPrintRec'); if(tPrintRec)tPrintRec.onclick=()=>tPrint(selected(),'rec');
const tPrintFull=document.getElementById('tPrintFull'); if(tPrintFull)tPrintFull.onclick=()=>tPrint(selected(),'full');

/* ---------- 시작 ---------- */
// ===== v7.7 홈 화면 스크롤 최적화 =====
(function(){
  const p=document.getElementById('p-home');
  const btn=document.getElementById('homeMoreToggle');
  const label=document.getElementById('homeMoreLabel');
  if(!p||!btn) return;
  btn.addEventListener('click',()=>{
    const open=p.classList.toggle('show-more');
    btn.setAttribute('aria-expanded', open ? 'true':'false');
    if(label) label.textContent=open ? '간단 기록 화면으로 돌아가기' : '나의 100일 · 성장 자세히 보기';
    if(!open) document.getElementById('recordFocus')?.scrollIntoView({behavior:'smooth',block:'start'});
  });
})();

/* v7.10 개인정보 안내 팝업 */
(function(){
  const o=document.getElementById('privacyOverlay'), open=document.getElementById('privacyOpen'), close=document.getElementById('privacyClose');
  if(open&&o) open.onclick=()=>o.classList.add('on');
  if(close&&o) close.onclick=()=>o.classList.remove('on');
  if(o) o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('on');});
})();
