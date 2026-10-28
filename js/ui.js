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
function flag(c,w){
  w=w||54;const h=Math.round(w*2/3);const col=esc(c.color);let body='';
  if(c.flag==='circle')body=`<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5.5" fill="${col}"/>`;
  else if(c.flag==='cross')body=`<rect width="30" height="20" fill="${col}"/><rect x="9" width="4" height="20" fill="#fff"/><rect y="8" width="30" height="4" fill="#fff"/>`;
  else if(c.flag==='diagonal')body=`<rect width="30" height="20" fill="#fff"/><path d="M0 20L30 0V20z" fill="${col}"/><circle cx="8" cy="6" r="2.4" fill="${col}"/>`;
  else body=`<rect width="30" height="20" fill="${col}"/><rect y="6.7" width="30" height="6.6" fill="#fff"/><rect x="2" y="2" width="4" height="3" fill="#fff" opacity=".8"/>`;
  return `<svg class="flag" width="${w}" height="${h}" viewBox="0 0 30 20" role="img" aria-label="${esc(c.name)} 국기">${body}</svg>`;
}

/* ---------- 도우미 ---------- */
const C=(id)=>L.countryById(cfg,id), I=(id)=>L.itemById(cfg,id);
const q=(n,id)=>`${n}${esc(I(id).unit)}`;
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
function ask(title,body,okLabel,onOk,danger){ui.modal={title,body,okLabel,onOk,danger};renderModal()}
function renderModal(){const r=document.getElementById('modal-root');if(!r)return;if(!ui.modal){r.innerHTML='';return}
  const m=ui.modal;r.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="box"><h2 id="mt" style="font-size:22px">${esc(m.title)}</h2><div>${m.body}</div><div class="row" style="justify-content:flex-end"><button class="btn ghost small" data-a="modal-no">취소</button><button class="btn small ${m.danger?'warn':'accent'}" data-a="modal-yes">${esc(m.okLabel)}</button></div></div></div>`;
  r.querySelector('[data-a="modal-yes"]').focus()}

const STUDENT_GUIDE={
 1:'우리나라와 다른 나라의 생산 수준과 생산량을 살펴보세요.',
 2:'생산 기회 4번으로 국민에게 필요한 물품을 직접 만들어 보세요. 이번에는 다른 나라와 교환할 수 없어요.',
 3:'1차 실험 결과를 보고 학습지에 분석해 보세요.',
 4:'다른 나라와 물품을 교환할 수 있다면, 어떤 상품을 생산하는 것이 좋을까요?',
 5:'모둠이 세운 계획대로 생산하세요. 창고는 비었고 생산 기회는 다시 4번이에요.',
 6:'다른 모둠과 직접 이야기해서 교환할 물품과 수량을 정한 뒤, 여기에 거래를 기록하세요.',
 7:'1차와 2차 결과를 비교하고 학습지에 답해 보세요.',
 8:'무역이 필요한 까닭을 학습지에 자기 말로 정리해 보세요.'
};
const TEACHER_GUIDE={
 1:['도입 5분','생활 속 수입품(바나나, 휴대폰 부품, 석유 등)을 떠올리며 탐구 문제를 세웁니다.','“모든 물건을 직접 만드는 것보다 다른 나라와 무역하는 것이 왜 유리할까?”'],
 2:['1차 탐구 8분','무역 없이 생산 기회 4번으로 네 가지 물품 100%에 도전합니다. 학생 선택을 바로잡지 마세요.','“네 가지를 모두 100% 확보할 수 있을까요?”'],
 3:['결과 분석 5분','개인 학습지에 실패 원인과 유리·불리한 물품을 적고, 생산량 표를 근거로 모둠에서 이야기합니다.','“왜 모든 물품을 100% 확보하지 못했을까요?” “우리나라가 생산에 유리한 물품과 불리한 물품은?”'],
 4:['2차 탐구 (계획)','이 단계로 넘어오면서 1차 결과가 저장되고 모든 창고와 생산 기회가 초기화되었습니다. 학생은 개인 학습지에 생산 계획을 적은 뒤 모둠 계획을 정합니다.','“다른 나라와 물품을 교환할 수 있다면, 어떤 상품을 생산하는 것이 좋을까요?”'],
 5:['2차 탐구 (생산)','모둠 계획대로 생산합니다. 생산은 다음 무역 단계에서도 남은 기회만큼 계속할 수 있습니다.','“우리 계획대로 생산했을 때 창고는 어떻게 달라졌나요?”'],
 6:['2차 탐구 (무역)','모둠끼리 직접 협상하고, 합의한 내용만 화면에 기록합니다. 받은 나라가 수락해야 성립합니다.','“무엇을 수출하고 무엇을 수입하나요?”'],
 7:['비교 및 일반화 8분','발표 화면으로 1차·2차 결과를 함께 봅니다. 모든 나라가 함께 나아진 점에 주목하게 합니다.','“1차와 2차는 무엇이 달랐나요?” “다른 나라도 우리와 무역하려 한 까닭은?”'],
 8:['정리 4분','무역의 필요성을 자기 말로 정리하고, 이 게임이 실제 경제를 단순화한 모형임을 안내합니다.','“나라마다 생산에 유리한 조건이 다른데…” 문장을 학생 말로 완성하게 합니다.']
};
const MODEL_NOTE='이 게임은 무역의 기본 원리를 알아보려고 나라의 생산 조건을 아주 단순하게 만든 학습 모형이에요. 실제 나라들은 수많은 물건을 만들고, 화폐로 사고팔며, 운송비·관세·국제 관계 같은 여러 조건이 함께 작용해요.';

/* ---------- 상단 ---------- */
function renderTop(){
  const st=L.STAGES[S.stage-1];
  const sc=document.getElementById('stagechip');sc.hidden=false;sc.textContent=`${S.stage}단계 · ${st.title}`;
  const tabs=opts.tabs||[];
  const name=(id)=>id==='teacher'?'교사 관제':id==='projector'?'발표 화면':(C(id)||{}).name;
  const label=opts.mode==='demo'?'<span class="demo-tag">시연 모드</span>':opts.mode==='teacher'?'':'';
  document.getElementById('views').innerHTML=tabs.length>1?label+tabs.map(id=>{const c=C(id);return `<button data-a="view" data-v="${id}" aria-pressed="${view===id}">${c?flag(c,20):''}${esc(name(id))}</button>`}).join(''):'';
  const hx=document.getElementById('hdr-extra');if(hx)hx.innerHTML=opts.headerExtra?opts.headerExtra():'';
  const off=document.getElementById('offline');if(off)off.hidden=extra.online!==false;
}

/* ---------- 학생 화면 ---------- */
function nationHead(c){
  return `<section class="panel" style="--nc:${esc(c.color)}"><div class="nation">${flag(c,72)}<div style="min-width:0"><div class="label">${S.stage}단계 · ${esc(L.STAGES[S.stage-1].title)}${opts.mode==='teacher'?' · 교사가 이 나라를 대신 조작하는 화면':''}</div><h2>${esc(c.name)}</h2><p class="guide" style="margin:0">${esc(STUDENT_GUIDE[S.stage])}</p></div></div>
  <div class="stage-strip" aria-label="수업 진행">${L.STAGES.map(s=>`<span class="${s.n===S.stage?'on':s.n<S.stage?'done':''}">${s.n}. ${esc(s.title)}</span>`).join('')}</div></section>`;
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
    </tbody></table></div><p class="muted" style="margin:10px 0 0;font-size:14px">나라마다 땅, 사람, 시설, 기술 같은 생산 조건이 달라서 물품마다 생산 수준이 달라요.</p></div>
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
function tradePanel(cid){
  const others=cfg.countries.filter(c=>c.id!==cid);
  const inv0=cst(cid).inv;const most=cfg.items.slice().sort((a,b)=>(inv0[b.id]||0)/b.target-(inv0[a.id]||0)/a.target)[0].id;
  const lack=cfg.items.filter(it=>it.id!==most).sort((a,b)=>(inv0[a.id]||0)/a.target-(inv0[b.id]||0)/b.target)[0].id;
  const d=ui.draft[cid]||(ui.draft[cid]={to:others[0].id,give:most,giveQty:1,get:lack,getQty:1});
  const blocked=L.canTrade(S);const st=cst(cid);
  const to=C(d.to);
  const seg=(kind)=>cfg.items.map(it=>`<button data-a="d-item" data-c="${cid}" data-k="${kind}" data-i="${it.id}" aria-pressed="${d[kind]===it.id}">${itemIcon(it.id,24)}${esc(it.name)}${kind==='give'?` <span class="num muted" style="font-size:12px">${q(st.inv[it.id]||0,it.id)}</span>`:''}</button>`).join('');
  const step=(kind)=>`<div class="stepper"><button data-a="d-step" data-c="${cid}" data-k="${kind}" data-d="-1" aria-label="1 줄이기">−</button><input id="qty-${cid}-${kind}" type="number" inputmode="numeric" min="1" value="${d[kind+'Qty']}" data-a="d-qty" data-c="${cid}" data-k="${kind}" aria-label="수량"><button data-a="d-step" data-c="${cid}" data-k="${kind}" data-d="1" aria-label="1 늘리기">+</button><span class="muted">${esc(I(d[kind]).unit)}</span></div>`;
  const pend=S.trades.filter(t=>t.status==='pending'&&(t.to===cid||t.from===cid));
  const done=S.trades.filter(t=>t.status==='done'&&(t.to===cid||t.from===cid));
  const short=(st.inv[d.give]||0)<d.giveQty;
  const busyP=!!ui.busy['tp-'+cid];
  return `<section class="panel"><h2>무역 · 물품 맞교환</h2>
   ${blocked?`<p class="callout">${esc(blocked)}</p>`:''}
   <div class="summary" style="margin-bottom:14px"><div class="label" style="margin-bottom:4px">우리나라 창고</div>${invMini(cid)}</div>
   <div class="grid2"><div style="display:grid;gap:12px;min-width:0">
     <div><div class="label" style="margin-bottom:6px">① 거래할 나라</div><div class="seg">${others.map(o=>`<button data-a="d-to" data-c="${cid}" data-v="${o.id}" aria-pressed="${d.to===o.id}">${flag(o,26)}${esc(o.name)}</button>`).join('')}</div></div>
     <div class="dir out"><div class="row"><span class="tag ex">수출</span><b>② 우리가 보낼 물품</b></div><div class="seg">${seg('give')}</div>${step('give')}${short?`<div style="color:var(--warn);font-size:14px;font-weight:600">우리 창고에 ${esc(I(d.give).name)}이(가) ${q(st.inv[d.give]||0,d.give)}밖에 없어요.</div>`:''}</div>
     <div class="dir in"><div class="row"><span class="tag im">수입</span><b>③ ${esc(to.name)}에서 받을 물품</b></div><div class="seg">${seg('get')}</div>${step('get')}</div>
     <div class="summary">우리 <b>${esc(I(d.give).name)} ${q(d.giveQty,d.give)}</b>를 ${esc(to.name)}에 보내고, ${esc(to.name)}의 <b>${esc(I(d.get).name)} ${q(d.getQty,d.get)}</b>를 받아요.</div>
     <button class="btn accent" data-a="propose" data-c="${cid}" ${blocked||short||d.give===d.get||busyP?'disabled':''}>④ 거래 제안하기</button>
     ${d.give===d.get?'<div class="muted" style="font-size:14px">같은 물품끼리는 교환할 수 없어요.</div>':''}
   </div>
   <div style="display:grid;gap:12px;align-content:start;min-width:0">
     <h3>도착한 제안과 보낸 제안</h3>
     ${pend.length?pend.map(t=>{const inc=t.to===cid;const o=C(inc?t.from:t.to);const b=!!ui.busy['t-'+t.id];return `<div class="deal ${inc?'incoming':''}"><div class="row"><span class="tag pend">${inc?'받은 제안':'보낸 제안 · 기다리는 중'}</span>${flag(o,22)}<b>${esc(o.name)}</b></div>${dealText(t,cid)}
       <div class="row">${inc?`<button class="btn good small" data-a="accept" data-c="${cid}" data-t="${t.id}" ${blocked||b?'disabled':''}>수락하기</button><button class="btn ghost small" data-a="reject" data-c="${cid}" data-t="${t.id}" ${b?'disabled':''}>거절</button>`:`<button class="btn ghost small" data-a="reject" data-c="${cid}" data-t="${t.id}" ${b?'disabled':''}>제안 취소</button>`}</div></div>`}).join(''):'<p class="muted" style="margin:0">아직 없어요.</p>'}
     <h3 style="margin-top:6px">성립한 거래</h3>
     ${done.length?done.slice().reverse().map(t=>{const o=C(t.from===cid?t.to:t.from);return `<div class="deal"><div class="row">${flag(o,22)}<b>${esc(o.name)}</b><span class="tag" style="background:var(--good-bg);color:var(--good)">성립</span></div>${dealText(t,cid)}</div>`}).join(''):'<p class="muted" style="margin:0">아직 없어요.</p>'}
   </div></div></section>`;
}
function sheet(title,qs,tip){
  return `<section class="panel"><h2>${esc(title)} <span class="tag pend" style="font-family:var(--f-body);font-size:13px">개인 학습지</span></h2><ol class="qs">${qs.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><p class="muted" style="margin:10px 0 0">${esc(tip||'각자 학습지에 생각을 적은 뒤 모둠에서 이야기해 보세요.')}</p></section>`;
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
   <div><h3>다른 나라의 종합 확보율</h3><div style="display:grid;gap:8px">${cfg.countries.map(o=>{const s=L.security(cfg,r1Data(o.id).inv);return `<div style="display:grid;grid-template-columns:100px 1fr 70px;gap:8px;align-items:center"><span class="itemhead">${flag(o,22)}${esc(o.name)}</span>${bar('r1o-'+o.id,s.overall,'var(--accent)')}<span class="num" style="text-align:right">${pct(s.overall)}</span></div>`}).join('')}</div></div></div></section>
   ${sheet('1차 결과 분석',['왜 모든 물품을 100% 확보하지 못했을까요?','우리나라가 생산에 유리한 물품과 불리한 물품은 무엇인가요?'])}`;
}
function strategyPanel(cid){
  return `<section class="panel"><h2>2차 생산 계획 세우기</h2><p class="callout" style="margin:0;font-size:18px"><b>다른 나라와 물품을 교환할 수 있다면, 어떤 상품을 생산하는 것이 좋을까요?</b><br><span class="muted" style="font-size:15px">1차 결과와 생산량 비교표를 근거로 각자 학습지에 생산 계획과 까닭을 적은 뒤, 모둠의 계획을 하나로 정하세요.</span></p></section>
   <section class="panel"><h2>참고: 우리나라 1차 결과</h2>${resultBlock(cid,r1Data(cid),'1차 실험')}</section>`;
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
  const nodes=ids.map(id=>{const c=C(id),[x,y]=pos[id];return `<g><circle cx="${x}" cy="${y}" r="${id===me?40:34}" fill="${esc(c.color)}"/><text x="${x}" y="${y+6}" text-anchor="middle" font-size="17" fill="#fff" font-family="Do Hyeon,sans-serif">${esc(c.name)}</text></g>`}).join('');
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
   <div class="panel"><h2>나라 사이 무역 흐름</h2>${flowSVG(cid)}</div></section>
   ${sheet('결과 비교 질문',['1차 실험과 2차 실험은 무엇이 달랐나요?','우리나라는 어떤 물품을 집중 생산했나요? 그 이유는 무엇인가요?','무역을 통해 우리나라가 얻은 것은 무엇인가요?','다른 나라에서도 우리나라와 무역하려고 한 이유는 무엇인가요?'])}`;
}
function finalPanel(){
  return `${sheet('최종 탐구 정리',['국가 간 무역이 필요한 이유를 우리 말로 설명해 봅시다.'],'학습지에 자기 말로 정리한 뒤 발표해 보세요.')}
   <section class="panel"><h2>알아 두기</h2><p class="callout" style="margin:0">${esc(MODEL_NOTE)}</p></section>`;
}
function studentView(cid){
  const s=S.stage;let h=nationHead(C(cid));
  if(s===1)h+=infoPanel(cid,true);
  else if(s===2)h+=productionPanel(cid)+infoPanel(cid,false);
  else if(s===3)h+=round1Panel(cid);
  else if(s===4)h+=strategyPanel(cid)+infoPanel(cid,true);
  else if(s===5)h+=productionPanel(cid)+infoPanel(cid,false);
  else if(s===6)h+=tradePanel(cid)+productionPanel(cid);
  else if(s===7)h+=comparePanel(cid);
  else h+=finalPanel()+comparePanel(cid);
  return h;
}

/* ---------- 교사 화면 ---------- */
function teacherView(){
  const g=TEACHER_GUIDE[S.stage];
  const stages=`<div class="stepper-stages">${L.STAGES.map(s=>`<button data-a="stage" data-n="${s.n}" ${s.n===S.stage?'aria-current="step"':''}><b>${s.n}단계</b>${esc(s.title)}</button>`).join('')}</div>`;
  const cards=cfg.countries.map(c=>{const st=cst(c.id),sec=L.security(cfg,st.inv),sp=L.specialties(cfg,c.id).map(i=>I(i).name).join('·')||'없음';
    const r1=S.round1&&S.round1[c.id]?L.security(cfg,S.round1[c.id].inv).overall:null;
    const seat=extra.seats?extra.seats[c.id]:null;
    return `<div class="ncard" style="--nc:${esc(c.color)}"><div class="hd">${flag(c,30)}<h3>${esc(c.name)}</h3><span class="spec">특화: ${esc(sp)}</span></div>
     ${seat!==undefined&&seat!==null?`<div class="muted" style="font-size:13px"><span class="dot ${seat.online?'':'off'}"></span> ${seat.online?'접속 중':'연결 끊김'}</div>`:extra.seats?'<div class="muted" style="font-size:13px"><span class="dot idle"></span> 아직 들어오지 않음</div>':''}
     <div class="row" style="justify-content:space-between"><span><span class="label">종합</span> <b class="num" style="font-size:20px">${pct(sec.overall)}</b></span><span class="muted" style="font-size:13px">기회 <b class="num">${st.chances}</b>/${cfg.chances}${r1!==null?` · 1차 <span class="num">${pct(r1)}</span>`:''}</span></div>
     <div class="mini">${cfg.items.map(it=>`${itemIcon(it.id,20)}${bar('t-'+c.id+it.id,sec.per[it.id],itemColor(it.id))}<span class="num">${q(st.inv[it.id]||0,it.id)}</span>`).join('')}</div>
     <div class="chips">${st.log.filter(l=>l.round===round()).map(l=>`<span class="chip" style="padding:2px 6px">${itemIcon(l.item,16)}</span>`).join('')}</div></div>`}).join('');
  const trades=S.trades.slice().reverse();
  const statusName={pending:'대기',done:'성립',rejected:'거절',withdrawn:'제안 취소',reverted:'교사 취소',expired:'단계 변경으로 무효'};
  const tlog=trades.length?`<div class="tablewrap"><table><thead><tr><th>번호</th><th>제안한 나라 → 받은 나라</th><th>제안국이 보냄</th><th>제안국이 받음</th><th>상태</th><th></th></tr></thead><tbody>${trades.map(t=>`<tr><td class="num">${S.trades.indexOf(t)+1}</td><td>${esc(C(t.from).name)} → ${esc(C(t.to).name)}</td><td class="num">${esc(I(t.give.item).name)} ${q(t.give.qty,t.give.item)}</td><td class="num">${esc(I(t.get.item).name)} ${q(t.get.qty,t.get.item)}</td><td>${statusName[t.status]||t.status}</td><td>${t.status==='done'?`<button class="btn ghost small" data-a="revert" data-t="${t.id}">거래 취소</button>`:t.status==='pending'?`<button class="btn ghost small" data-a="t-cancel" data-t="${t.id}">무효 처리</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted" style="margin:0">아직 거래 기록이 없습니다.</p>';
  const tot=L.totals({countries:Object.fromEntries(cfg.countries.map(c=>[c.id,cst(c.id)]))},cfg);
  const demoTail=opts.mode==='demo'?`<section class="panel"><h2>시연 모드</h2><p class="muted" style="margin:0">이 기기 안에서만 저장됩니다. 위쪽 탭으로 나라를 바꿔 가며 수업 흐름을 시험할 수 있고, 같은 브라우저의 다른 탭에서 열어도 상태가 함께 바뀝니다.</p><div class="row" style="margin-top:12px"><button class="btn warn small" data-a="reset">게임 전체 초기화</button></div></section>`:'';
  return `${opts.teacherExtra?opts.teacherExtra():''}<section class="panel"><h2>수업 단계</h2>${stages}
    <div class="row" style="margin-top:12px;justify-content:space-between"><div class="row"><button class="btn ghost small" data-a="stage" data-n="${S.stage-1}" ${S.stage<=1?'disabled':''}>◀ 이전 단계</button><button class="btn accent small" data-a="stage" data-n="${S.stage+1}" ${S.stage>=8?'disabled':''}>다음 단계 ▶</button></div>
    <div class="row"><label class="switch"><input type="checkbox" id="lock-prod" data-a="lock" data-k="production" ${S.locks.production?'checked':''}>생산 잠금</label><label class="switch"><input type="checkbox" id="lock-trade" data-a="lock" data-k="trade" ${S.locks.trade?'checked':''}>무역 잠금</label><label class="switch"><input type="checkbox" id="allow-undo" data-a="undoflag" ${S.allowUndo?'checked':''}>학생 되돌리기 허용</label></div></div>
    <div class="callout" style="margin-top:12px"><b>${esc(g[0])}</b> · ${esc(g[1])}<br><span class="muted">발문</span> ${esc(g[2])}</div></section>
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
  const st=L.STAGES[S.stage-1];
  const Q={1:'모든 물건을 직접 만드는 것보다 다른 나라와 무역하는 것이 왜 유리할까?',2:'네 가지 물품을 모두 100% 확보할 수 있을까요?',3:'왜 모든 물품을 100% 확보하지 못했을까요?',4:'다른 나라와 물품을 교환할 수 있다면, 어떤 상품을 생산하는 것이 좋을까요?',5:'우리 모둠의 계획대로 생산해 봅시다.',6:'무엇을 수출하고 무엇을 수입하나요?',7:'1차와 2차는 무엇이 달랐나요? 모든 나라가 함께 나아졌나요?',8:'나라마다 생산에 유리한 조건이 다르기 때문에…'};
  const showR1=S.stage===3||S.stage===4;
  const data=(id)=>showR1?r1Data(id):cst(id);
  const all=cfg.countries.map(c=>L.security(cfg,data(c.id).inv).overall);
  const avg=Math.round(all.reduce((a,b)=>a+b,0)/all.length*100)/100;
  const avg1=S.round1?Math.round(cfg.countries.map(c=>L.security(cfg,r1Data(c.id).inv).overall).reduce((a,b)=>a+b,0)/cfg.countries.length*100)/100:null;
  const cards=cfg.countries.map(c=>{const d=data(c.id),sec=L.security(cfg,d.inv);const r1=S.round1&&S.stage>=7?L.security(cfg,r1Data(c.id).inv).overall:null;
    return `<div class="ncard" style="--nc:${esc(c.color)}"><div class="hd">${flag(c,40)}<h3>${esc(c.name)}</h3><b class="num" style="margin-left:auto;font-size:24px">${r1!==null?`<span class="muted" style="font-size:16px">${pct(r1)} →</span> `:''}${pct(sec.overall)}</b></div>
     <div class="mini">${cfg.items.map(it=>`${itemIcon(it.id,24)}${bar('p-'+c.id+it.id,sec.per[it.id],itemColor(it.id))}<span class="num">${pct(sec.per[it.id])}</span>`).join('')}</div></div>`}).join('');
  return `<div class="proj"><div class="hero"><div class="row" style="justify-content:space-between"><span style="opacity:.7">${S.stage}단계 · ${esc(st.title)}</span>${document.fullscreenEnabled?`<button class="btn ghost small" data-a="fullscreen" style="color:var(--bg);box-shadow:inset 0 0 0 1.5px currentColor">전체 화면</button>`:''}</div><h2>${esc(Q[S.stage])}</h2></div>
   <section class="panel"><div class="together"><div><div class="label">${showR1?'1차 실험 · ':''}네 나라가 함께 확보한 국민 생활 물품</div><div class="v num">${pct(avg)}</div></div>
     <div style="flex:1;min-width:200px">${bar('p-avg',avg,'var(--accent)',true)}${avg1!==null&&S.stage>=7?`<p class="muted" style="margin:8px 0 0">1차 자급자족 때는 <b class="num">${pct(avg1)}</b>였어요.</p>`:''}</div></div></section>
   <section class="nations">${cards}</section>
   ${S.stage>=6?`<section class="panel"><h2>나라 사이 무역 흐름</h2>${flowSVG(null)}</section>`:''}
   ${S.stage===8?`<section class="panel"><p class="callout" style="margin:0;font-size:18px">${esc(MODEL_NOTE)}</p></section>`:''}</div>`;
}

/* ---------- 렌더링 ---------- */
function editing(){const ae=document.activeElement;return ae&&ae.closest&&ae.closest('#main')&&(ae.tagName==='INPUT'&&ae.type!=='checkbox'||ae.tagName==='TEXTAREA'||ae.tagName==='SELECT')}
function render(force){
  if(!S||!cfg)return;
  if(!force&&editing()){ui.deferred=true;renderTop();return}
  ui.deferred=false;
  const prev={};document.querySelectorAll('.bar>i[data-k]').forEach(el=>{prev[el.dataset.k]=el.style.width});
  renderTop();
  const main=document.getElementById('main');
  const sy=window.scrollY;
  main.innerHTML=view==='teacher'?teacherView():view==='projector'?projectorView():studentView(view);
  const bars=main.querySelectorAll('.bar>i[data-k]');
  bars.forEach(el=>{if(prev[el.dataset.k]!==undefined){el.style.transition='none';el.style.width=prev[el.dataset.k]}});
  void main.offsetWidth;
  bars.forEach(el=>{el.style.transition='';el.style.width=el.dataset.w+'%'});
  if(Math.abs(window.scrollY-sy)>2)window.scrollTo(0,sy);
  ui.pop=null;
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
  if(opts.onAction&&opts.onAction(a,b))return;
  if(!B||!S)return;
  if(a==='view')return setView(b.dataset.v);
  if(a==='modal-no'){ui.modal=null;return renderModal()}
  if(a==='modal-yes'){const m=ui.modal;ui.modal=null;renderModal();return m.onOk()}
  if(a==='fullscreen'){try{document.documentElement.requestFullscreen().catch(()=>{})}catch(err){}return}
  if(a==='produce'){
    const item=b.dataset.i;
    return run('p-'+cid,()=>B.produce(cid,item)).then(r=>{if(r&&r.ok){ui.pop={c:cid,i:item,n:r.amount};render(true)}});
  }
  if(a==='undo')return run('p-'+cid,()=>B.undo(cid),'마지막 생산을 되돌렸어요.');
  if(a==='d-to'){ui.draft[cid].to=b.dataset.v;return render(true)}
  if(a==='d-item'){ui.draft[cid][b.dataset.k]=b.dataset.i;return render(true)}
  if(a==='d-step'){const d=ui.draft[cid],k=b.dataset.k+'Qty';d[k]=Math.max(1,(d[k]||1)+Number(b.dataset.d));return render(true)}
  if(a==='propose'){const d=ui.draft[cid];
    return run('tp-'+cid,()=>B.propose(cid,d.to,{item:d.give,qty:d.giveQty},{item:d.get,qty:d.getQty}),`${C(d.to).name}에 거래를 제안했어요. 상대 나라가 수락하면 성립해요.`)}
  if(a==='accept')return run('t-'+b.dataset.t,()=>B.accept(cid,b.dataset.t),'거래가 성립했어요. 창고가 바뀌었어요.');
  if(a==='reject')return run('t-'+b.dataset.t,()=>B.reject(cid,b.dataset.t));
  if(a==='revert'){const t=b.dataset.t;return ask('이 거래를 취소할까요?','두 나라의 창고를 거래 전으로 되돌립니다. 이미 다른 거래에 쓰인 물품이 있으면 취소할 수 없습니다.','거래 취소',()=>run('t-'+t,()=>B.revert(t),'거래를 취소했습니다.'),true)}
  if(a==='t-cancel'){const t=b.dataset.t;return run('t-'+t,()=>B.cancelTrade(t),'제안을 무효 처리했습니다.')}
  if(a==='stage'){const n=Number(b.dataset.n);if(n===S.stage||n<1||n>8)return;
    const go=()=>run('stage',()=>B.setStage(n),`${n}단계로 바꿨습니다.`);
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
  if(a==='d-qty'){const d=ui.draft[el.dataset.c];d[el.dataset.k+'Qty']=Math.max(1,parseInt(el.value,10)||1);el.blur();render(true)}
}

const TradeUI={
  mount(o){
    opts=o;
    const ok=(v)=>(o.tabs||[]).includes(v);
    if(o.fixedView)view=o.fixedView;
    else{const h=location.hash.slice(1);const sv=store.get('tradeGame.view.'+o.mode);view=ok(h)?h:ok(sv)?sv:(o.tabs||['teacher'])[0]}
    ui.draft={};ui.busy={};
  },
  update(state,config,ex){S=state;cfg=config;extra=ex||{};render()},
  render(){render(true)},
  toast, ask, esc, flag, itemIcon,
  get view(){return view}
};
document.addEventListener('click',onClick);
document.addEventListener('change',onChange);
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&ui.modal){ui.modal=null;renderModal()}});
document.addEventListener('focusout',()=>{setTimeout(()=>{if(ui.deferred&&!editing())render(true)},0)});
root.TradeUI=TradeUI;
})(window);
