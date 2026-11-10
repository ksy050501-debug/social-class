/* =========================================================
 * 무역의 발견 — 화면(UI) 모듈
 * 시연 모드, 교사 화면, 학생 화면이 함께 사용합니다.
 * 데이터 저장 방식(이 기기 / Firebase)은 backend 객체가 맡습니다.
 *
 * TradeUI.mount({ backend, mode, tabs, fixedView, headerExtra,
 *                 teacherExtra, onAction })
 * TradeUI.update(S, cfg, extra)
 * ========================================================= */
(function (root) {
'use strict';
const L = root.TradeLogic;
const esc=(s)=>String(s==null?'':s).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

let S=null, cfg=null, extra={}, opts={}, view='teacher';
const ui={draft:{},modal:null,busy:{},pop:null,cfgOpen:false,deferred:false};

/* ---------- 그림 ---------- */
const ICON_ITEM={
 rice:(s)=>`<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><path d="M14 14c-3 8-5 16-3 24 1 4 5 6 13 6s12-2 13-6c2-8 0-16-3-24z" fill="var(--rice)"/><path d="M15 14h18l-2-5c-1-2-3-3-7-3s-6 1-7 3z" fill="var(--rice)" opacity=".75"/><path d="M14 14h20" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/><g fill="var(--surface)"><ellipse cx="20" cy="26" rx="2" ry="3.4" transform="rotate(-20 20 26)"/><ellipse cx="27" cy="24" rx="2" ry="3.4" transform="rotate(15 27 24)"/><ellipse cx="24" cy="33" rx="2" ry="3.4" transform="rotate(-5 24 33)"/></g></svg>`,
 oil:(s)=>`<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><rect x="11" y="8" width="26" height="34" rx="4" fill="var(--oil)"/><rect x="11" y="16" width="26" height="3" fill="var(--surface)" opacity=".5"/><rect x="11" y="31" width="26" height="3" fill="var(--surface)" opacity=".5"/><path d="M24 21c-3 4-4 6-4 7.5a4 4 0 0 0 8 0c0-1.5-1-3.5-4-7.5z" fill="var(--rice)"/><rect x="27" y="5" width="6" height="4" rx="1" fill="var(--oil)"/></svg>`,
 car:(s)=>`<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><path d="M5 31v-5c0-2 1-3 3-3.5l5-1.5 5-6c1-1 2-1.5 4-1.5h9c2 0 3 .5 4 2l4 5.5 3 .8c2 .5 2 1.5 2 3.2v6c0 1-1 2-2 2H7c-1 0-2-1-2-2z" fill="var(--car)"/><path d="M15 21l4-5h6v5zM28 16h4l3.5 5H28z" fill="var(--surface)" opacity=".85"/><circle cx="14" cy="34" r="5" fill="var(--ink)"/><circle cx="35" cy="34" r="5" fill="var(--ink)"/><circle cx="14" cy="34" r="2" fill="var(--surface)"/><circle cx="35" cy="34" r="2" fill="var(--surface)"/></svg>`,
 phone:(s)=>`<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><rect x="13" y="4" width="22" height="40" rx="5" fill="var(--ink)"/><rect x="15.5" y="9" width="17" height="28" rx="2" fill="var(--phone)"/><rect x="18" y="13" width="5" height="5" rx="1.4" fill="var(--surface)" opacity=".8"/><rect x="25" y="13" width="5" height="5" rx="1.4" fill="var(--surface)" opacity=".6"/><rect x="18" y="20" width="5" height="5" rx="1.4" fill="var(--surface)" opacity=".6"/><rect x="21" y="40" width="6" height="1.6" rx=".8" fill="var(--surface)"/></svg>`
};
const itemIcon=(id,s)=>(ICON_ITEM[id]||((z)=>`<svg width="${z}" height="${z}" viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="8" width="32" height="32" rx="8" fill="var(--accent)"/></svg>`))(s||40);
// 나라 색: 가온국부터 빨강·주황·노랑·초록 단색 깃발
const NEW_COL={gaon:'#d93a3a',narae:'#ee8a1c',daon:'#f2c12e',raon:'#2f9e4f'};
const OLD_COL=['#2f6fdb','#d9622b','#13917f','#8e44b8'];
// 예전 기본 색으로 만든 방도 새 색으로 보이게 함 (교사가 직접 바꾼 색은 그대로)
function migrateCfg(c){if(!c||!c.countries)return c;c=JSON.parse(JSON.stringify(c));c.countries.forEach(x=>{if(OLD_COL.includes(String(x.color).toLowerCase())&&NEW_COL[x.id])x.color=NEW_COL[x.id];x.flag='solid'});return c}
// 나라 색 위에 쓰는 글자색 (노랑처럼 밝은 색이면 어두운 글자)
function ink(col){const m=/^#?([0-9a-f]{6})$/i.exec(String(col||''));if(!m)return '#fff';const n=parseInt(m[1],16),r=n>>16&255,g=n>>8&255,b=n&255;return (0.299*r+0.587*g+0.114*b)>165?'#14202c':'#fff'}
function flag(c,w){
  w=w||54;const h=Math.round(w*2/3);
  return `<svg class="flag" width="${w}" height="${h}" viewBox="0 0 30 20" role="img" aria-label="${esc(c.name)} 국기"><rect x=".5" y=".5" width="29" height="19" rx="1.5" fill="${esc(c.color)}" stroke="rgba(0,0,0,.18)"/></svg>`;
}

/* ---------- 도우미 ---------- */
const C=(id)=>L.countryById(cfg,id), I=(id)=>L.itemById(cfg,id);
const q=(n,id)=>`${Number(n||0).toLocaleString('ko-KR')}${esc(I(id).unit)}`;
const pct=L.fmtPct;
const round=()=>L.roundOf(S.stage);
const bar=(key,p,color,tall)=>`<div class="bar${tall?' tall':''}${p>=100?' full':''}" role="img" aria-label="${pct(p)}"><i data-k="${key}" data-w="${p}" style="width:${p}%;--c:${color}"></i></div>`;
const itemColor=(id)=>`var(--${['rice','oil','car','phone'].includes(id)?id:'accent'})`;
const cst=(id)=>S.countries[id]||{inv:L.emptyInv(cfg),chances:cfg.chances,log:[]};
function toast(msg,kind){const r=document.getElementById('toast-root');if(!r)return;r.innerHTML=`<div class="toast ${kind||''}">${esc(msg)}</div>`;clearTimeout(toast.t);toast.t=setTimeout(()=>{r.innerHTML=''},2400)}
async function run(key,fn,okMsg){
  if(ui.busy[key])return null;ui.busy[key]=true;
  let r;
  try{r=await fn()}catch(e){console.error(e);r={ok:false,error:netError(e)}}
  ui.busy[key]=false;
  if(r&&!r.ok)toast(r.error||'처리하지 못했어요.','warn');else if(okMsg)toast(typeof okMsg==='function'?okMsg(r):okMsg);
  render();return r;
}
function netError(e){
  const code=(e&&e.code)||'';
  if(code.includes('permission-denied'))return '권한이 없어요. 선생님께 말씀해 주세요.';
  if(code.includes('unavailable')||code.includes('network')||code.includes('deadline'))return '인터넷 연결을 확인하고 다시 눌러 주세요.';
  if(code.includes('aborted'))return '동시에 여러 요청이 몰렸어요. 다시 눌러 주세요.';
  return '처리하지 못했어요. 다시 눌러 주세요.';
}
function ask(title,body,okLabel,onOk,danger,single){ui.modal={title,body,okLabel,onOk,danger,single};renderModal()}
function renderModal(){const r=document.getElementById('modal-root');if(!r)return;if(!ui.modal){r.innerHTML='';return}
  const m=ui.modal;r.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="box"><h2 id="mt" style="font-size:22px">${esc(m.title)}</h2><div>${m.body}</div><div class="row" style="justify-content:flex-end">${m.single?'':'<button class="btn ghost small" data-a="modal-no">취소</button>'}<button class="btn small ${m.danger?'warn':'accent'}" data-a="modal-yes">${esc(m.okLabel)}</button></div></div></div>`;
  r.querySelector('[data-a="modal-yes"]').focus()}

const TEACHER_GUIDE={
 1:['도입','학생 화면에는 우리나라의 물품별 생산 수준과 생산량 비교표가 보입니다.'],
 2:['1차 생산 (자급자족)','무역 없이 생산 기회 4번으로 네 물품 100%에 도전합니다. 어느 나라도 100%가 될 수 없게 설계되어 있으니 선택을 바로잡지 마세요.'],
 3:['1차 결과 분석 · 2차 계획','학생 화면에 1차 결과와 생산량 비교표가 보입니다. 다음 단계로 넘어가면 1차 결과가 저장되고 창고와 생산 기회가 초기화됩니다.'],
 5:['2차 생산','각 나라는 가장 잘 만드는 물품만 생산할 수 있고(다른 물품을 누르면 경고창), 네 나라가 모두 4번 생산해야 다음 단계로 넘어갈 수 있습니다.'],
 6:['무역','학생은 무역의 바다에서 배를 몰아 다른 나라 항구에 도착한 뒤, 정해진 양으로 거래를 요청합니다. 요청은 상대 나라 거래 요청함으로 가고, 받은 나라는 수락만 할 수 있습니다.'],
 7:['결과 비교 · 정리','학생 화면과 발표 화면에 1차·2차 결과와 무역 흐름이 보입니다. 비교와 정리 발문은 PPT로 진행합니다.']
};

/* ---------- 상단 ---------- */
function renderTop(){
  const st=L.stageInfo(S.stage);
  const sc=document.getElementById('stagechip');sc.hidden=opts.mode==='student';sc.textContent=`${L.stageNo(S.stage)}단계 · ${st.title}`;
  const tabs=opts.tabs||[];
  const name=(id)=>id==='teacher'?'교사 관제':id==='projector'?'발표 화면':(C(id)||{}).name;
  const label=opts.mode==='demo'?'<span class="demo-tag">시연 모드</span>':opts.mode==='teacher'?'':'';
  document.getElementById('views').innerHTML=tabs.length>1?label+tabs.map(id=>{const c=C(id);return `<button data-a="view" data-v="${id}" aria-pressed="${view===id}">${c?flag(c,20):''}${esc(name(id))}</button>`}).join(''):'';
  const hx=document.getElementById('hdr-extra');if(hx)hx.innerHTML=opts.headerExtra?opts.headerExtra():'';
  const off=document.getElementById('offline');if(off)off.hidden=extra.online!==false;
}

/* ---------- 학생 화면 ---------- */
function nationHead(c){
  return `<section class="panel" style="--nc:${esc(c.color)}"><div class="nation">${flag(c,72)}<div style="min-width:0">${opts.mode==='teacher'?'<div class="label">교사가 이 나라를 대신 조작하는 화면</div>':''}<h2>${esc(c.name)}</h2></div></div></section>`;
}
function levelPips(cid,itemId){
  const it=I(itemId),base=Math.max(1,Math.round(it.target*cfg.weakShare));
  const n=Math.max(1,Math.min(4,Math.round(L.output(cfg,cid,itemId)/base)));
  return `<span class="lvl" role="img" aria-label="4칸 중 ${n}칸">${[1,2,3,4].map(i=>`<i class="${i<=n?'f':''}"></i>`).join('')}</span>`;
}
function infoPanel(cid,open){
  const t=L.outputTable(cfg);
  const inner=`<div class="grid2"><div style="min-width:0"><h3>우리나라 생산 수준</h3><div class="tablewrap"><table><thead><tr><th>물품</th><th>생산 수준</th><th>1회 생산량</th><th>필요한 양(목표)</th></tr></thead><tbody>
    ${cfg.items.map(it=>`<tr><td><span class="itemhead">${itemIcon(it.id,26)}${esc(it.name)}</span></td><td>${levelPips(cid,it.id)}</td><td class="num">${q(t[cid][it.id],it.id)}</td><td class="num">${q(it.target,it.id)}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div style="min-width:0"><h3>여러 나라의 1회 생산량 비교</h3><div class="tablewrap"><table><thead><tr><th>나라</th>${cfg.items.map(it=>`<th><span class="itemhead">${itemIcon(it.id,20)}${esc(it.name)}</span></th>`).join('')}</tr></thead><tbody>
    ${cfg.countries.map(o=>`<tr class="${o.id===cid?'me':''}" style="--nc:${esc(o.color)}"><td><span class="itemhead">${flag(o,22)}${esc(o.name)}${o.id===cid?' (우리나라)':''}</span></td>${cfg.items.map(it=>`<td class="num">${q(t[o.id][it.id],it.id)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div></div></div>`;
  return open?`<section class="panel"><h2>우리나라 정보</h2>${inner}</section>`:`<section class="panel"><details><summary><h2 style="font-size:19px">생산 수준 · 생산량 비교표</h2></summary><div style="margin-top:12px">${inner}</div></details></section>`;
}
function productionPanel(cid){
  const st=cst(cid),sec=L.security(cfg,st.inv),t=L.outputTable(cfg);
  const blocked=L.canProduce(S);const busy=!!ui.busy['p-'+cid];const allow=!blocked&&st.chances>0&&!busy;
  const last=st.log[st.log.length-1];const canUndo=S.allowUndo&&!blocked&&last&&last.round===round()&&!busy;
  const cards=cfg.items.map(it=>{const have=st.inv[it.id]||0,p=sec.per[it.id],spare=have-it.target;
    return `<div class="item" data-item="${it.id}"><div class="top-row">${itemIcon(it.id,48)}<div><div class="nm">${esc(it.name)}</div><div class="per">1회 생산 <b class="num">+${q(t[cid][it.id],it.id)}</b></div></div></div>
    <div class="stock"><span>창고 <b class="num">${q(have,it.id)}</b></span><span class="muted">목표 <span class="num">${q(it.target,it.id)}</span></span></div>
    ${bar(cid+'-'+it.id,p,itemColor(it.id))}
    <div class="row" style="justify-content:space-between"><span class="num" style="font-weight:600">${pct(p)}</span>${spare>0?`<span class="spare">여유 <span class="num">${q(spare,it.id)}</span> · 교환 가능</span>`:''}</div>
    <button class="btn" data-a="produce" data-c="${cid}" data-i="${it.id}" ${allow?'':'disabled'}>${esc(it.name)} 생산하기</button>
    ${ui.pop&&ui.pop.c===cid&&ui.pop.i===it.id?`<span class="pop num">+${q(ui.pop.n,it.id)}</span>`:''}</div>`}).join('');
  const logs=st.log.filter(l=>l.round===round());
  return `<section class="panel"><h2>${round()===1?'1차':'2차'} 생산 · 국민 생활 물품 확보율</h2>
    <div class="gauge"><div><div class="label">종합 확보율</div><div class="big num">${pct(sec.overall).replace('%','')}<small>%</small></div></div>
      <div style="flex:1;min-width:180px">${bar(cid+'-all',sec.overall,'var(--accent)',true)}</div>
      <div><div class="label">남은 생산 기회 <span class="num">${st.chances}/${cfg.chances}</span></div><div class="pips" aria-hidden="true">${Array.from({length:cfg.chances},(_,i)=>`<i class="${i<st.chances?'left':''}"></i>`).join('')}</div></div></div>
    ${blocked&&S.stage!==6?`<p class="callout" style="margin:12px 0 0">${esc(blocked)}</p>`:''}
    ${!blocked&&st.chances===0?`<p class="callout" style="margin:12px 0 0">생산 기회를 모두 사용했어요.${S.stage===6?'':' 선생님의 안내를 기다려 주세요.'}</p>`:''}
    <div class="items" style="margin-top:14px">${cards}</div>
    <div class="row" style="margin-top:14px;justify-content:space-between"><div class="chips"><span class="label" style="align-self:center">생산 기록</span>${logs.length?logs.map((l,i)=>`<span class="chip"><span class="n">${i+1}</span>${itemIcon(l.item,18)}${esc(I(l.item).name)}</span>`).join(''):'<span class="muted">아직 없어요</span>'}</div>
    ${S.allowUndo?`<button class="btn ghost small" data-a="undo" data-c="${cid}" ${canUndo?'':'disabled'}>마지막 생산 되돌리기</button>`:''}</div></section>`;
}
function invMini(cid){const st=cst(cid),sec=L.security(cfg,st.inv);
  return `<div class="inv-mini">${cfg.items.map(it=>`<span class="itemhead">${itemIcon(it.id,22)}<span class="num">${q(st.inv[it.id]||0,it.id)}</span><span class="muted">(${pct(sec.per[it.id])})</span></span>`).join('')}<span class="itemhead"><b>종합 <span class="num">${pct(sec.overall)}</span></b></span></div>`}
function dealText(t,me){
  const A=C(t.from),B=C(t.to);
  const meGives=t.from===me?t.give:t.get, meGets=t.from===me?t.get:t.give;
  const other=t.from===me?B:A;
  return `<div class="lines"><div class="row"><span class="tag ex">수출</span>${itemIcon(meGives.item,22)}<b>${esc(I(meGives.item).name)} <span class="num">${q(meGives.qty,meGives.item)}</span></b><span class="muted">→ ${esc(other.name)}에 보냄</span></div>
    <div class="row"><span class="tag im">수입</span>${itemIcon(meGets.item,22)}<b>${esc(I(meGets.item).name)} <span class="num">${q(meGets.qty,meGets.item)}</span></b><span class="muted">← ${esc(other.name)}에서 받음</span></div></div>`;
}
/* ---------- 무역의 바다: 배를 몰아 다른 나라 항구로 가서 거래 요청 ---------- */
const SEA={W:1000,H:625,
  isl:[[170,150],[830,150],[830,475],[170,475]],      // 나라 순서대로 섬 중심
  port:[[292,218],[708,218],[708,407],[292,407]],     // 섬마다 바다 쪽 항구
  rocks:[[500,312,64],[500,92,34],[500,533,34],[360,312,24],[640,312,24]],
  islR:118,shipR:16,dockR:54,speed:230};
const seaKeys={up:false,down:false,left:false,right:false};
const fmtN=(n)=>Number(n||0).toLocaleString('ko-KR');
const seaIdx=(id)=>cfg.countries.findIndex(c=>c.id===id);
function shipOf(cid){
  ui.ship=ui.ship||{};let s=ui.ship[cid];
  if(!s){const p=SEA.port[seaIdx(cid)]||[500,312];s=ui.ship[cid]={x:p[0],y:p[1],a:seaIdx(cid)%3===0?0:180,dock:cid}}
  return s;
}
function seaBlocked(x,y){
  const r=SEA.shipR;
  if(x<r||y<r||x>SEA.W-r||y>SEA.H-r)return true;
  for(const [cx,cy] of SEA.isl)if(Math.hypot(x-cx,y-cy)<SEA.islR+r-6)return true;
  for(const [cx,cy,rr] of SEA.rocks)if(Math.hypot(x-cx,y-cy)<rr+r)return true;
  return false;
}
function dockAt(s){
  let best=null,bd=SEA.dockR;
  cfg.countries.forEach((c,i)=>{const p=SEA.port[i];if(!p)return;const d=Math.hypot(s.x-p[0],s.y-p[1]);if(d<bd){bd=d;best=c.id}});
  return best;
}
function placeShip(el,s){
  el.style.left=(s.x/SEA.W*100)+'%';el.style.top=(s.y/SEA.H*100)+'%';
  const flip=Math.abs(s.a)>90?-1:1;const b=el.firstElementChild;if(b)b.style.transform=`rotate(${s.a}deg) scaleY(${flip})`;
}
let seaLast=0;
function seaTick(ts){
  requestAnimationFrame(seaTick);
  const dt=Math.min(.05,(ts-(seaLast||ts))/1000);seaLast=ts;
  const el=document.getElementById('ship');if(!el||!S||!cfg)return;
  let vx=(seaKeys.right?1:0)-(seaKeys.left?1:0),vy=(seaKeys.down?1:0)-(seaKeys.up?1:0);
  if(!vx&&!vy){el.classList.remove('moving');return}
  const s=shipOf(el.dataset.c);const n=Math.hypot(vx,vy);vx/=n;vy/=n;
  const d=SEA.speed*dt,nx=s.x+vx*d,ny=s.y+vy*d;
  if(!seaBlocked(nx,s.y))s.x=nx;
  if(!seaBlocked(s.x,ny))s.y=ny;
  s.a=Math.atan2(vy,vx)*180/Math.PI;
  placeShip(el,s);el.classList.add('moving');
  const dk=dockAt(s);if(dk!==s.dock){s.dock=dk;render(true);
    if(dk&&dk!==el.dataset.c){const pt=document.querySelector('.port');if(pt&&pt.getBoundingClientRect().top>window.innerHeight-120)pt.scrollIntoView({behavior:'smooth',block:'start'})}}
}
if(typeof requestAnimationFrame==='function')requestAnimationFrame(seaTick);
const SEA_KEY={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right',W:'up',S:'down',A:'left',D:'right'};
document.addEventListener('keydown',(e)=>{const k=SEA_KEY[e.key];if(!k||!document.getElementById('sea')||ui.modal)return;if(e.target.closest&&e.target.closest('input,textarea,select'))return;seaKeys[k]=true;e.preventDefault()});
document.addEventListener('keyup',(e)=>{const k=SEA_KEY[e.key];if(k)seaKeys[k]=false});
const seaStop=()=>{Object.keys(seaKeys).forEach(k=>{seaKeys[k]=false})};
window.addEventListener('blur',seaStop);
document.addEventListener('pointerdown',(e)=>{const b=e.target.closest('[data-dir]');if(!b)return;e.preventDefault();seaKeys[b.dataset.dir]=true;try{b.setPointerCapture(e.pointerId)}catch(err){}});
['pointerup','pointercancel'].forEach(t=>document.addEventListener(t,(e)=>{if(e.target.closest&&e.target.closest('[data-dir]'))seaKeys[e.target.closest('[data-dir]').dataset.dir]=false;else if(e.pointerType!=='mouse'||e.buttons===0)seaStop()}));
document.addEventListener('contextmenu',(e)=>{if(e.target.closest('[data-dir]'))e.preventDefault()});

const BOAT=(c)=>`<svg viewBox="0 0 64 40" width="100%" height="100%" aria-hidden="true"><path d="M4 22h50l-8 13H12z" fill="#5a3b22"/><path d="M4 22h50l-2 3H6z" fill="#7a5130"/><rect x="29" y="2" width="3" height="21" fill="#3b2a1a"/><path d="M32 4l20 15H32z" fill="${c}"/><path d="M29 6L13 20h16z" fill="#f4efe2"/><circle cx="20" cy="28" r="2" fill="#f4efe2" opacity=".8"/><circle cx="30" cy="28" r="2" fill="#f4efe2" opacity=".8"/><circle cx="40" cy="28" r="2" fill="#f4efe2" opacity=".8"/></svg>`;
function seaSVG(cid){
  const isl=cfg.countries.map((c,i)=>{const [x,y]=SEA.isl[i];const [px,py]=SEA.port[i];const me=c.id===cid;
    const ang=Math.atan2(py-y,px-x),ex=x+Math.cos(ang)*(SEA.islR-8),ey=y+Math.sin(ang)*(SEA.islR-8);
    return `<g><ellipse cx="${x}" cy="${y+6}" rx="${SEA.islR+16}" ry="${SEA.islR+8}" fill="#cfe6ee" opacity=".55"/>
      <ellipse cx="${x}" cy="${y}" rx="${SEA.islR+6}" ry="${SEA.islR-2}" fill="#e8d6a6"/>
      <ellipse cx="${x}" cy="${y-4}" rx="${SEA.islR-10}" ry="${SEA.islR-20}" fill="${me?'#6fae5b':'#86b86b'}"/>
      <line x1="${ex}" y1="${ey}" x2="${px-(px-x)*.12}" y2="${py-(py-y)*.12}" stroke="#6b4a2b" stroke-width="10" stroke-linecap="round"/>
      <circle cx="${px}" cy="${py}" r="${SEA.dockR-8}" fill="none" stroke="${esc(c.color)}" stroke-width="3" stroke-dasharray="7 7" opacity=".9"/>
      <text x="${px}" y="${py+SEA.dockR+10}" text-anchor="middle" font-size="15" fill="${esc(c.color)}" font-family="Do Hyeon,sans-serif">항구</text></g>`}).join('');
  const rocks=SEA.rocks.map(([x,y,r])=>`<g><circle cx="${x}" cy="${y+4}" r="${r+6}" fill="#cfe6ee" opacity=".6"/><circle cx="${x}" cy="${y}" r="${r}" fill="#8c98a3"/><circle cx="${x-r*.3}" cy="${y-r*.3}" r="${r*.45}" fill="#a9b4be"/></g>`).join('');
  return `<svg class="sea-bg" viewBox="0 0 ${SEA.W} ${SEA.H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="seag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fa8c9"/><stop offset="1" stop-color="#2f7ea6"/></linearGradient>
    <pattern id="wave" width="80" height="40" patternUnits="userSpaceOnUse"><path d="M0 20q10-8 20 0t20 0t20 0t20 0" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="2"/></pattern></defs>
    <rect width="${SEA.W}" height="${SEA.H}" fill="url(#seag)"/><rect width="${SEA.W}" height="${SEA.H}" fill="url(#wave)"/>${rocks}${isl}</svg>`;
}
function seaPanel(cid){
  const s=shipOf(cid);const blocked=L.canTrade(S);
  const cards=cfg.countries.map((c,i)=>{const [x,y]=SEA.isl[i];const st=cst(c.id);const me=c.id===cid;
    return `<div class="isle${me?' me':''}" style="left:${x/SEA.W*100}%;top:${y/SEA.H*100}%;--nc:${esc(c.color)};--nci:${ink(c.color)}"><div class="isle-hd">${flag(c,20)}<b>${esc(c.name)}</b>${me?'<span class="me-tag">우리</span>':''}</div>
      <div class="isle-inv">${cfg.items.map(it=>`<span>${itemIcon(it.id,15)}<span class="num">${fmtN(st.inv[it.id])}</span><small>${esc(it.unit)}</small></span>`).join('')}</div></div>`}).join('');
  const at=s.dock?C(s.dock):null;
  const banner=at?(s.dock===cid?`<div class="sea-banner">다른 나라 항구로 가 보세요.</div>`:`<div class="sea-banner arrive" style="--nc:${esc(at.color)};--nci:${ink(at.color)}">${flag(at,20)} <b>${esc(at.name)} 항구</b> 도착!</div>`):'';
  const jump=opts.mode!=='student'?`<div class="row" style="gap:6px"><span class="label">교사용 바로 이동</span>${cfg.countries.map(c=>`<button class="btn ghost small" data-a="sea-jump" data-c="${cid}" data-v="${c.id}">${flag(c,18)}${esc(c.name)}</button>`).join('')}</div>`:'';
  return `<section class="panel"><h2>무역의 바다</h2>
   ${blocked?`<p class="callout" style="margin:0 0 12px">${esc(blocked)}</p>`:''}
   <div class="sea" id="sea">${seaSVG(cid)}${cards}
     <div class="ship" id="ship" data-c="${cid}" style="--nc:${esc(C(cid).color)};left:${s.x/SEA.W*100}%;top:${s.y/SEA.H*100}%"><div class="boat" style="transform:rotate(${s.a}deg) scaleY(${Math.abs(s.a)>90?-1:1})">${BOAT(esc(C(cid).color))}</div></div>${banner}</div>
   <div class="sea-ctrl"><div class="dpad" aria-label="배 움직이기"><button data-dir="up" aria-label="위로">▲</button><button data-dir="left" aria-label="왼쪽으로">◀</button><button data-dir="right" aria-label="오른쪽으로">▶</button><button data-dir="down" aria-label="아래로">▼</button></div>
     <p class="muted" style="margin:0">방향키를 누르고 있으면 배가 움직여요.</p></div>
   ${jump}</section>`;
}
function portPanel(cid,to){
  const T=C(to),my=cst(cid).inv,th=cst(to).inv,U=L.tradeUnits(cfg);const blocked=L.canTrade(S);
  const key=cid+'>'+to;ui.port=ui.port||{};
  let d=ui.port[key];
  if(!d){const g=cfg.items.slice().sort((a,b)=>(my[b.id]-b.target)/b.target-(my[a.id]-a.target)/a.target)[0].id;
    const t=cfg.items.filter(it=>it.id!==g).sort((a,b)=>(th[b.id]-b.target)/b.target-(th[a.id]-a.target)/a.target)[0].id;d=ui.port[key]={give:g,get:t}}
  const pend=S.trades.find(t=>t.status==='pending'&&t.from===cid&&t.to===to);
  const opt=(k,it)=>{const mine=k==='give';const have=(mine?my:th)[it.id]||0;const low=have<U[it.id];const same=!mine&&it.id===d.give;
    return `<button class="opt${d[k]===it.id?' on':''}" data-a="pg" data-c="${cid}" data-v="${to}" data-k="${k}" data-i="${it.id}" ${(mine&&low)||same?'disabled':''} aria-pressed="${d[k]===it.id}">${itemIcon(it.id,30)}<span><b>${esc(it.name)} <span class="num">${q(U[it.id],it.id)}</span></b><small>${mine?'우리':esc(T.name)} 창고 <span class="num">${q(have,it.id)}</span>${low?(mine?' · 부족':' · 지금은 부족'):''}</small></span></button>`};
  const gi=I(d.give),ti=I(d.get);const short=(my[d.give]||0)<U[d.give];const busy=!!ui.busy['tp-'+cid];
  return `<section class="panel port" style="--nc:${esc(T.color)}"><h2>${flag(T,28)} ${esc(T.name)}에 거래 요청</h2>
   ${pend?`<div class="letter"><div class="label">보낸 요청 · ${esc(T.name)}의 거래 요청함에서 기다리는 중</div><p>“우리 ${esc(I(pend.give.item).name)} <b class="num">${q(pend.give.qty,pend.give.item)}</b>을(를) 줄 테니, ${esc(T.name)}의 ${esc(I(pend.get.item).name)} <b class="num">${q(pend.get.qty,pend.get.item)}</b>을(를) 주세요.”</p>
     <div class="row"><button class="btn ghost small" data-a="reject" data-c="${cid}" data-t="${pend.id}" ${ui.busy['t-'+pend.id]?'disabled':''}>요청 취소</button></div></div>`
   :`<div class="grid2"><div><div class="row" style="margin-bottom:8px"><span class="tag ex">수출</span><b>우리가 줄 물품</b></div><div class="opts">${cfg.items.map(it=>opt('give',it)).join('')}</div></div>
     <div><div class="row" style="margin-bottom:8px"><span class="tag im">수입</span><b>${esc(T.name)}에서 받을 물품</b></div><div class="opts">${cfg.items.map(it=>opt('get',it)).join('')}</div></div></div>
     <div class="letter" style="margin-top:14px"><p>“우리 ${esc(gi.name)} <b class="num">${q(U[d.give],d.give)}</b>을(를) 줄 테니, ${esc(T.name)}의 ${esc(ti.name)} <b class="num">${q(U[d.get],d.get)}</b>을(를) 주세요.”</p>
</div>
     <button class="btn accent" style="margin-top:12px;width:100%" data-a="sea-propose" data-c="${cid}" data-v="${to}" ${blocked||short||d.give===d.get||busy?'disabled':''}>거래 요청 보내기</button>`}
   </section>`;
}
function inboxPanel(cid){
  const inc=S.trades.filter(t=>t.status==='pending'&&t.to===cid);
  const sent=S.trades.filter(t=>t.status==='pending'&&t.from===cid);
  const done=S.trades.filter(t=>t.status==='done'&&(t.from===cid||t.to===cid));
  const my=cst(cid).inv;const blocked=L.canTrade(S);
  const incCards=inc.length?inc.map(t=>{const A=C(t.from);const lack=(my[t.get.item]||0)<t.get.qty;const b=!!ui.busy['t-'+t.id];
    return `<div class="letter incoming" style="--nc:${esc(A.color)}"><div class="row">${flag(A,22)}<b>${esc(A.name)}에서 온 거래 요청</b></div>
      <p>“우리 ${esc(I(t.give.item).name)} <b class="num">${q(t.give.qty,t.give.item)}</b>을(를) 줄 테니, ${esc(C(cid).name)}의 ${esc(I(t.get.item).name)} <b class="num">${q(t.get.qty,t.get.item)}</b>을(를) 주세요.”</p>
      ${dealText(t,cid)}
      <div class="row"><button class="btn good" data-a="accept" data-c="${cid}" data-t="${t.id}" ${blocked||lack||b?'disabled':''}>수락하기</button>${lack?`<span style="color:var(--warn);font-size:14px;font-weight:600">${esc(I(t.get.item).name)} 부족</span>`:''}</div></div>`}).join(''):'<p class="muted" style="margin:0">도착한 요청이 없어요.</p>';
  const sentList=sent.length?`<h3>보낸 요청</h3>${sent.map(t=>{const B=C(t.to);return `<div class="deal"><div class="row">${flag(B,20)}<b>${esc(B.name)}</b><span class="tag pend">기다리는 중</span><button class="btn ghost small" style="margin-left:auto" data-a="reject" data-c="${cid}" data-t="${t.id}" ${ui.busy['t-'+t.id]?'disabled':''}>요청 취소</button></div>${dealText(t,cid)}</div>`}).join('')}`:'';
  const ts=L.tradeSummary(S,cfg,cid);
  const ledger=done.length?`<div class="tablewrap"><table><thead><tr><th>거래한 나라</th><th>수출(보냄)</th><th>수입(받음)</th></tr></thead><tbody>${done.slice().reverse().map(t=>{const o=C(t.from===cid?t.to:t.from);const g=t.from===cid?t.give:t.get,r=t.from===cid?t.get:t.give;
      return `<tr><td><span class="itemhead">${flag(o,20)}${esc(o.name)}</span></td><td><span class="itemhead">${itemIcon(g.item,18)}${esc(I(g.item).name)} <span class="num">${q(g.qty,g.item)}</span></span></td><td><span class="itemhead">${itemIcon(r.item,18)}${esc(I(r.item).name)} <span class="num">${q(r.qty,r.item)}</span></span></td></tr>`}).join('')}</tbody></table></div>
    <p class="muted" style="margin:8px 0 0;font-size:14px">수출 합계: ${cfg.items.filter(it=>ts.exports[it.id]).map(it=>`${esc(it.name)} ${q(ts.exports[it.id],it.id)}`).join(', ')||'없음'} · 수입 합계: ${cfg.items.filter(it=>ts.imports[it.id]).map(it=>`${esc(it.name)} ${q(ts.imports[it.id],it.id)}`).join(', ')||'없음'}</p>`:'<p class="muted" style="margin:0">아직 이루어진 거래가 없어요.</p>';
  return `<section class="panel"><h2>거래 요청함${inc.length?` <span class="badge num">${inc.length}</span>`:''}</h2><div class="grid2"><div style="display:grid;gap:12px;align-content:start;min-width:0">${incCards}${sentList}</div>
    <div style="min-width:0"><h3>무역 장부</h3>${ledger}</div></div></section>`;
}
function notifyIncoming(cid){
  const ids=S.trades.filter(t=>t.status==='pending'&&t.to===cid).map(t=>t.id);
  ui.seenInc=ui.seenInc||{};const seen=ui.seenInc[cid];
  if(seen){const fresh=ids.filter(x=>!seen.includes(x));if(fresh.length){const t=S.trades.find(x=>x.id===fresh[fresh.length-1]);toast(`${C(t.from).name}에서 거래 요청이 도착했어요. 거래 요청함을 확인하세요.`)}}
  ui.seenInc[cid]=ids;
}
function r1Data(cid){return S.round1&&S.round1[cid]?S.round1[cid]:{inv:cst(cid).inv,log:cst(cid).log.filter(l=>l.round===1)}}
function resultBlock(cid,data,label){
  const sec=L.security(cfg,data.inv);
  return `<div style="display:grid;gap:10px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(label)}</h3><span class="num" style="font-size:22px;font-weight:600">${pct(sec.overall)}</span></div>
   ${cfg.items.map(it=>`<div style="display:grid;grid-template-columns:100px 1fr 120px;gap:8px;align-items:center"><span class="itemhead">${itemIcon(it.id,22)}${esc(it.name)}</span>${bar(cid+label+it.id,sec.per[it.id],itemColor(it.id))}<span class="num" style="text-align:right">${q(data.inv[it.id]||0,it.id)} · ${pct(sec.per[it.id])}</span></div>`).join('')}
   <div class="chips"><span class="label" style="align-self:center">생산한 물품</span>${data.log.length?data.log.map((l,i)=>`<span class="chip"><span class="n">${i+1}</span>${itemIcon(l.item,18)}${esc(I(l.item).name)}</span>`).join(''):'<span class="muted">없음</span>'}</div></div>`;
}
function round1Panel(cid){
  return `<section class="panel"><h2>1차 실험 결과 (자급자족)</h2><div class="grid2">${resultBlock(cid,r1Data(cid),'우리나라')}
   <div><h3>다른 나라의 종합 확보율</h3><div style="display:grid;gap:8px">${cfg.countries.map(o=>{const s=L.security(cfg,r1Data(o.id).inv);return `<div style="display:grid;grid-template-columns:100px 1fr 70px;gap:8px;align-items:center"><span class="itemhead">${flag(o,22)}${esc(o.name)}</span>${bar('r1o-'+o.id,s.overall,'var(--accent)')}<span class="num" style="text-align:right">${pct(s.overall)}</span></div>`}).join('')}</div></div></div></section>`;
}
function flowSVG(me){
  const ids=cfg.countries.map(c=>c.id),n=ids.length,W=680,H=420,cx=W/2,cy=H/2;
  const pos={};const corners=[[110,80],[570,80],[570,340],[110,340]];
  ids.forEach((id,i)=>{if(n===4)pos[id]=corners[i];else{const a=-Math.PI/2+i*2*Math.PI/n;pos[id]=[cx+250*Math.cos(a),cy+150*Math.sin(a)]}});
  const pairs={};S.trades.filter(t=>t.status==='done').forEach(t=>{const k=[t.from,t.to].sort().join('|');const p=pairs[k]||(pairs[k]={});
    const add=(fr,o)=>{const kk=fr+'>'+o.item;p[kk]=(p[kk]||0)+o.qty};add(t.from,t.give);add(t.to,t.get)});
  let lines='',labels='';
  Object.entries(pairs).forEach(([k,p])=>{const [a,b]=k.split('|');if(!pos[a]||!pos[b])return;const [x1,y1]=pos[a],[x2,y2]=pos[b];const hl=!me||a===me||b===me;
    lines+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--ink)" stroke-width="${hl?3:1.5}" opacity="${hl?.55:.2}"/>`;
    const ia=ids.indexOf(a),ib=ids.indexOf(b),diag=n===4&&Math.abs(ia-ib)===2,f=diag?0.3:0.5;
    const mx=x1+(x2-x1)*f,my=y1+(y2-y1)*f;const rows=Object.entries(p).map(([kk,v])=>{const [fr,it]=kk.split('>');return `${C(fr).name} → ${I(it).name} ${v}${I(it).unit}`});
    const tw=(r)=>[...r].reduce((s,ch)=>s+(ch.charCodeAt(0)>255?12.5:7),0);
    const w=Math.max(...rows.map(tw))+18,h=rows.length*17+8;
    labels+=`<g opacity="${hl?1:.45}"><rect x="${mx-w/2}" y="${my-h/2}" width="${w}" height="${h}" rx="6" fill="var(--surface)" stroke="var(--line)"/>${rows.map((r,i)=>`<text x="${mx}" y="${my-h/2+17+i*17}" text-anchor="middle" font-size="12" fill="var(--ink)" font-family="IBM Plex Sans KR,sans-serif">${esc(r)}</text>`).join('')}</g>`});
  const nodes=ids.map(id=>{const c=C(id),[x,y]=pos[id];return `<g><circle cx="${x}" cy="${y}" r="${id===me?40:34}" fill="${esc(c.color)}"/><text x="${x}" y="${y+6}" text-anchor="middle" font-size="17" fill="${ink(c.color)}" font-family="Do Hyeon,sans-serif">${esc(c.name)}</text></g>`}).join('');
  return `<div class="flow"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="나라 사이 무역 흐름">${lines}${nodes}${labels}${Object.keys(pairs).length?'':`<text x="${cx}" y="${cy}" text-anchor="middle" font-size="15" fill="var(--muted)" font-family="IBM Plex Sans KR,sans-serif">아직 성립한 거래가 없어요</text>`}</svg></div>`;
}
function comparePanel(cid){
  const d1=r1Data(cid),s1=L.security(cfg,d1.inv);
  const st=cst(cid),s2=L.security(cfg,st.inv);
  const ts=L.tradeSummary(S,cfg,cid);
  const list=(o)=>{const e=cfg.items.filter(it=>o[it.id]>0);return e.length?e.map(it=>`<span class="chip">${itemIcon(it.id,18)}${esc(it.name)} <b class="num">${q(o[it.id],it.id)}</b></span>`).join(''):'<span class="muted">없음</span>'};
  const counts=(log)=>{const n=L.productionCounts(cfg,log);return cfg.items.filter(it=>n[it.id]).map(it=>`<span class="chip">${itemIcon(it.id,18)}${esc(it.name)} <b class="num">×${n[it.id]}</b></span>`).join('')||'<span class="muted">없음</span>'};
  return `<section class="panel"><h2>1차 · 2차 결과 비교</h2>
   <div class="big-cmp"><div><div class="label" style="font-family:var(--f-body)">1차 자급자족</div><div class="v num">${pct(s1.overall)}</div></div><span class="arrow">→</span><div><div class="label" style="font-family:var(--f-body)">2차 무역</div><div class="v num">${pct(s2.overall)}</div></div></div>
   <div class="cmp" style="margin-top:16px">${cfg.items.map(it=>`<div class="cmp-row"><span class="itemhead">${itemIcon(it.id,28)}<b>${esc(it.name)}</b></span><div class="bars">
     <div class="b"><span class="muted">1차</span>${bar('c1'+cid+it.id,s1.per[it.id],itemColor(it.id))}<span class="num">${pct(s1.per[it.id])}</span></div>
     <div class="b"><span class="muted">2차</span>${bar('c2'+cid+it.id,s2.per[it.id],itemColor(it.id))}<span class="num">${pct(s2.per[it.id])}</span></div></div></div>`).join('')}</div></section>
   <section class="grid2"><div class="panel"><h2>생산 전략 비교</h2><div style="display:grid;gap:10px"><div><div class="label">1차에 생산한 물품</div><div class="chips">${counts(d1.log)}</div></div><div><div class="label">2차에 생산한 물품</div><div class="chips">${counts(st.log.filter(l=>l.round===2))}</div></div>
     <div><div class="label"><span class="tag ex">수출</span> 다른 나라에 보낸 물품</div><div class="chips" style="margin-top:4px">${list(ts.exports)}</div></div><div><div class="label"><span class="tag im">수입</span> 다른 나라에서 받은 물품</div><div class="chips" style="margin-top:4px">${list(ts.imports)}</div></div></div></div>
   <div class="panel"><h2>나라 사이 무역 흐름</h2>${flowSVG(cid)}</div></section>`;
}
function studentView(cid){
  const s=S.stage;let h=nationHead(C(cid));
  if(s===1)h+=infoPanel(cid,true);
  else if(s===2)h+=productionPanel(cid)+infoPanel(cid,false);
  else if(s===3)h+=round1Panel(cid)+infoPanel(cid,true);
  else if(s===5)h+=productionPanel(cid)+infoPanel(cid,false);
  else if(s===6){const sh=shipOf(cid);h+=seaPanel(cid)+(sh.dock&&sh.dock!==cid?portPanel(cid,sh.dock):'')+inboxPanel(cid)+productionPanel(cid)}
  else h+=comparePanel(cid);
  return h;
}

/* ---------- 교사 화면 ---------- */
function teacherView(){
  const g=TEACHER_GUIDE[S.stage]||['',''];
  const r2=S.stage===5?L.round2Progress(S,cfg):null,r2wait=!!(r2&&r2.some(x=>!x.ok));
  const stages=`<div class="stepper-stages">${L.STAGES.map((s,i)=>`<button data-a="stage" data-n="${s.n}" ${s.n===S.stage?'aria-current="step"':''}><b>${i+1}단계</b>${esc(s.title)}</button>`).join('')}</div>`;
  const cards=cfg.countries.map(c=>{const st=cst(c.id),sec=L.security(cfg,st.inv),sp=L.specialties(cfg,c.id).map(i=>I(i).name).join('·')||'없음';
    const r1=S.round1&&S.round1[c.id]?L.security(cfg,S.round1[c.id].inv).overall:null;
    const seat=extra.seats?extra.seats[c.id]:null;
    return `<div class="ncard" style="--nc:${esc(c.color)}"><div class="hd">${flag(c,30)}<h3>${esc(c.name)}</h3><span class="spec">특화: ${esc(sp)}</span></div>
     ${seat!==undefined&&seat!==null?`<div class="muted" style="font-size:13px"><span class="dot ${seat.online?'':'off'}"></span> ${seat.online?'접속 중':'연결 끊김'}</div>`:extra.seats?'<div class="muted" style="font-size:13px"><span class="dot idle"></span> 아직 들어오지 않음</div>':''}
     <div class="row" style="justify-content:space-between"><span><span class="label">종합</span> <b class="num" style="font-size:20px">${pct(sec.overall)}</b></span><span class="muted" style="font-size:13px">기회 <b class="num">${st.chances}</b>/${cfg.chances}${r1!==null?` · 1차 <span class="num">${pct(r1)}</span>`:''}</span></div>
     <div class="mini">${cfg.items.map(it=>`${itemIcon(it.id,20)}${bar('t-'+c.id+it.id,sec.per[it.id],itemColor(it.id))}<span class="num">${q(st.inv[it.id]||0,it.id)}</span>`).join('')}</div>
     <div class="chips">${st.log.filter(l=>l.round===round()).map(l=>`<span class="chip" style="padding:2px 6px">${itemIcon(l.item,16)}</span>`).join('')}</div></div>`}).join('');
  const trades=S.trades.slice().reverse();
  const statusName={pending:'대기',done:'성립',rejected:'교사 무효',withdrawn:'제안 취소',reverted:'교사 취소',expired:'단계 변경으로 무효'};
  const tlog=trades.length?`<div class="tablewrap"><table><thead><tr><th>번호</th><th>제안한 나라 → 받은 나라</th><th>제안국이 보냄</th><th>제안국이 받음</th><th>상태</th><th></th></tr></thead><tbody>${trades.map(t=>`<tr><td class="num">${S.trades.indexOf(t)+1}</td><td>${esc(C(t.from).name)} → ${esc(C(t.to).name)}</td><td class="num">${esc(I(t.give.item).name)} ${q(t.give.qty,t.give.item)}</td><td class="num">${esc(I(t.get.item).name)} ${q(t.get.qty,t.get.item)}</td><td>${statusName[t.status]||t.status}</td><td>${t.status==='done'?`<button class="btn ghost small" data-a="revert" data-t="${t.id}">거래 취소</button>`:t.status==='pending'?`<button class="btn ghost small" data-a="t-cancel" data-t="${t.id}">무효 처리</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted" style="margin:0">아직 거래 기록이 없습니다.</p>';
  const tot=L.totals({countries:Object.fromEntries(cfg.countries.map(c=>[c.id,cst(c.id)]))},cfg);
  const demoTail=opts.mode==='demo'?`<section class="panel"><h2>시연 모드</h2><p class="muted" style="margin:0">이 기기 안에서만 저장됩니다. 위쪽 탭으로 나라를 바꿔 가며 수업 흐름을 시험할 수 있고, 같은 브라우저의 다른 탭에서 열어도 상태가 함께 바뀝니다.</p><div class="row" style="margin-top:12px"><button class="btn warn small" data-a="reset">게임 전체 초기화</button></div></section>`:'';
  return `${opts.teacherExtra?opts.teacherExtra():''}<section class="panel"><h2>수업 단계</h2>${stages}
    <div class="row" style="margin-top:12px;justify-content:space-between"><div class="row"><button class="btn ghost small" data-a="stage" data-n="${L.nextStage(S.stage,-1)}" ${L.nextStage(S.stage,-1)?'':'disabled'}>◀ 이전 단계</button><button class="btn accent small" data-a="stage" data-n="${L.nextStage(S.stage,1)}" ${L.nextStage(S.stage,1)&&!r2wait?'':'disabled'}>다음 단계 ▶</button></div>
    <div class="row"><label class="switch"><input type="checkbox" id="lock-prod" data-a="lock" data-k="production" ${S.locks.production?'checked':''}>생산 잠금</label><label class="switch"><input type="checkbox" id="lock-trade" data-a="lock" data-k="trade" ${S.locks.trade?'checked':''}>무역 잠금</label><label class="switch"><input type="checkbox" id="allow-undo" data-a="undoflag" ${S.allowUndo?'checked':''}>학생 되돌리기 허용</label></div></div>
    <div class="callout" style="margin-top:12px"><b>${esc(g[0])}</b> · ${esc(g[1])}${r2?`<div class="row" style="margin-top:8px;gap:6px"><span class="label">특화 생산</span>${r2.map(x=>`<span class="tag" style="background:${x.ok?'var(--good-bg)':'var(--warn-bg)'};color:${x.ok?'var(--good)':'var(--warn)'}">${esc(x.name)} <span class="num">${x.done}/${x.need}</span></span>`).join('')}${r2wait?'<span class="muted" style="font-size:13px">네 나라가 모두 끝내야 다음 단계로 넘어갈 수 있어요.</span>':''}</div>`:''}</div></section>
   <section class="panel"><h2>나라별 현황 <span class="muted" style="font-family:var(--f-body);font-size:13px">특화 물품과 능력치는 교사에게만 보입니다</span></h2><div class="nations">${cards}</div>
    <p class="muted" style="margin:10px 0 0;font-size:13px">전체 물품 합계 · ${cfg.items.map(it=>`${esc(it.name)} <span class="num">${q(tot[it.id],it.id)}</span>`).join(' · ')} (무역은 이 합계를 바꾸지 않습니다)</p></section>
   <section class="panel"><h2>거래 기록</h2>${tlog}</section>
   ${settingsPanel()}${demoTail}`;
}
function settingsPanel(){
  const cond=(sel,id)=>`<select id="${id}" data-cfg>${cfg.conditions.map(k=>`<option value="${k.id}" ${k.id===sel?'selected':''}>${esc(k.name)}</option>`).join('')}</select>`;
  let v1={pass:false,combos:0,perCountry:{}},v2={pass:false};
  if(ui.cfgOpen){v1=L.verifyAutarky(cfg);v2=L.verifyTradePlan(cfg)}
  return `<section class="panel"><details id="cfg-details" ${ui.cfgOpen?'open':''}><summary><h2 style="font-size:19px">국가·물품 설정과 규칙 검증</h2></summary>
   ${ui.cfgOpen?`<div class="grid2" style="margin-top:12px"><div class="cfg-grid">
    <h3>나라 (능력치 1~5)</h3><div class="tablewrap"><table><thead><tr><th>이름</th><th>색</th>${cfg.conditions.map(k=>`<th>${esc(k.name)}</th>`).join('')}</tr></thead><tbody>
    ${cfg.countries.map((c,ci)=>`<tr><td><input type="text" id="cn-${ci}" data-cfg value="${esc(c.name)}" style="width:96px"></td><td><input type="color" id="cc-${ci}" data-cfg value="${esc(c.color)}" aria-label="${esc(c.name)} 색"></td>${cfg.conditions.map(k=>`<td><input type="number" min="1" max="5" id="cs-${ci}-${k.id}" data-cfg value="${c.stats[k.id]}" aria-label="${esc(c.name)} ${esc(k.name)}"></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <h3>물품</h3><div class="tablewrap"><table><thead><tr><th>물품</th><th>목표량</th><th>가장 중요한 조건</th></tr></thead><tbody>
    ${cfg.items.map((it,ii)=>`<tr><td>${esc(it.name)} (${esc(it.unit)})</td><td><input type="number" min="1" id="it-${ii}" data-cfg value="${it.target}"></td><td>${cond(it.key,'ik-'+ii)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="row"><span>나라별 생산 기회</span><input type="number" min="1" max="8" id="cfg-ch" data-cfg value="${cfg.chances}"></div>
    <div class="row"><button class="btn accent small" data-a="cfg-apply">설정 적용</button><button class="btn ghost small" data-a="cfg-default">기본값으로</button></div>
    <p class="muted" style="font-size:13px;margin:0">학생 화면에는 능력치가 보이지 않고, 물품별 생산 수준(4칸)과 생산량만 보입니다. 생산 기회 수는 다음 초기화 또는 2차 시작 때부터 적용됩니다.</p>
   </div>
   <div><h3>현재 설정의 규칙 검증</h3><div class="check">
    <div class="${v1.pass?'ok':'no'}">${v1.pass?'통과':'주의'} · 1차 자급자족에서 100% 달성 ${v1.pass?'불가능':'가능한 나라가 있음'} (나라마다 ${v1.combos}가지 조합 전수 확인)</div>
    ${cfg.countries.map(c=>`<div class="muted">${esc(c.name)} 최고 ${pct(v1.perCountry[c.id].best)}</div>`).join('')}
    <div class="${v2.pass?'ok':'no'}" style="margin-top:6px">${v2.pass?'통과':'주의'} · 2차 특화 생산 + 교환으로 모든 나라 100% ${v2.pass?'가능':'불가'}</div>
    ${v2.reason?`<div class="muted">${esc(v2.reason)}</div>`:''}
    ${v2.trades?`<div class="muted">${v2.trades.length}건 교환으로 확인 · 물품 합계 ${v2.conserved?'보존':'불일치'}</div>`:''}
    <div class="callout" style="margin-top:10px;font-size:14px">생산 규칙: 물품마다 가장 중요한 조건이 하나 있고, 그 조건이 ${cfg.strongLevel}인 나라는 1회에 목표량만큼, 아닌 나라는 목표량의 1/4만큼 생산합니다. 각 나라가 서로 다른 조건 하나만 ${cfg.strongLevel}이어야 수업 설계가 성립합니다.</div>
   </div></div></div>`:''}</details></section>`;
}

/* ---------- 발표 화면 ---------- */
function projectorView(){
  const st=L.stageInfo(S.stage);
  const showR1=S.stage===3;
  const data=(id)=>showR1?r1Data(id):cst(id);
  const all=cfg.countries.map(c=>L.security(cfg,data(c.id).inv).overall);
  const avg=Math.round(all.reduce((a,b)=>a+b,0)/all.length*100)/100;
  const avg1=S.round1?Math.round(cfg.countries.map(c=>L.security(cfg,r1Data(c.id).inv).overall).reduce((a,b)=>a+b,0)/cfg.countries.length*100)/100:null;
  const cards=cfg.countries.map(c=>{const d=data(c.id),sec=L.security(cfg,d.inv);const r1=S.round1&&S.stage>=7?L.security(cfg,r1Data(c.id).inv).overall:null;
    return `<div class="ncard" style="--nc:${esc(c.color)}"><div class="hd">${flag(c,40)}<h3>${esc(c.name)}</h3><b class="num" style="margin-left:auto;font-size:24px">${r1!==null?`<span class="muted" style="font-size:16px">${pct(r1)} →</span> `:''}${pct(sec.overall)}</b></div>
     <div class="mini">${cfg.items.map(it=>`${itemIcon(it.id,24)}${bar('p-'+c.id+it.id,sec.per[it.id],itemColor(it.id))}<span class="num">${pct(sec.per[it.id])}</span>`).join('')}</div></div>`}).join('');
  return `<div class="proj"><div class="hero"><div class="row" style="justify-content:space-between"><span style="opacity:.7">${L.stageNo(S.stage)}단계</span>${document.fullscreenEnabled?`<button class="btn ghost small" data-a="fullscreen" style="color:var(--bg);box-shadow:inset 0 0 0 1.5px currentColor">전체 화면</button>`:''}</div><h2>${esc(st.title)}</h2></div>
   <section class="panel"><div class="together"><div><div class="label">${showR1?'1차 실험 · ':''}네 나라가 함께 확보한 국민 생활 물품</div><div class="v num">${pct(avg)}</div></div>
     <div style="flex:1;min-width:200px">${bar('p-avg',avg,'var(--accent)',true)}${avg1!==null&&S.stage>=7?`<p class="muted" style="margin:8px 0 0">1차 자급자족 때는 <b class="num">${pct(avg1)}</b>였어요.</p>`:''}</div></div></section>
   <section class="nations">${cards}</section>
   ${S.stage>=6?`<section class="panel"><h2>나라 사이 무역 흐름</h2>${flowSVG(null)}</section>`:''}</div>`;
}

/* ---------- 렌더링 ---------- */
function editing(){const ae=document.activeElement;return ae&&ae.closest&&ae.closest('#main')&&(ae.tagName==='INPUT'&&ae.type!=='checkbox'||ae.tagName==='TEXTAREA'||ae.tagName==='SELECT')}

/* ---------- 도우미 갈매기 (오른쪽 아래 힌트) ----------
 * 지금 단계와 우리 나라 상황을 보고 '무엇을 하면 되는지'만 알려 줍니다.
 * 1·2차 실험의 전략(특화·교환)은 미리 알려 주지 않습니다. */
const HELPER_NAME='갈매기 선장';
const HELPER_SVG=`<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
 <circle cx="32" cy="32" r="32" fill="#bfe3f2"/><path d="M0 44c8-4 14-4 22 0s14 4 22 0 14-4 20 0v20H0z" fill="#3d9bc4"/>
 <ellipse cx="32" cy="46" rx="15" ry="11" fill="#fff"/><path d="M18 44c-5-2-9 0-11 4 5 0 8 1 11 0z" fill="#d7e1e8"/><path d="M46 44c5-2 9 0 11 4-5 0-8 1-11 0z" fill="#d7e1e8"/>
 <circle cx="32" cy="31" r="13" fill="#fff"/>
 <path d="M30 34l14 3-14 3z" fill="#f2a33a"/><path d="M30 37l14 0-14 3z" fill="#d9832a"/>
 <circle cx="27" cy="29" r="2.6" fill="#14202c"/><circle cx="27.8" cy="28.2" r=".9" fill="#fff"/>
 <circle cx="23" cy="34" r="2.2" fill="#f6b4b4" opacity=".7"/>
 <path d="M17 21c2-7 9-10 15-10s13 3 15 10z" fill="#1f3a5f"/><rect x="15" y="20" width="34" height="5" rx="2.5" fill="#fff"/><path d="M15 23h34" stroke="#1f3a5f" stroke-width="1.2"/>
 <path d="M32 13.5l1.4 2.8 3 .4-2.2 2.1.5 3-2.7-1.4-2.7 1.4.5-3-2.2-2.1 3-.4z" fill="#f2c94c"/>
 <path d="M26 54l-2 6M38 54l2 6" stroke="#f2a33a" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const listNames=(ids)=>ids.map(id=>I(id).name).join(', ');
function helperHint(){
  if(!S||!cfg)return null;
  const st=S.stage;
  if(view==='projector')return null;
  if(view==='teacher'){
    const r2=st===5?L.round2Progress(S,cfg).filter(x=>!x.ok):[];
    const T={1:'국가 정보를 함께 살펴본 뒤 [다음 단계 ▶]를 누르면 1차 생산이 시작돼요.',
      2:'학생들이 4번씩 생산하는 동안 아래 나라별 현황에서 확보율을 지켜보세요. 다 끝나면 [다음 단계 ▶].',
      3:'다음 단계로 넘어가면 1차 결과가 저장되고 창고와 생산 기회가 처음으로 돌아가요.',
      5:r2.length?`아직 생산 중인 나라: ${r2.map(x=>`${x.name} ${x.done}/${x.need}`).join(', ')}. 모두 끝나야 다음 단계로 갈 수 있어요.`:'네 나라 모두 생산을 마쳤어요. [다음 단계 ▶]로 무역을 시작하세요.',
      6:S.trades.some(t=>t.status==='pending')?'수락을 기다리는 거래가 있어요. 잘못된 거래는 거래 기록에서 [무효 처리]나 [거래 취소]를 할 수 있어요.':'학생들이 배를 몰아 다른 나라 항구에서 거래를 요청해요. 거래 기록이 여기에 쌓입니다.',
      7:'발표 화면 탭으로 1차·2차 결과와 무역 흐름을 함께 보며 이야기를 나눠 보세요.'};
    return T[st]||null;
  }
  const cid=view;const c=C(cid);if(!c)return null;
  const my=cst(cid);const sec=L.security(cfg,my.inv);
  const lacking=cfg.items.filter(it=>sec.per[it.id]<100).map(it=>it.id);
  if(st===1)return '우리 나라는 물품마다 한 번에 만들 수 있는 양이 달라요. 아래 표에서 우리 나라와 다른 나라를 비교해 보세요.';
  if(st===2||st===5){
    const why=L.canProduce(S);if(why)return why;
    if(st===5){
      const sp=L.specialties(cfg,cid).map(id=>I(id).name).join(', ');
      return my.chances>0?`이번에는 우리 나라가 가장 잘 만드는 물품(${sp})만 만들 수 있어요. 생산 기회가 ${my.chances}번 남았어요.`:'생산을 모두 마쳤어요! 다른 나라도 끝나면 선생님이 무역을 시작해 줄 거예요.';
    }
    if(my.chances===cfg.chances)return `물품 아래의 [생산하기] 버튼을 눌러 보세요. 생산 기회는 ${cfg.chances}번이에요. 막대가 끝까지 차면 그 물품은 100%예요.`;
    if(my.chances>0)return `생산 기회가 ${my.chances}번 남았어요. 아직 부족한 물품: ${listNames(lacking)||'없음'}.`;
    return `생산 기회를 모두 썼어요. 종합 확보율은 ${pct(sec.overall)}예요. 왜 100%가 되지 않았는지 생각해 보세요.`;
  }
  if(st===3)return '1차 결과에서 100%가 된 물품과 부족한 물품을 찾아 학습지에 적어 보세요. 아래 생산량 표도 함께 보세요.';
  if(st===6){
    const why=L.canTrade(S);if(why)return why;
    const inc=S.trades.filter(t=>t.status==='pending'&&t.to===cid);
    if(inc.length)return `${C(inc[0].from).name}에서 거래 요청이 왔어요! 아래 [거래 요청함]에서 내용을 확인하고 [수락하기]를 눌러 주세요.`;
    if(!lacking.length)return '네 물품 모두 100%예요! 다른 나라에서 요청이 오면 수락해서 도와줄 수 있어요.';
    const sh=shipOf(cid);
    if(sh.dock&&sh.dock!==cid){
      const T=C(sh.dock);
      if(S.trades.some(t=>t.status==='pending'&&t.from===cid&&t.to===sh.dock))return `${T.name}에 요청을 보냈어요. ${T.name}이 수락할 때까지 기다리거나, 다른 나라 항구에도 가 보세요.`;
      return `${T.name} 항구에 도착했어요. 우리가 줄 물품과 받을 물품을 고른 뒤 [거래 요청 보내기]를 눌러 보세요.`;
    }
    const sent=S.trades.filter(t=>t.status==='pending'&&t.from===cid);
    return `아직 부족한 물품: ${listNames(lacking)}. 방향키로 배를 몰아 그 물품을 가진 나라의 항구로 가 보세요.${sent.length?` (${sent.map(t=>C(t.to).name).join(', ')}에 보낸 요청은 기다리는 중)`:''}`;
  }
  if(st===7)return '1차와 2차 결과를 비교해 보세요. 무엇이 달라졌고, 왜 달라졌을까요?';
  return null;
}
function renderHelper(){
  let root=document.getElementById('helper-root');
  if(!root){root=document.createElement('div');root.id='helper-root';document.body.appendChild(root);}
  const hint=helperHint();
  if(!hint){root.innerHTML='';ui.helperOpen=false;return}
  const fresh=ui.helperLast!==undefined&&hint!==ui.helperLast&&!ui.helperOpen;
  if(fresh)ui.helperNew=true;
  ui.helperLast=hint;
  root.innerHTML=`<div class="helper${ui.helperOpen?' open':''}">
    ${ui.helperOpen?`<div class="helper-bubble" role="status" id="helper-bubble"><div class="helper-name">${esc(HELPER_NAME)}</div><p>${esc(hint)}</p><button class="helper-x" data-a="helper-close" aria-label="힌트 닫기">×</button></div>`:''}
    <button class="helper-btn${ui.helperNew?' new':''}" data-a="helper" aria-expanded="${!!ui.helperOpen}" aria-label="${esc(HELPER_NAME)}에게 힌트 듣기" title="힌트 보기">${HELPER_SVG}</button></div>`;
}
function render(force){
  if(!S||!cfg)return;
  if(!force&&editing()){ui.deferred=true;renderTop();return}
  ui.deferred=false;
  const prev={};document.querySelectorAll('.bar>i[data-k]').forEach(el=>{prev[el.dataset.k]=el.style.width});
  renderTop();
  const main=document.getElementById('main');
  const sy=window.scrollY;
  try{main.innerHTML=view==='teacher'?teacherView():view==='projector'?projectorView():studentView(view);}
  catch(err){console.error(err);main.innerHTML=`<section class="panel"><h2>화면을 그리지 못했어요</h2><p style="margin:0">이 방의 저장 내용이 지금 게임과 맞지 않아요. ${opts.mode==='teacher'?'[다른 방 열기]에서 새 수업 방을 만들어 주세요.':'새로고침해 보고, 계속되면 선생님께 말씀해 주세요.'}</p>${opts.mode==='teacher'?'<div class="row" style="margin-top:12px"><button class="btn accent small" data-a="rooms">다른 방 열기</button></div>':''}</section>`;}
  const bars=main.querySelectorAll('.bar>i[data-k]');
  bars.forEach(el=>{if(prev[el.dataset.k]!==undefined){el.style.transition='none';el.style.width=prev[el.dataset.k]}});
  void main.offsetWidth;
  bars.forEach(el=>{el.style.transition='';el.style.width=el.dataset.w+'%'});
  if(Math.abs(window.scrollY-sy)>2)window.scrollTo(0,sy);
  ui.pop=null;
  if(S.stage===6&&C(view))notifyIncoming(view);
  renderHelper();
  const d=document.getElementById('cfg-details');if(d)d.addEventListener('toggle',()=>{if(ui.cfgOpen!==d.open){ui.cfgOpen=d.open;render(true)}});
}
function setView(v){view=v;try{history.replaceState(null,'','#'+v)}catch(e){}store.set('tradeGame.view.'+opts.mode,v);render(true);window.scrollTo(0,0)}
function readCfg(){
  const n=L.clone(cfg);const v=(id)=>document.getElementById(id);
  n.countries.forEach((c,ci)=>{c.name=(v('cn-'+ci).value||c.name).slice(0,12);c.color=v('cc-'+ci).value;n.conditions.forEach(k=>{c.stats[k.id]=Math.max(1,Math.min(5,parseInt(v('cs-'+ci+'-'+k.id).value,10)||1))})});
  n.items.forEach((it,ii)=>{it.target=Math.max(1,parseInt(v('it-'+ii).value,10)||it.target);it.key=v('ik-'+ii).value});
  n.chances=Math.max(1,Math.min(8,parseInt(v('cfg-ch').value,10)||4));
  return n;
}

/* ---------- 이벤트 ---------- */
function onClick(e){
  const b=e.target.closest('[data-a]');if(!b||b.disabled)return;const a=b.dataset.a,cid=b.dataset.c;const B=opts.backend;
  if(a==='modal-no'){ui.modal=null;return renderModal()}
  if(a==='modal-yes'){const m=ui.modal;ui.modal=null;renderModal();return m.onOk()}
  if(a==='helper'){ui.helperOpen=!ui.helperOpen;ui.helperNew=false;return renderHelper()}
  if(a==='helper-close'){ui.helperOpen=false;renderHelper();const hb=document.querySelector('.helper-btn');if(hb)hb.focus();return}
  if(opts.onAction&&opts.onAction(a,b))return;
  if(!B||!S)return;
  if(a==='view')return setView(b.dataset.v);
  if(a==='modal-no'){ui.modal=null;return renderModal()}
  if(a==='modal-yes'){const m=ui.modal;ui.modal=null;renderModal();return m.onOk()}
  if(a==='fullscreen'){try{document.documentElement.requestFullscreen().catch(()=>{})}catch(err){}return}
  if(a==='produce'){
    const item=b.dataset.i;
    if(S.stage===5&&!L.specialties(cfg,cid).includes(item)){const sp=L.specialties(cfg,cid).map(i=>I(i).name).join('·');
      return ask('잠깐! 이 물품은 생산할 수 없어요',`<p style="margin:0">2차에서는 우리 나라가 <b>가장 잘 만드는 물품(${esc(sp)})</b>을 생산 기회 ${cfg.chances}번 모두 생산해야 해요.</p><p class="muted" style="margin:8px 0 0">네 나라가 모두 끝내야 다음 단계로 갈 수 있어요.</p>`,'알겠어요',()=>{},true,true)}
    return run('p-'+cid,()=>B.produce(cid,item)).then(r=>{if(r&&r.ok){ui.pop={c:cid,i:item,n:r.amount};render(true)}});
  }
  if(a==='undo')return run('p-'+cid,()=>B.undo(cid),'마지막 생산을 되돌렸어요.');
  if(a==='pg'){const key=cid+'>'+b.dataset.v,d=ui.port[key];d[b.dataset.k]=b.dataset.i;if(d.give===d.get)d.get=cfg.items.find(it=>it.id!==d.give).id;return render(true)}
  if(a==='sea-propose'){const to=b.dataset.v,d=ui.port[cid+'>'+to],U=L.tradeUnits(cfg),T=C(to);
    return run('tp-'+cid,()=>B.propose(cid,to,{item:d.give,qty:U[d.give]},{item:d.get,qty:U[d.get]}),`${T.name}의 거래 요청함에 요청을 보냈어요. ${T.name}이(가) 수락하면 거래가 이루어져요.`)}
  if(a==='sea-jump'){const s=shipOf(cid),p=SEA.port[seaIdx(b.dataset.v)];s.x=p[0];s.y=p[1];s.dock=b.dataset.v;return render(true)}
  if(a==='accept')return run('t-'+b.dataset.t,()=>B.accept(cid,b.dataset.t),'거래가 이루어졌어요. 창고가 바뀌었어요.');
  if(a==='reject')return run('t-'+b.dataset.t,()=>B.reject(cid,b.dataset.t),'요청을 취소했어요.');
  if(a==='revert'){const t=b.dataset.t;return ask('이 거래를 취소할까요?','두 나라의 창고를 거래 전으로 되돌립니다. 이미 다른 거래에 쓰인 물품이 있으면 취소할 수 없습니다.','거래 취소',()=>run('t-'+t,()=>B.revert(t),'거래를 취소했습니다.'),true)}
  if(a==='t-cancel'){const t=b.dataset.t;return run('t-'+t,()=>B.cancelTrade(t),'제안을 무효 처리했습니다.')}
  if(a==='stage'){const n=Number(b.dataset.n);if(n===S.stage||!L.STAGES.some(x=>x.n===n))return;
    const go=()=>run('stage',()=>B.setStage(n),`${L.stageNo(n)}단계로 바꿨습니다.`);
    if(L.roundOf(S.stage)===1&&L.roundOf(n)===2)return ask('2차 실험을 시작할까요?','1차 결과를 저장한 뒤, 모든 나라의 창고를 비우고 생산 기회를 다시 '+cfg.chances+'번으로 돌립니다.','2차 시작',go);
    if(L.roundOf(S.stage)===2&&L.roundOf(n)===1)return ask('1차 단계로 돌아갈까요?','저장해 둔 1차 결과로 되돌아가며, 2차 생산과 거래 기록은 지워집니다.','1차로 돌아가기',go,true);
    return go()}
  if(a==='reset')return ask('게임을 처음부터 다시 시작할까요?','모든 생산·거래 기록을 지우고 1단계로 돌아갑니다. 설정과 학생 접속은 유지됩니다.','전체 초기화',()=>{ui.draft={};run('reset',()=>B.reset(),'초기화했습니다.')},true);
  if(a==='cfg-apply'){const nc=readCfg();return run('cfg',()=>B.setConfig(nc),'설정을 적용했습니다.')}
  if(a==='cfg-default')return ask('기본 설정으로 되돌릴까요?','나라 이름·색·능력치와 목표량을 기본값으로 바꿉니다.','기본값으로',()=>run('cfg',()=>B.setConfig(L.clone(L.DEFAULT_CONFIG)),'기본 설정으로 바꿨습니다.'));
}
function onChange(e){const el=e.target;const a=el.dataset.a;const B=opts.backend;
  if(a==='lock'){const k=el.dataset.k,v=el.checked;run('lock',()=>B.setFlag('locks.'+k,v),v?'잠갔습니다.':'잠금을 풀었습니다.')}
  if(a==='undoflag'){const v=el.checked;run('undoflag',()=>B.setFlag('allowUndo',v))}
}

const TradeUI={
  mount(o){
    opts=o;
    const ok=(v)=>(o.tabs||[]).includes(v);
    if(o.fixedView)view=o.fixedView;
    else{const h=location.hash.slice(1);const sv=store.get('tradeGame.view.'+o.mode);view=ok(h)?h:ok(sv)?sv:(o.tabs||['teacher'])[0]}
    ui.draft={};ui.busy={};
  },
  update(state,config,ex){config=migrateCfg(config);S=state;cfg=config;extra=ex||{};render()},
  render(){render(true)},
  toast, ask, esc, flag, itemIcon,
  sailTo(cid,to){const s=shipOf(cid),p=SEA.port[seaIdx(to)];s.x=p[0];s.y=p[1];s.dock=to;render(true)},
  get view(){return view}
};
document.addEventListener('click',onClick);
document.addEventListener('change',onChange);
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&ui.modal){ui.modal=null;renderModal()}else if(e.key==='Escape'&&ui.helperOpen){ui.helperOpen=false;renderHelper()}});
document.addEventListener('focusout',()=>{setTimeout(()=>{if(ui.deferred&&!editing())render(true)},0)});
root.TradeUI=TradeUI;
})(window);
