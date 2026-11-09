/* ───────────── interactions, rechargement en direct ───────────── */
function select(sel){ S.sel=sel; S.openCol=null; renderAll(); }
function renderAll(){ renderTop(); renderStatus(); if(S.tab==="canvas"){ renderCards(); requestAnimationFrame(drawEdges); renderPanel(); } }
function findingsFor(file){ const f=(S.check||[]).filter(x=>x.fichier===file&&x.niv!=="info"); if(!f.length) return "";
  return `<div class="p-sec chk-sec"><h4>Contrôle <span class="c">${f.length}</span></h4><ul class="iss">${f.map(x=>`<li class="${x.niv==="erreur"?"bad":""}">${esc(x.msg)}</li>`).join("")}</ul></div>`; }
function renderStatus(){
  const ck=S.check||[]; const e=ck.filter(f=>f.niv==="erreur").length, a=ck.filter(f=>f.niv==="alerte").length;
  const open=listeQuestions().filter(q=>q.statut==="ouverte").length;
  $("#st-live").className="live "+(S.online?"on":"off"); $("#st-live").textContent=S.online?"En direct":"Serveur arrêté";
  $("#st-at").textContent=S.loadedAt?`spec chargée à ${new Date(S.loadedAt).toLocaleTimeString("fr-FR")}`:"";
  $("#st-chk").innerHTML=`<button class="btn sm ghost" id="b-chk" aria-expanded="${!!S.showChk}"><b style="color:${e?"var(--bad)":"var(--ok)"}">${e} erreur${e>1?"s":""}</b> · ${a} alerte${a>1?"s":""}</button> · ${open} question${open>1?"s":""} ouverte${open>1?"s":""}`;
  $("#b-chk").onclick=()=>{ S.showChk=!S.showChk; renderStatus(); };
  const box=$("#chk-list"); box.hidden=!S.showChk||!ck.length;
  if(!box.hidden){ const by={}; ck.filter(f=>f.niv!=="info").forEach(f=>(by[f.fichier]=by[f.fichier]||[]).push(f));
    box.innerHTML=Object.keys(by).sort().map(k=>`<div><span class="mono" style="font-size:11.5px">${esc(k)}</span><ul class="iss">${by[k].map(f=>`<li class="${f.niv==="erreur"?"bad":""}">${esc(f.msg)}</li>`).join("")}</ul></div>`).join("")||'<p class="note">Rien à signaler.</p>'; }
}
$("#b-flows").onclick=()=>{ S.flows=!S.flows; renderAll(); };
$("#b-mask").onclick=()=>{ S.mask=!S.mask; renderAll(); };
$("#cards").addEventListener("click",e=>{
  if(S.dragged){ S.dragged=false; return; }
  const fx=e.target.closest("[data-flux]"); if(fx) return select({type:"flux",id:fx.dataset.flux});
  const col=e.target.closest("[data-col]"); const card=e.target.closest(".card"); if(!card) return;
  if(card.dataset.ds){ S.sel={type:"ds",id:card.dataset.ds}; S.openCol=col?col.dataset.col:null; renderAll();
    if(col){ const el=document.querySelector(`.colrow[data-colname="${CSS.escape(col.dataset.col.split(".")[1])}"]`); el?.scrollIntoView({block:"center"}); } }
  else if(card.dataset.gold) select({type:"gold",id:card.dataset.gold});
});
$("#cwrap").addEventListener("click",e=>{ if(["canvas","cwrap","cards"].includes(e.target.id)&&S.sel){ S.sel=null; renderAll(); } });
let drag=null;
$("#cards").addEventListener("pointerdown",e=>{ const h=e.target.closest("[data-drag]"); if(!h) return; const [kind,id]=h.dataset.drag.split(/:(.*)/s); const o=kind==="ds"?DS(id):GT(id); if(!o) return; drag={kind,id,o,sx:e.clientX,sy:e.clientY,ox:o.x,oy:o.y,el:h.parentElement,moved:false}; h.setPointerCapture(e.pointerId); });
$("#cards").addEventListener("pointermove",e=>{ if(!drag) return; const dx=e.clientX-drag.sx, dy=e.clientY-drag.sy; if(Math.abs(dx)+Math.abs(dy)>3) drag.moved=true; drag.o.x=Math.max(0,Math.round(drag.ox+dx)); drag.o.y=Math.max(0,Math.round(drag.oy+dy)); drag.el.style.left=drag.o.x+"px"; drag.el.style.top=drag.o.y+"px"; drawEdges(); });
$("#cards").addEventListener("pointerup",()=>{ if(!drag) return; if(drag.moved){ S.dragged=true; fetch("/api/layout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:drag.kind,id:drag.id,x:drag.o.x,y:drag.o.y})}).catch(()=>{}); } drag=null; });
$("#panel").addEventListener("toggle",e=>{ const dt=e.target; if(dt.classList?.contains("colrow")&&dt.open&&S.sel?.type==="ds") S.openCol=S.sel.id+"."+dt.dataset.colname; },true);
$("#panel").addEventListener("click",async e=>{
  const b=e.target.closest("[data-act]"); if(!b) return; const a=b.dataset.act;
  if(a==="openflux"){ e.preventDefault(); return select({type:"flux",id:b.dataset.id}); }
  if(a==="close") return select(null);
  if(a==="cpq"){ const t=`/question-suivante ${b.dataset.q}`; try{ await navigator.clipboard.writeText(t); toast("Copié : colle-le dans le chat Cursor"); }catch(_){ toast(t); } }
});

/* chargement de l'état depuis le serveur, puis à chaque modification de fichier */
function sig(st){ const m=new Map(); st.datasets.forEach(d=>{ const {rows,_prof,x,y,...r}=d; m.set("ds:"+d.id,JSON.stringify(r)); }); st.flux.forEach(f=>m.set("flux:"+f.id,JSON.stringify(f))); st.gold.forEach(t=>m.set("gold:"+t.id,JSON.stringify(t.columns))); return m; }
let lastSig=null, lastRep=null;
async function loadState(){
  try{
    const r=await fetch("/api/state"+location.search,{cache:"no-store"}); const j=await r.json();
    S.st=hydrate(j.state); S.ver++; S.check=(j.errors||[]).concat(checkSpec()); S.loadedAt=j.at; S.online=true;
    S.vue=j.vue||null;
    if(S.vue&&!S.vueInit){ S.vueInit=true; const sel=$("#sel-adh"); sel.innerHTML=S.vue.adherents.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join(""); sel.value=new URLSearchParams(location.search).get("adherent")||S.vue.adherents[0]||""; if(S.vue.role==="adherent") setTab("q"); else if(!S.vue.adherents.length) setTab("adh"); }
    if(S.sel){ const ok=S.sel.type==="ds"?DS(S.sel.id):S.sel.type==="flux"?FX(S.sel.id):S.sel.type==="gold"?GT(S.sel.id):S.st.relations.find(r=>r.id===S.sel.id); if(!ok) S.sel=null; }
    const now=sig(S.st); const changedKeys=lastSig?[...now.keys()].filter(k=>lastSig.get(k)!==now.get(k)):[]; lastSig=now;
    renderAll(); if(S.tab!=="canvas") renderTab(); 
    const nRep=(S.st.reponses||[]).length, bouge=changedKeys.length||nRep!==lastRep; lastRep=nRep;
    if(S.vue&&S.tab!=="prev"&&(bouge||!S.tuiles)){ try{ renderPrev(); }catch(_){} }
    changedKeys.forEach(k=>{ const [kind,id]=k.split(/:(.*)/s); const el=kind==="ds"?document.querySelector(`.card[data-ds="${CSS.escape(id)}"]`):kind==="flux"?document.getElementById("fx-"+id):document.querySelector(`.card[data-gold="${CSS.escape(id)}"]`); if(el){ el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } });
    if(changedKeys.length&&!(S.qFlash&&Date.now()-S.qFlash.t<5000)) toast(`Spec mise à jour : ${changedKeys.map(k=>k.split(":")[1]).join(", ")}`);
  }catch(e){ S.online=false; if(S.st) renderStatus(); else $("#panel").innerHTML=`<div class="p-empty"><h3>Serveur introuvable</h3><p>Lance <span class="mono">npm run serve</span> dans le terminal de Cursor, puis recharge.</p></div>`; }
}
const es=new EventSource("/events"+location.search);
es.addEventListener("spec",()=>loadState());
es.addEventListener("statut",()=>{ if(S.tab==="adh") renderAdh(); });
es.addEventListener("adherents",()=>{ if(S.tab==="adh"&&(!N||N.resultat)) renderAdh(); });
/* Maquette : une requête légère à la fois (au plus une en vol, une de plus en attente), état complet une fois le run terminé. */
let majMaq=false, majMaqEncore=false;
async function suivreMaquette(){
  if(majMaq){ majMaqEncore=true; return; } majMaq=true;
  try{
    const r=await fetch("/api/maquette"+location.search,{cache:"no-store"}); if(!r.ok) throw new Error("statut");
    const j=await r.json(), fini=!!(S.vue&&S.vue.maquette&&!S.vue.maquette.fin)&&j.maquette&&j.maquette.fin;
    if(S.vue) S.vue.maquette=j.maquette;
    if(fini||!(S.tab==="q"&&majBlocMaquette())) await loadState();
  }catch(_){ await loadState(); }
  finally{ majMaq=false; if(majMaqEncore){ majMaqEncore=false; suivreMaquette(); } }
}
es.addEventListener("maquette",()=>suivreMaquette());
/* Filet de sécurité : si le flux d'événements ne livre rien (proxy, onglet en veille, trop de flux ouverts), on interroge l'état léger toutes les 2 s tant que la maquette tourne. */
setInterval(()=>{ const m=S.vue&&S.vue.maquette; if(m&&!m.fin&&S.tab==="q"&&!document.hidden) suivreMaquette(); },2000);
es.addEventListener("apprentissage",()=>loadState().then(()=>{ if(S.tab==="adh") renderAdh(); }));
es.addEventListener("code",()=>location.reload());
es.onopen=()=>{ if(S.st&&!S.online){ S.online=true; loadState(); } };
es.onerror=()=>{ S.online=false; if(S.st) renderStatus(); };
window.addEventListener("resize",()=>requestAnimationFrame(drawEdges));
if(document.fonts?.ready) document.fonts.ready.then(()=>requestAnimationFrame(drawEdges));
$("#sel-adh").onchange=e=>{ location.search="?adherent="+encodeURIComponent(e.target.value); };
$("#b-out").onclick=async()=>{ await fetch("/api/deconnexion",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}); location.href="/connexion"; };
loadState();
