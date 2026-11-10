"use strict";
const $=s=>document.querySelector(s);
function toast(msg){const t=document.createElement("div");t.className="toast";t.setAttribute("role","status");t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
function renderTop(){
  document.title=`${S.st.adherent} · atelier`;
  $("#adherent").textContent=S.st.adherent;
  $("#socs").innerHTML=S.st.societes.map(s=>`<span class="chip" style="color:${socColor(s.id)}"><span class="dot"></span><span style="color:var(--fg)">${esc(s.name)}</span></span>`).join("");
  const c=measureCounts(); const tot=c.ok+c.part+c.none+c.err;
  const besoins = S.st.besoins || { themes: [], libres: [] };
  const themesChoisis = besoins.themes.filter(t => t.choisi).length;
  const total = CAT().list.length - c.hors;
  const adh = S.vue?.role === "adherent";
  const jaugeText = adh ? `${c.ok} indicateur${c.ok>1?"s":""} sur ${tot}` : themesChoisis ? `${total} choisies, ${c.ok + c.part} alimentées` : `Mesures ${c.ok + c.part}/${CAT().list.length}`;
  $("#m-bar").style.width=(tot?(adh?c.ok:c.ok+c.part*.5)/tot*100:0)+"%"; $("#m-txt").textContent=jaugeText; $("#m-lib").textContent=adh?"Prêts":"Mesures"; if(adh) $(".meter").title="Indicateurs de votre tableau de bord déjà calculables";
  $("#b-flows").classList.toggle("on",S.flows); $("#b-mask").classList.toggle("on",S.mask);
}
/* ───────────── rendu canvas ───────────── */
const MAXCOLS=14;
function renderCards(){
  const box=$("#cards"); let h=""; const fa=buildFaits();
  S.st.datasets.forEach(d=>{
    const s=dsStats(d), col=socColor(d.societe);
    h+=`<div class="card${S.sel?.type==="ds"&&S.sel.id===d.id?" sel":""}" data-ds="${esc(d.id)}" style="left:${d.x}px;top:${d.y}px">
      <div class="hd" data-drag="ds:${esc(d.id)}"><span class="dot" style="color:${col}"></span><span class="nm">${esc(d.id)}</span><span class="n">${d.rows.length.toLocaleString("fr-FR")}</span><span class="st st-${s.st}">${ST_LABEL[s.st]}</span></div>
      <div class="prog"><i style="width:${Math.round(s.ratio*100)}%;background:${s.ratio===1?"var(--ok)":"var(--warn)"}"></i></div>
      <ul class="cols">${d.columns.slice(0,MAXCOLS).map(c=>{ const p=d._prof[c.name]; const dup=c.role==="key"&&p&&!p.unique;
        return `<li class="col${S.linking?" linkable":""}${S.linkFrom===d.id+"."+c.name?" linkfrom":""}" id="c-${esc(d.id)}-${esc(c.name)}" data-col="${esc(d.id)}.${esc(c.name)}" title="${esc(c.desc||"Non documentée")}"><span class="dd${c.desc&&c.type?" ok":""}"></span><span class="cn">${esc(c.name)}</span>${c.pii?'<span class="pii">PII</span>':""}${dup?'<span class="pii" title="Clé non unique">≠</span>':""}<span class="ty">${esc(c.type||"?")}</span><span class="rl rl-${c.role}">${ROLE_TAG[c.role]||""}</span></li>`; }).join("")}
      ${d.columns.length>MAXCOLS?`<li class="col more" id="more-${esc(d.id)}">+ ${d.columns.length-MAXCOLS} colonnes</li>`:""}</ul></div>`;
  });
  S.st.gold.forEach(t=>{
    const sel=S.sel?.type==="gold"&&S.sel.id===t.id;
    if(t.kind==="faits"){
      h+=`<div class="card gold fact${sel?" sel":""}" data-gold="FAITS" style="left:${t.x}px;top:${t.y}px;width:270px">
        <div class="hd" data-drag="gold:FAITS"><span class="nm">FAITS</span><span class="n">${fa.rows.length.toLocaleString("fr-FR")} lignes</span></div>
        <div class="sect">Flux d'alimentation</div>
        <ul class="cols">${S.st.flux.map(f=>{ const st=fa.stats[f.id]||{}; return `<li class="col${S.sel?.type==="flux"&&S.sel.id===f.id?" linkfrom":""}" id="fx-${esc(f.id)}" data-flux="${esc(f.id)}" title="${esc(f.note||fluxLabel(f))}"><span class="dot" style="color:${socColor(DS(f.ds)?.societe)}"></span><span class="cn">${esc(fluxLabel(f))}</span><span class="ty">${esc(f.ds)}</span><span class="ty">${(st.n||0).toLocaleString("fr-FR")}</span></li>`; }).join("")}
</ul>
        <div class="sect">Champs</div><div class="fields">${t.columns.map(c=>`<span>${esc(c.name)}</span>`).join("")}</div></div>`;
      return;
    }
    const socs=S.st.societes.filter(s=>S.st.datasets.some(d=>d.societe===s.id));
    h+=`<div class="card gold${sel?" sel":""}" data-gold="${esc(t.id)}" style="left:${t.x}px;top:${t.y}px">
      <div class="hd" data-drag="gold:${esc(t.id)}"><span class="nm">${esc(t.id)}</span>${t.generated?'<span class="gen">îlot généré</span>':""}</div>
      <ul class="cols">${t.columns.map(c=>`<li class="col" id="g-${esc(t.id)}-${esc(c.name)}" title="${esc(c.desc)}"><span class="cn">${esc(c.name)}</span><span class="ty">${esc(c.type)}</span>${t.generated?'<span class="gen">auto</span>':`<span class="gm">${socs.map(s=>`<i class="${c.map?.[s.id]?"on":""}" style="color:${socColor(s.id)}" title="${esc(s.name)} : ${esc(c.map?.[s.id]||"non alimentée")}"></i>`).join("")}</span>`}</li>`).join("")}</ul></div>`;
  });
  box.innerHTML=h;
}
function anchor(el,side){ const c=$("#canvas").getBoundingClientRect(), r=el.getBoundingClientRect(); return {x:(side==="r"?r.right:r.left)-c.left,y:r.top+r.height/2-c.top}; }
function colEl(ref){ const [d,c]=String(ref).split("."); return document.getElementById(`c-${d}-${c}`)||document.getElementById(`more-${d}`); }
function curve(a,b,sa,sb){ const dx=Math.max(40,Math.abs(b.x-a.x)/2); const c1=a.x+(sa==="r"?dx:-dx), c2=b.x+(sb==="r"?dx:-dx); return `M${a.x},${a.y} C${c1},${a.y} ${c2},${b.y} ${b.x},${b.y}`; }
function drawEdges(){
  if(S.tab!=="canvas") return;
  const svg=$("#edges"); let h=""; document.querySelectorAll(".edge-lbl").forEach(e=>e.remove());
  let bh=""; const cr=$("#canvas").getBoundingClientRect();
  const bbox=sel=>{ const els=[...document.querySelectorAll(sel)]; if(!els.length) return null; let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9; els.forEach(e=>{const r=e.getBoundingClientRect();x1=Math.min(x1,r.left-cr.left);y1=Math.min(y1,r.top-cr.top);x2=Math.max(x2,r.right-cr.left);y2=Math.max(y2,r.bottom-cr.top);}); return {x1:x1-16,y1:y1-24,x2:x2+16,y2:y2+16}; };
  S.st.societes.forEach(s=>{ const ids=S.st.datasets.filter(d=>d.societe===s.id).map(d=>`.card[data-ds="${d.id}"]`); if(!ids.length) return; const b=bbox(ids.join(",")); if(!b) return;
    bh+=`<div class="band" style="color:${socColor(s.id)};left:${b.x1}px;top:${b.y1}px;width:${b.x2-b.x1}px;height:${b.y2-b.y1}px"><span>${esc(s.name)}<small>${esc(s.source||"")}</small></span></div>`; });
  const gb=bbox(".card.gold"); if(gb) bh+=`<div class="band" style="color:var(--gold);left:${gb.x1}px;top:${gb.y1}px;width:${gb.x2-gb.x1}px;height:${gb.y2-gb.y1}px"><span>Modèle Qlik · gold<small>FAITS + dimensions</small></span></div>`;
  $("#bands").innerHTML=bh;
  const hiDs=S.sel?.type==="ds"?S.sel.id:null;
  if(S.flows){
    S.st.gold.forEach(t=>t.columns.forEach(c=>Object.entries(c.map||{}).forEach(([sid,expr])=>{ const g=document.getElementById(`g-${t.id}-${c.name}`); if(!g) return;
      refsIn(expr).forEach(r=>{ const e=colEl(`${r.ds}.${r.col}`); if(!e) return; const a=anchor(e,"r"), b=anchor(g,"l"); const hi=hiDs===r.ds||(S.sel?.type==="gold"&&S.sel.id===t.id);
        h+=`<path d="${curve(a,b,"r","l")}" fill="none" stroke="${socColor(sid)}" stroke-width="${hi?1.6:1}" stroke-dasharray="3 4" opacity="${hi?.9:.3}"/>`; }); })));
    S.st.flux.forEach(f=>{ const d=DS(f.ds); const g=document.getElementById(`fx-${f.id}`); if(!d||!g) return;
      const col=d.columns.some(c=>c.name===f.valeur)?f.valeur:(f.codCol||f.date); const e=colEl(`${d.id}.${col}`); if(!e) return;
      const a=anchor(e,"r"), b=anchor(g,"l"); const hi=hiDs===d.id||(S.sel?.type==="flux"&&S.sel.id===f.id);
      h+=`<path d="${curve(a,b,"r","l")}" fill="none" stroke="${socColor(d.societe)}" stroke-width="${hi?2.4:1.6}" opacity="${hi?1:.55}"/><circle cx="${b.x}" cy="${b.y}" r="3" fill="${socColor(d.societe)}"/>`; });
  }
  S.st.relations.forEach(rel=>{
    const ea=colEl(rel.from), eb=colEl(rel.to); if(!ea||!eb) return;
    const ra=ea.getBoundingClientRect(), rb=eb.getBoundingClientRect();
    let sa="r",sb="l"; if(ra.left>rb.left){sa="l";sb="r";} if(Math.abs(ra.left-rb.left)<60){sa="r";sb="r";}
    const a=anchor(ea,sa), b=anchor(eb,sb); const m=matchRate(rel); const col=m==null?"var(--muted)":m.rate>=.98?"var(--ok)":m.rate>=.8?"var(--warn)":"var(--bad)";
    const cross=DS(rel.from.split(".")[0])?.societe!==DS(rel.to.split(".")[0])?.societe; const sel=S.sel?.type==="rel"&&S.sel.id===rel.id;
    let d=curve(a,b,sa,sb); if(sa===sb){ const bx=Math.max(a.x,b.x)+46; d=`M${a.x},${a.y} C${bx},${a.y} ${bx},${b.y} ${b.x},${b.y}`; }
    h+=`<path d="${d}" fill="none" stroke="${col}" stroke-width="${sel?3:2}" ${cross?'stroke-dasharray="7 4"':""}/><circle cx="${a.x}" cy="${a.y}" r="3.5" fill="${col}"/><circle cx="${b.x}" cy="${b.y}" r="3.5" fill="${col}"/>`;
    const mx=sa===sb?Math.max(a.x,b.x)+35:(a.x+b.x)/2, my=(a.y+b.y)/2;
    const lbl=document.createElement("button"); lbl.className="edge-lbl"+(sel?" sel":""); lbl.style.left=mx+"px"; lbl.style.top=my+"px"; lbl.style.borderColor=col; lbl.style.color=col;
    lbl.textContent=(m==null?"—":Math.round(m.rate*100)+" %")+(rel.norm&&rel.norm!=="none"?" · normalisé":""); lbl.title=`${rel.from} → ${rel.to} : ${KINDS[rel.kind]||""}`;
    lbl.onclick=e=>{e.stopPropagation();select({type:"rel",id:rel.id});}; $("#canvas").appendChild(lbl);
  });
  svg.innerHTML=h;
}

/* ───────────── panneau ───────────── */
function renderPanel(){
  const p=$("#panel"); let h="";
  if(S.sel?.type==="ds") h=dsPanel(DS(S.sel.id));
  else if(S.sel?.type==="gold") h=GT(S.sel.id)?.kind==="faits"?faitsPanel():goldPanel(GT(S.sel.id));
  else if(S.sel?.type==="rel") h=relPanel(S.st.relations.find(r=>r.id===S.sel.id));
  else if(S.sel?.type==="flux") h=fluxPanel(FX(S.sel.id));
  const sc=p.scrollTop; p.innerHTML=h||emptyPanel(); p.scrollTop=sc;
  p.querySelectorAll("input,select,textarea").forEach(e=>{ e.disabled=true; });
}
function emptyPanel(){
  const open=listeQuestions().filter(q=>q.statut==="ouverte").length; const mc=measureCounts(); const ck=S.check||[];
  return `<div class="p-empty"><h3>Séance en cours</h3>
  <p>Cette page affiche la spec du dépôt. Elle ne s'édite pas ici : c'est l'agent dans Cursor qui complète les fichiers <span class="mono">spec/</span>, et la page se recharge à chaque modification.</p>
  <ol><li>Dans Cursor, lance <span class="mono">/question-suivante</span> : l'agent présente la question et le profil des colonnes.</li>
  <li>Tu donnes la réponse de l'adhérent ; l'agent met à jour la spec, lance le contrôle et note la décision au journal.</li>
  <li>Le schéma, la couverture des mesures et le dashboard se mettent à jour ici.</li></ol>
  <p><b style="color:var(--fg)">${open}</b> questions ouvertes · <b style="color:var(--fg)">${mc.ok}</b> mesures alimentées, <b style="color:var(--fg)">${mc.part}</b> partiellement · <b style="color:var(--fg)">${ck.filter(f=>f.niv==="erreur").length}</b> erreurs de spec</p>
  ${S.st.cases.length?`<h4 style="color:var(--fg);margin:14px 0 6px">Cas particuliers transverses</h4><ul class="items">${S.st.cases.map(c=>`<li><span class="t">${esc(c.text)}</span></li>`).join("")}</ul>`:""}</div>`;
}
function dsPanel(d){
  if(!d) return ""; const s=dsStats(d), soc=SOC(d.societe); const masked=new Set(d.columns.map((c,i)=>c.pii?i:-1).filter(i=>i>=0)); const fx=S.st.flux.filter(f=>f.ds===d.id); const fa=buildFaits(); const sr=silverRows(d);
  return `<div class="p-hd"><div class="row"><span class="chip" style="color:${socColor(d.societe)}"><span class="dot"></span><span style="color:var(--fg)">${esc(soc?.name||d.societe)}</span></span><span class="st st-${s.st}">${ST_LABEL[s.st]}</span><span class="spacer"></span><span class="mono" style="font-size:11px;color:var(--muted)">spec/datasets/${esc(d.id)}.yml</span><button class="x" data-act="close" aria-label="Fermer">×</button></div>
    <h2>${esc(d.id)}</h2><div style="font-size:12px;color:var(--muted);margin-top:2px">${d.rows.length.toLocaleString("fr-FR")} lignes${sr.dropped?` · ${sr.dropped.toLocaleString("fr-FR")} écartées par les règles`:""} · ${s.doc}/${s.total} colonnes documentées</div></div>
  ${findingsFor(`spec/datasets/${d.id}.yml`)}
  <div class="p-sec"><h4>Aperçu bronze</h4>${d.rows.length?`<div class="prev"><table><thead><tr>${d.columns.map(c=>`<th>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>${d.rows.slice(0,8).map(r=>`<tr>${d.columns.map((c,i)=>{const v=r[i];return masked.has(i)&&S.mask?`<td class="mask">••••</td>`:v===""||v==null?`<td class="nul">∅</td>`:`<td>${esc(v)}</td>`}).join("")}</tr>`).join("")}</tbody></table></div>`:`<p style="color:var(--muted);margin:0">Données non chargées dans ce navigateur. <button class="btn sm" data-act="reimport">Réimporter le CSV</button></p>`}</div>
  <div class="p-sec"><h4>Flux vers FAITS <span class="c">${fx.length}</span></h4>
    <ul class="items">${fx.map(f=>`<li><span class="t"><a href="#" data-act="openflux" data-id="${esc(f.id)}" style="color:inherit">${esc(fluxLabel(f))}</a><code>${(fa.stats[f.id]?.n||0).toLocaleString("fr-FR")} lignes FAITS · ${esc(f.champ)} · ${esc(AGGS[f.agg]||f.agg)} de ${esc(f.valeur||"?")}</code></span></li>`).join("")}</ul>
    <button class="btn sm" data-act="newflux" data-ds="${esc(d.id)}">Créer un flux depuis ce dataset</button></div>
  <div class="p-sec"><h4>Questions à poser <span class="c">${d.questions.filter(q=>!q.done).length}</span></h4>
    <ul class="qlist">${d.questions.map(q=>`<li class="${q.done?"done":""}"><span class="qid mono">${esc(q.id)}</span><span style="flex:1">${esc(q.text)}${q.answer?`<em class="ans">${esc(q.answer)}</em>`:""}</span>${q.done?"":`<button class="btn sm" data-act="cpq" data-q="${esc(d.id)}#${esc(q.id)}" title="Copie la commande à coller dans le chat Cursor">Copier</button>`}</li>`).join("")||'<li style="color:var(--muted)">Aucune</li>'}</ul>
    <div class="addrow" style="margin-top:8px"><input class="inp" id="nq" placeholder="Ajouter une question"><button class="btn sm" data-act="addq">Ajouter</button></div></div>
  <div class="p-sec"><h4>Dataset</h4>
    <div class="fld"><label for="f-desc">Description</label><textarea class="inp" id="f-desc" data-f="desc">${esc(d.desc)}</textarea></div>
    <div class="fld"><label for="f-grain">Grain (une ligne = …)</label><input class="inp" id="f-grain" data-f="grain" value="${esc(d.grain)}"></div></div>
  <div class="p-sec"><h4>Colonnes</h4>${d.columns.map((c,i)=>colRow(d,c,i)).join("")}</div>
  <div class="p-sec"><h4>Règles silver <span class="c">${d.rules.length}</span></h4>
    <ul class="items">${d.rules.map((r,i)=>`<li><span class="t">${esc(r.text)}<code>where ${esc(r.sql)}${sr.unparsed.includes(r.sql)?" · non appliquée dans l'aperçu":""}</code></span><button class="x" data-act="delrule" data-i="${i}" aria-label="Supprimer">×</button></li>`).join("")}</ul>
    <div class="fld"><input class="inp" id="nr-t" placeholder="Règle en clair : exclure les missions annulées"></div>
    <div class="addrow"><input class="inp mono" id="nr-s" placeholder="statut <> 'A'"><button class="btn sm" data-act="addrule">Ajouter</button></div></div>
  <div class="p-sec"><h4>Cas particuliers <span class="c">${d.cases.length}</span></h4>
    <ul class="items">${d.cases.map((c,i)=>`<li><span class="t">${esc(c.text)}</span><button class="x" data-act="delcase" data-i="${i}" aria-label="Supprimer">×</button></li>`).join("")}</ul>
    <div class="addrow"><input class="inp" id="nc" placeholder="Ex. : les intérimaires n'ont pas de fiche conducteur"><button class="btn sm" data-act="addcase">Noter</button></div></div>`;
}
function colRow(d,c,i){
  const p=d._prof[c.name]||{}; const id=`c${i}`;
  const prof=p.n?`${p.distinct} distinctes · ${p.nulls?Math.round(p.nulls/p.n*100)+" % vides":"aucun vide"} · détecté ${p.guess}${p.fmt?" "+p.fmt:""}${p.comma?" (virgule)":""}${p.min!==""?` · ${p.min} → ${p.max}`:""}${p.lowcard?`<br>valeurs : ${p.top.map(t=>`${esc(t[0])} (${t[1]})`).join(", ")}`:""}`:"";
  const codes=c.codes?Object.entries(c.codes).map(([k,v])=>`${k}=${v}`).join("; "):"";
  return `<details class="colrow" ${S.openCol===d.id+"."+c.name?"open":""} data-colname="${esc(c.name)}"><summary><span style="width:6px;height:6px;border-radius:50%;border:1.5px solid var(--warn);flex:none;${c.desc&&c.type?"background:var(--ok);border-color:var(--ok)":""}"></span><span class="cn">${esc(c.name)}</span><span class="ds">${esc(c.desc||"—")}</span><span class="rl rl-${c.role}" style="font-size:9.5px;font-weight:700;padding:0 3px;border-radius:3px">${ROLE_TAG[c.role]||""}</span></summary>
    <div class="colbody">
      <div class="fld full"><label for="${id}-desc">Description métier</label><input class="inp" id="${id}-desc" data-c="${i}" data-k="desc" value="${esc(c.desc)}"></div>
      <div class="fld"><label for="${id}-type">Type</label><select class="inp" id="${id}-type" data-c="${i}" data-k="type"><option value="">?</option>${TYPES.map(t=>`<option ${c.type===t?"selected":""}>${t}</option>`).join("")}</select></div>
      <div class="fld"><label for="${id}-role">Rôle</label><select class="inp" id="${id}-role" data-c="${i}" data-k="role">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${c.role===k?"selected":""}>${v}</option>`).join("")}</select></div>
      ${c.type==="date"||c.type==="timestamp"?`<div class="fld"><label for="${id}-fmt">Format source</label><input class="inp mono" id="${id}-fmt" data-c="${i}" data-k="format" value="${esc(c.format)}" placeholder="DD/MM/YYYY"></div>`:""}
      ${c.type==="decimal"?`<label class="chk"><input type="checkbox" id="${id}-dc" data-c="${i}" data-k="decimalComma" ${c.decimalComma?"checked":""}> Virgule décimale</label>`:""}
      <label class="chk"><input type="checkbox" id="${id}-pii" data-c="${i}" data-k="pii" ${c.pii?"checked":""}> Donnée personnelle</label>
      <div class="fld full"><label for="${id}-codes">Valeurs codées (code=libellé; …)</label><input class="inp mono" id="${id}-codes" data-c="${i}" data-k="codes" value="${esc(codes)}" placeholder="L=Livrée; A=Annulée"></div>
      <div class="prof full">${prof}${p.n&&c.type&&p.guess!==c.type?`<br><span style="color:var(--warn)">Type choisi différent du type détecté</span>`:""}${!c.type&&p.n?` <button class="btn sm" data-act="applyguess" data-i="${i}">Prendre ${p.guess}</button>`:""}</div>
    </div></details>`;
}
function goldPanel(t){
  if(!t) return ""; const socs=S.st.societes.filter(s=>S.st.datasets.some(d=>d.societe===s.id)); const dims=buildDims();
  return `<div class="p-hd"><div class="row"><span class="st" style="color:var(--gold);border:1px solid var(--gold)">Dimension</span>${t.generated?'<span class="gen">générée automatiquement</span>':""}<span class="spacer"></span><button class="x" data-act="close" aria-label="Fermer">×</button></div><h2>${esc(t.id)}</h2>
    ${t.generated?"":`<div style="font-size:12px;color:var(--muted);margin-top:2px">${(dims.tables[t.id]||[]).length} lignes dans l'aperçu${dims.partial[t.id]?" · certaines expressions ne sont calculées qu'en SQL":""}</div>`}</div>
  <div class="p-sec"><div class="fld"><label for="g-desc">Description</label><textarea class="inp" id="g-desc" data-gf="desc">${esc(t.desc)}</textarea></div></div>
  ${t.generated?`<div class="p-sec" style="color:var(--muted);font-size:13px;line-height:1.5">Table îlot générée dans le script de chargement Qlik à partir des dates de FAITS. Elle sert aux sélecteurs MoisVar / AnneeVar utilisés par les variables vSET.</div>`:
  `<div class="p-sec"><h4>Alimentation par société</h4><p style="font-size:12px;color:var(--muted);margin:0 0 8px;line-height:1.45">Expression SQL sur les colonnes silver, écrite <span class="mono">dataset.colonne</span>. Les jointures se déduisent des relations.</p>
  <table class="gtab"><tbody>${t.columns.map((c,ci)=>`<tr><td class="cn">${esc(c.name)}<div style="font-family:var(--f-ui);color:var(--muted);font-size:11px;white-space:normal">${esc(c.desc)}</div></td><td style="width:100%">${socs.map(s=>`<div style="display:flex;gap:5px;align-items:center;margin-bottom:3px"><span class="soc" style="color:${socColor(s.id)}">${esc(s.id.toUpperCase())}</span><input class="inp mono" style="font-size:11.5px" id="gm-${ci}-${esc(s.id)}" data-gc="${ci}" data-soc="${esc(s.id)}" value="${esc(c.map?.[s.id]||"")}" placeholder="non alimentée"></div>`).join("")}</td></tr>`).join("")}</tbody></table>
  <div class="addrow" style="margin-top:10px"><input class="inp mono" id="ngc" placeholder="NOUVELLE_COLONNE"><button class="btn sm" data-act="addgcol">Ajouter</button></div></div>`}`;
}
function faitsPanel(){
  const fa=buildFaits(); const cods={}; fa.rows.forEach(r=>{ cods[r.cod]=(cods[r.cod]||0)+1; });
  return `<div class="p-hd"><div class="row"><span class="st" style="color:var(--gold);border:1px solid var(--gold)">Faits</span><span class="spacer"></span><button class="x" data-act="close" aria-label="Fermer">×</button></div><h2>FAITS</h2>
    <div style="font-size:12px;color:var(--muted);margin-top:2px">${fa.rows.length.toLocaleString("fr-FR")} lignes · ${Object.keys(cods).length} catégories alimentées</div></div>
  <div class="p-sec" style="font-size:13px;line-height:1.5;color:var(--muted)">Table longue : chaque ligne porte un montant pour une catégorie, un mois, et selon le flux un véhicule, un site, un chauffeur, un client. Chaque flux décrit comment un dataset bronze produit ces lignes.</div>
  <div class="p-sec"><h4>Flux <span class="c">${S.st.flux.length}</span></h4><ul class="items">${S.st.flux.map(f=>`<li><span class="t"><a href="#" data-act="openflux" data-id="${esc(f.id)}" style="color:inherit">${esc(fluxLabel(f))}</a><code>${esc(f.ds)} · ${(fa.stats[f.id]?.n||0).toLocaleString("fr-FR")} lignes</code></span></li>`).join("")}</ul>
    <button class="btn sm" data-act="newflux">+ Nouveau flux</button></div>
  <div class="p-sec"><h4>Catégories alimentées</h4><div class="tags">${Object.entries(cods).sort().map(([c,n])=>`<span class="on">${esc(c)} · ${n}</span>`).join("")||'<span class="off">aucune</span>'}</div></div>`;
}
function fluxPanel(f){
  if(!f) return ""; const d=DS(f.ds); const st=buildFaits().stats[f.id]||{}; const cols=d?d.columns.map(c=>c.name):[];
  const opt=(sel,none)=>(none?`<option value="">${none}</option>`:"")+cols.map(c=>`<option ${c===sel?"selected":""}>${esc(c)}</option>`).join("");
  const numCols=d?d.columns.filter(c=>["int","decimal"].includes(c.type||d._prof[c.name]?.guess)).map(c=>c.name):[];
  const warn=[]; if(st.filtered) warn.push(`${st.filtered.toLocaleString("fr-FR")} lignes hors filtre`); if(st.noDate) warn.push(`<li class="w">${st.noDate.toLocaleString("fr-FR")} lignes sans date lisible</li>`); if(st.noVal) warn.push(`<li class="w">${st.noVal.toLocaleString("fr-FR")} lignes sans valeur numérique</li>`); if(st.unclassified) warn.push(`<li class="w">${st.unclassified.toLocaleString("fr-FR")} lignes sans catégorie (aucune règle ne correspond)</li>`); if(st.filterWarn) warn.push(`<li class="w">Filtre non interprété dans l'aperçu (appliqué en SQL)</li>`); if(st.badVal) warn.push(`<li class="w">Valeur non calculable : utilise une colonne ou une opération simple entre colonnes</li>`);
  return `<div class="p-hd"><div class="row"><span class="st" style="color:var(--gold);border:1px solid var(--gold)">Flux vers FAITS</span><span class="spacer"></span><button class="btn sm" data-act="delflux">Supprimer</button><button class="x" data-act="close" aria-label="Fermer">×</button></div>
    <h2 style="font-size:14px">${esc(f.ds)} → FAITS</h2><div class="mono" style="font-size:11px;color:var(--muted)">spec/flux/${esc(f.id)}.yml</div></div>
  ${findingsFor(`spec/flux/${f.id}.yml`)}
  <div class="p-sec"><h4>Résultat sur les données</h4><div class="big">${(st.n||0).toLocaleString("fr-FR")} <span style="font-size:13px;color:var(--muted)">lignes FAITS</span></div>
    <div style="font-size:12.5px;color:var(--muted)">Total ${fmtN(st.total)} ${esc(f.unite)} · ${(st.src||0).toLocaleString("fr-FR")} lignes silver lues · catégories : ${[...(st.cods||[])].map(esc).join(", ")||"aucune"}</div>
    <ul class="warnl">${warn.map(w=>w.startsWith("<li")?w:`<li>${w}</li>`).join("")}</ul></div>
  <div class="p-sec"><h4>Source</h4><div class="fld"><label for="fx-ds">Dataset</label><select class="inp" id="fx-ds" data-ff="ds">${S.st.datasets.map(x=>`<option ${x.id===f.ds?"selected":""}>${esc(x.id)}</option>`).join("")}</select></div>
    <div class="fld"><label for="fx-filtre">Filtre (condition SQL, optionnelle)</label><input class="inp mono" id="fx-filtre" data-ff="filtre" value="${esc(f.filtre)}" placeholder="compte like '706%'"></div></div>
  <div class="p-sec"><h4>Catégorie</h4>
    <div class="fld"><label for="fx-mode">Comment la catégorie est déterminée</label><select class="inp" id="fx-mode" data-ff="codMode"><option value="fixe" ${f.codMode==="fixe"?"selected":""}>Une catégorie fixe</option><option value="regles" ${f.codMode==="regles"?"selected":""}>Règles sur une colonne (ex. préfixe de compte)</option><option value="colonne" ${f.codMode==="colonne"?"selected":""}>Lue telle quelle dans une colonne</option></select></div>
    ${f.codMode==="fixe"?`<div class="colbody" style="padding:0"><div class="fld"><label for="fx-cod">%COD_CATEGORIE</label><input class="inp mono" id="fx-cod" data-ff="cod" list="dl-cod" value="${esc(f.cod)}"></div><div class="fld"><label for="fx-lib">LIB_Categorie</label><input class="inp" id="fx-lib" data-ff="lib" list="dl-lib" value="${esc(f.lib)}"></div></div>`:""}
    ${f.codMode==="colonne"?`<div class="colbody" style="padding:0"><div class="fld"><label for="fx-cc">Colonne du code</label><select class="inp" id="fx-cc" data-ff="codCol">${opt(f.codCol,"—")}</select></div><div class="fld"><label for="fx-lc">Colonne du libellé</label><select class="inp" id="fx-lc" data-ff="libCol">${opt(f.libCol,"identique au code")}</select></div></div>`:""}
    ${f.codMode==="regles"?`<div class="fld"><label for="fx-rc">Colonne testée (commence par…)</label><select class="inp" id="fx-rc" data-ff="codCol">${opt(f.codCol,"—")}</select></div>
      <table class="rules-t"><tbody>${(f.rules||[]).map((r,i)=>`<tr><td style="width:24%"><input class="inp mono" data-rr="${i}" data-rk="prefix" value="${esc(r.prefix)}" aria-label="Préfixe"></td><td style="width:30%"><input class="inp mono" data-rr="${i}" data-rk="cod" list="dl-cod" value="${esc(r.cod)}" aria-label="Code"></td><td><input class="inp" data-rr="${i}" data-rk="lib" list="dl-lib" value="${esc(r.lib)}" aria-label="Libellé"></td><td><button class="x" data-act="delrr" data-i="${i}" aria-label="Supprimer la règle">×</button></td></tr>`).join("")}</tbody></table>
      <button class="btn sm" data-act="addrr" style="margin-top:6px">+ Règle</button>`:""}
  </div>
  <div class="p-sec"><h4>Valeur</h4><div class="colbody" style="padding:0">
    <div class="fld"><label for="fx-val">Valeur (colonne ou calcul)</label><input class="inp mono" id="fx-val" data-ff="valeur" list="dl-num" value="${esc(f.valeur)}"><datalist id="dl-num">${numCols.map(c=>`<option value="${esc(c)}">`).join("")}</datalist></div>
    <div class="fld"><label for="fx-agg">Agrégation au mois</label><select class="inp" id="fx-agg" data-ff="agg">${Object.entries(AGGS).map(([k,v])=>`<option value="${k}" ${f.agg===k?"selected":""}>${v}</option>`).join("")}</select></div>
    <div class="fld"><label for="fx-ch">Champ de FAITS</label><select class="inp" id="fx-ch" data-ff="champ">${CHAMPS.map(c=>`<option ${f.champ===c?"selected":""}>${c}</option>`).join("")}</select></div>
    <div class="fld"><label for="fx-u">Unité (TYP_UNITE)</label><select class="inp" id="fx-u" data-ff="unite">${UNITES.map(u=>`<option ${f.unite===u?"selected":""}>${u}</option>`).join("")}</select></div>
    ${f.champ==="BudgetNextN"?`<p class="full" style="font-size:12px;color:var(--muted);margin:0">Convention du modèle : le budget de l'année N est porté par les lignes de l'année N-1.</p>`:""}
  </div></div>
  <div class="p-sec"><h4>Axes</h4><div class="colbody" style="padding:0">
    <div class="fld"><label for="fx-date">Date (mois de rattachement)</label><select class="inp" id="fx-date" data-ff="date">${opt(f.date,"—")}</select></div>
    <div class="fld"><label for="fx-veh">Véhicule → %KEY_VEHICULE</label><select class="inp" id="fx-veh" data-ff="vehicule">${opt(f.vehicule,"aucun")}</select></div>
    <div class="fld"><label for="fx-ch2">Chauffeur → %KEY_CHAUFFEUR</label><select class="inp" id="fx-ch2" data-ff="chauffeur">${opt(f.chauffeur,"aucun")}</select></div>
    <div class="fld"><label for="fx-site">Site → %LIB_SITE</label><input class="inp mono" id="fx-site" data-ff="site" list="dl-cols" value="${esc(f.site)}" placeholder="colonne ou 'Texte fixe'"><datalist id="dl-cols">${cols.map(c=>`<option value="${esc(c)}">`).join("")}</datalist></div>
    <div class="fld"><label for="fx-cli">Client → LIB_CLIENT</label><select class="inp" id="fx-cli" data-ff="client">${opt(f.client,"aucun")}</select></div>
    <div class="fld"><label for="fx-col">Collaborateur → LIB_COLLABORATEUR</label><select class="inp" id="fx-col" data-ff="collaborateur">${opt(f.collaborateur,"aucun")}</select></div>
  </div></div>
  <div class="p-sec"><div class="fld"><label for="fx-note">Explication</label><textarea class="inp" id="fx-note" data-ff="note">${esc(f.note)}</textarea></div></div>`;
}
function relPanel(r){
  if(!r) return ""; const m=matchRate(r); const col=m==null?"var(--muted)":m.rate>=.98?"var(--ok)":m.rate>=.8?"var(--warn)":"var(--bad)";
  return `<div class="p-hd"><div class="row"><span class="st" style="border:1px solid var(--line)">Relation</span><span class="spacer"></span><button class="btn sm" data-act="delrel">Supprimer</button><button class="x" data-act="close" aria-label="Fermer">×</button></div><h2 style="font-size:13px">${esc(r.from)}<br>→ ${esc(r.to)}</h2></div>
  <div class="p-sec"><h4>Rapprochement sur les données</h4>${m?`<div class="rate" style="color:${col}">${(m.rate*100).toFixed(1).replace(".",",")} %</div><div style="font-size:12px;color:var(--muted)">${m.ok} valeurs sur ${m.tot} retrouvées dans ${esc(r.to.split(".")[0])}</div>${m.miss.length?`<div style="font-size:12px;margin-top:8px">Non retrouvées :</div><div class="unm">${m.miss.map(([v,n])=>`<span>${esc(v)} ×${n}</span>`).join("")}</div>`:""}`:"<span style='color:var(--muted)'>Données non chargées</span>"}</div>
  <div class="p-sec"><div class="fld"><label for="r-kind">Nature</label><select class="inp" id="r-kind" data-rf="kind">${Object.entries(KINDS).map(([k,v])=>`<option value="${k}" ${r.kind===k?"selected":""}>${v}</option>`).join("")}</select></div>
    <div class="fld"><label for="r-norm">Normalisation avant comparaison (appliquée en silver)</label><select class="inp" id="r-norm" data-rf="norm">${Object.entries(NORMS).map(([k,v])=>`<option value="${k}" ${r.norm===k?"selected":""}>${v}</option>`).join("")}</select></div>
    <div class="fld"><label for="r-note">Explication</label><textarea class="inp" id="r-note" data-rf="note">${esc(r.note)}</textarea></div></div>`;
}

/* ───────────── vue Catégories ───────────── */
function renderCat(){
  const cat=CAT(), fa=buildFaits(); const byCod=new Map(), byLib=new Map();
  cat.list.forEach(m=>(m.aggs||[]).forEach(a=>a.set&&parseSet(a.set).forEach(e=>{ if(e.k!=="fld") return; const tgt=e.f==="%COD_CATEGORIE"?byCod:e.f==="LIB_Categorie"?byLib:null; if(!tgt) return; e.vals.forEach(v=>{ if(!tgt.has(v)) tgt.set(v,new Set()); tgt.get(v).add(m.name); }); })));
  const fedCod=new Map(), fedLib=new Map(); fa.rows.forEach(r=>{ if(!fedCod.has(r.cod)) fedCod.set(r.cod,new Set()); fedCod.get(r.cod).add(r.flux); if(!fedLib.has(r.lib)) fedLib.set(r.lib,new Set()); fedLib.get(r.lib).add(r.cod); });
  const ref=new Set(S.st.categories.map(c=>c.cod)); const allCods=[...new Set([...ref,...byCod.keys(),...fedCod.keys()])].sort((a,b)=>a.localeCompare(b,"fr"));
  const par=new Map(allCods.map(c=>[c,c])); const find=c=>{ while(par.get(c)!==c) c=par.get(c); return c; }; const uni=(a,b)=>par.set(find(a),find(b));
  allCods.forEach(a=>allCods.forEach(b=>{ if(a===b) return; if(a.toLowerCase()===b.toLowerCase()||(a.length>=3&&b.startsWith(a)&&!/\s/.test(b))||b.split("+").includes(a)) uni(a,b); }));
  const gm={}; allCods.forEach(c=>{ (gm[find(c)]=gm[find(c)]||[]).push(c); }); const syn=Object.values(gm).filter(g=>g.length>1);
  $("#catv").innerHTML=`<h2>Référentiel des catégories</h2><p class="lede">Le contrat entre les sources de l'adhérent et le dashboard. Chaque mesure du catalogue filtre FAITS sur un code (%COD_CATEGORIE) ou un libellé (LIB_Categorie). Une catégorie est alimentée quand un flux de la séance produit des lignes avec ce code ou ce libellé. Le libellé lisible est celui de spec/referentiel.yml ; il alimente le champ LIB_LISIBLE de FAITS, sans changer les codes.</p>
  ${syn.length?`<p class="lede" style="color:var(--warn)">Codes proches à rationaliser : ${syn.map(g=>g.map(esc).join(" / ")).join(" · ")}</p>`:""}
  <p class="note">Référentiel : <span class="mono">spec/referentiel.yml</span></p>
  <div class="two"><div><h3 style="font-size:14px;margin:0 0 8px">Codes (%COD_CATEGORIE)</h3><div class="tblwrap"><table class="grid"><thead><tr><th>Code</th><th>Libellé</th><th>Exigé par</th><th>Alimenté</th></tr></thead><tbody>
  ${allCods.map(c=>{ const need=byCod.get(c), fed=fedCod.get(c), hyp=S.st.categories.find(k=>k.cod===c)?.hypothese; const prop=hyp&&!hyp.valide; return `<tr><td class="mono">${esc(c)}${ref.has(c)?"":` <span class="ms ms-err" title="Utilisé par le catalogue ou un flux, absent du référentiel">hors réf.</span>`}</td><td>${esc(libelleCat(c))}${prop?` <span class="ms ms-part" title="Libellé proposé, à confirmer">proposé</span>`:""}</td><td>${need?`<span title="${esc([...need].join("\n"))}">${need.size} mesure${need.size>1?"s":""}</span>`:'<span style="color:var(--muted)">—</span>'}</td><td>${fed?`<span class="ms ms-ok">${fed.size} flux</span>`:need?'<span class="ms ms-none">non</span>':""}</td></tr>`; }).join("")}</tbody></table></div></div>
  <div><h3 style="font-size:14px;margin:0 0 8px">Libellés exigés (LIB_Categorie)</h3><div class="tblwrap"><table class="grid"><thead><tr><th>Libellé</th><th>Exigé par</th><th>Alimenté (code)</th></tr></thead><tbody>
  ${[...byLib.keys()].sort((a,b)=>a.localeCompare(b,"fr")).map(l=>{ const need=byLib.get(l), fed=fedLib.get(l); return `<tr><td>${esc(l)}</td><td><span title="${esc([...need].join("\n"))}">${need.size} mesure${need.size>1?"s":""}</span></td><td>${fed?`<span class="ms ms-ok">${esc([...fed].join(", "))}</span>`:'<span class="ms ms-none">non</span>'}</td></tr>`; }).join("")}</tbody></table></div></div></div>`;
}

/* ───────────── vue Éléments principaux ───────────── */
function fmtMeasure(m,v){ if(v==null||typeof v!=="number"||!isFinite(v)) return v==null?"—":String(v); if(/^%/.test(m.name)) return fmtN(v*100,1)+" %"; return fmtN(v); }
function prevSel(){ const fa=buildFaits(); const ys=[...new Set(fa.rows.map(r=>r.annee))].sort(); if(S.prev.annee==null||!ys.includes(S.prev.annee)){ S.prev.annee=ys[ys.length-1]??new Date().getFullYear(); S.prev.mois=null; } return {ys}; }
function evalCtx(selOverride){
  const fa=buildFaits(), dims=buildDims(); prevSel();
  let rows=fa.rows; if(S.prev.veh) rows=rows.filter(r=>r.veh===S.prev.veh); if(S.prev.chauf) rows=rows.filter(r=>r.chauf===S.prev.chauf);
  return makeEval(CAT(),rows,dims,Object.assign({annee:S.prev.annee,mois:S.prev.mois},selOverride||{}));
}
function renderMes(){
  const cat=CAT(), cov=COV(); const ev=evalCtx(); const q=S.mesQ.toLowerCase(); const hors=horsPerimetre(), st=m=>hors.has(m.name)?"hors":cov.get(m.id).s;
  const cnt={all:cat.list.length,ok:0,part:0,none:0,err:0,hors:0,iss:0}; cat.list.forEach(m=>{ cnt[st(m)]++; if(m.issues.some(i=>i.sev==="bad"||!/^Non calculable/.test(i.txt))) cnt.iss++; });
  const keep=m=>{ const s=st(m); if(q&&!m.name.toLowerCase().includes(q)) return false; if(S.mesFilter==="all") return true; if(S.mesFilter==="iss") return m.issues.some(i=>i.sev==="bad"||!/^Non calculable/.test(i.txt)); return s===S.mesFilter; };
  const F=(k,l)=>`<button aria-pressed="${S.mesFilter===k}" data-mf="${k}">${l} ${cnt[k]}</button>`;
  $("#mesv").innerHTML=`<h2>Éléments principaux</h2><p class="lede">Ton catalogue de mesures, lu expression par expression. Le statut dit si les catégories et champs qu'une mesure utilise sont présents dans FAITS après les flux de la séance. La valeur est calculée pour ${S.prev.mois?MOIS[S.prev.mois-1]+" ":""}${S.prev.annee}, avec les mêmes règles de période que les variables vSET.</p>
  <div class="bar-tools"><div class="seg">${F("all","Toutes")}${F("ok","Alimentées")}${F("part","Partielles")}${F("none","Non alimentées")}${F("err","À corriger")}${cnt.hors?F("hors","Hors périmètre"):""}${F("iss","Anomalies")}</div>
  <input class="inp" id="mq" placeholder="Rechercher une mesure" value="${esc(S.mesQ)}"><span class="note mono">spec/catalogue/elements_principaux.txt</span></div>
  <div class="mlist">${cat.list.filter(keep).map(m=>{ const c=cov.get(m.id); const r=ev(m); const nb=m.issues.filter(i=>i.sev==="bad").length; const hb=badgeMesure(m);
    return `<details class="mrow"><summary><span class="mn">${esc(m.name)}</span><span class="per">${esc(m.period)}</span>${nb?`<span class="nb-iss">${nb} anomalie${nb>1?"s":""}</span>`:""}${hb?`<span class="hb hb-${hb.niveau}" title="${esc(CONF_LIB[hb.pire])}">${hb.n} hyp.</span>`:""}<span class="ms ms-${st(m)}">${ST_M[st(m)]}</span><span class="val">${r.err?'<span style="color:var(--muted)">n.c.</span>':fmtMeasure(m,r.v)}</span></summary>
      <div class="mbody"><div>${hb?`<h5>Hypothèses</h5><ul class="iss">${hypothesesMesure(m).map(h=>`<li class="${h.confiance==="basse"?"bad":""}">${esc(h.question||h.libelle)} · ${esc(CONF_LIB[h.confiance])}${h.preuves.concat(h.raisons).map(p=>`<br><span class="note">${esc(p)}</span>`).join("")}</li>`).join("")}</ul>`:""}${m.issues.length?`<h5>Points d'attention</h5><ul class="iss">${m.issues.map(i=>`<li class="${i.sev}">${esc(i.txt)}</li>`).join("")}</ul>`:""}
        ${c.miss&&c.miss.length&&st(m)!=="hors"?`<h5>Manque dans FAITS</h5><div class="tags">${c.miss.map(x=>`<span class="off" title="${esc(x)}">${esc(libelleCat(x))}${libelleCat(x)!==x?` <small class="mono">${esc(x)}</small>`:""}</span>`).join("")}</div>`:""}
        ${m.refs.length?`<h5>Utilise</h5><div class="tags">${m.refs.map(x=>`<span class="${cat.resolve(x)?"on":"off"}">${esc(x)}</span>`).join("")}</div>`:""}
        ${r.err?`<h5>Calcul</h5><p style="font-size:13px;margin:0;color:var(--muted)">Non calculable dans l'aperçu : ${esc(r.err)}</p>`:""}</div>
      <pre>${esc(m.expr)}</pre></div></details>`; }).join("")||'<p style="color:var(--muted)">Aucune mesure ne correspond.</p>'}</div>`;
  $("#mesv").querySelectorAll("[data-mf]").forEach(b=>b.onclick=()=>{ S.mesFilter=b.dataset.mf; renderMes(); });
  $("#mq").oninput=e=>{ S.mesQ=e.target.value; clearTimeout(S.mqT); S.mqT=setTimeout(()=>{ renderMes(); const i=$("#mq"); i.focus(); i.setSelectionRange(i.value.length,i.value.length); },250); };
}
function renderFiles(){
  const F=buildFiles(); if(!S.file||!F.some(f=>f.path===S.file)) S.file="models/gold/faits.sql";
  let h="",g=""; F.forEach(f=>{ if(f.group!==g){ g=f.group; h+=`<h5>${esc(g)}</h5>`; } h+=`<button data-path="${esc(f.path)}" aria-current="${f.path===S.file}">${esc(f.path)}</button>`; });
  $("#flist").innerHTML=h; const f=F.find(x=>x.path===S.file); $("#fpath").textContent=f.path; $("#fcode").textContent=f.body;
}
$("#flist").addEventListener("click",e=>{ const b=e.target.closest("[data-path]"); if(b){ S.file=b.dataset.path; renderFiles(); } });
$("#b-copy").onclick=async()=>{ const t=$("#fcode").textContent; try{ await navigator.clipboard.writeText(t); toast("Copié"); }catch(e){ const r=document.createRange(); r.selectNodeContents($("#fcode")); const s=getSelection(); s.removeAllRanges(); s.addRange(r); toast("Texte sélectionné : copie-le avec Ctrl + C"); } };
/* ───────────── journal ───────────── */
function renderLog(){
  const v=$("#logv");
  if(!S.st.log.length){ v.innerHTML=`<h2>Journal</h2><p class="lede">Chaque dictée appliquée s'inscrit ici, avec ce que Claude a compris et les modifications faites. Le journal est repris dans <span class="mono">docs/seance.md</span>.</p>`; return; }
  v.innerHTML=`<h2>Journal</h2>`+S.st.log.slice().reverse().map(l=>`<div class="lg"><time>${new Date(l.at).toLocaleString("fr-FR",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"})}</time><p><q>${esc(l.said)}</q></p><p>${esc(l.resume)}</p><div class="oplist">${l.ops.map(o=>`<span>${esc(o)}</span>`).join("")}</div></div>`).join("");
}

/* ───────────── questions ───────────── */
const SRC_LIB={projet:"Adhérent",besoins:"Besoins",kpi:"Indicateurs",hypothese:"Hypothèse",controle:"Contrôle",profil:"Profil",hors_recette:"Hors recette",non_lu:"Non lu",registre:"Registre"};
const radios=(n,l)=>`<div class="qopts">${l.map(([v,t])=>`<label><input type="radio" name="${n}" value="${esc(v)}"> ${esc(t)}</label>`).join("")}</div>`;
const parLu=()=>{ try{ return localStorage.getItem("atelier.par")||""; }catch(_){ return ""; } };
const parEcrit=v=>{ try{ localStorage.setItem("atelier.par",v); }catch(_){} };
function formQ(q,o={}){
  const f=q.formulaire; let h="";
  if(q.type==="confirmer") h=radios("oui",[["1","Oui"],["0","Non"]])+`<input class="inp" name="precision" placeholder="Précision (facultatif)">`;
  if(q.type==="codes") h=f.valeurs.length?`${f.suggestionDe?`<p class="note">Pré-rempli d'après la colonne « ${esc(f.suggestionDe)} » de votre fichier : corrigez si besoin.</p>`:""}<table class="qcodes"><thead><tr><th>Dans votre fichier</th><th>Lignes</th><th>Ce que cela veut dire</th><th>Ne pas compter</th></tr></thead><tbody>${f.valeurs.map(v=>`<tr><td class="mono">${esc(v.code)}</td><td>${v.n}</td><td><input class="inp" data-code="${esc(v.code)}" value="${esc(v.libelle||v.suggestion)}" placeholder="Ex. : ..."></td><td><label class="cb"><input type="checkbox" data-exclu="${esc(v.code)}" aria-label="Ne pas compter ${esc(v.code)}"><span class="cb-l">Ne pas compter</span></label></td></tr>`).join("")}</tbody></table>`:`<p class="note">Valeurs non disponibles : répondez en texte libre.</p>`;
  if(q.type==="choix") h=radios("option",f.options.map((o,i)=>[String(i),o.libelle]));
  if(q.type==="exclure") h=`<p class="note mono">Lignes gardées : ${esc(f.sql)}</p>`+radios("exclure",[["1","Exclure les autres lignes"],["0","Tout garder"]]);
  if(q.type==="fichier") h=radios("valeur",[["traiter","À traiter"],["ignorer","À ignorer"]]);
  const libre=q.type==="libre", ag=!!S.vue?.agent&&!o.relai, occ=S.qInt?.id===q.id&&S.qInt.etat==="lecture", texte=`<textarea class="inp" name="texte" rows="2" placeholder="Votre réponse"></textarea>`+(ag&&!libre?`<button class="btn sm qcomprendre" type="button" data-qc="comprendre"${occ?" disabled":""}>Comprendre</button>`:"");
  return `<form class="qform" data-qid="${esc(q.id)}">${h}${libre?texte:`<details class="qautre"><summary>Autre réponse</summary>${texte}</details>`}
    <div class="qact"><input class="inp" name="par" placeholder="Votre service ou fonction (facultatif)" value="${esc(parLu())}"><button class="btn primary" type="submit"${occ?" disabled":""}>${libre&&ag?"Comprendre":q.type==="codes"&&f.valeurs.some(v=>v.suggestion&&!v.libelle)?"Oui, c'est ça":"Valider"}</button></div><p class="qerr" hidden></p></form>`;
}
function saisieQ(form,q){
  const v=n=>form.querySelector(`[name="${n}"]:checked`)?.value, texte=form.querySelector('[name="texte"]').value.trim();
  if(q.type==="libre") return {texte};
  if(form.querySelector(".qautre").open&&texte) return {autre:true,texte};
  if(q.type==="confirmer") return {oui:v("oui")==null?null:v("oui")==="1",precision:form.querySelector('[name="precision"]').value};
  if(q.type==="codes"){ const codes={}; form.querySelectorAll("[data-code]").forEach(i=>codes[i.dataset.code]=i.value); return {codes,exclus:[...form.querySelectorAll("[data-exclu]:checked")].map(i=>i.dataset.exclu)}; }
  if(q.type==="choix") return {option:v("option")==null?null:+v("option")};
  if(q.type==="exclure") return {exclure:v("exclure")==null?null:v("exclure")==="1"};
  return {valeur:v("valeur")};
}
const blocComp=q=>{ const i=S.qInt; if(!i||i.id!==q.id) return "";
  if(i.etat==="lecture") return `<div class="qcomp"><p>Je lis votre réponse…</p></div>`;
  if(i.etat==="comp") return `<div class="qcomp"><b>J'ai compris :</b><p>${esc(i.comprehension)}</p><ul>${i.lignes.filter((_,k)=>i.operations[k]?.op!=="question").map(l=>`<li>${esc(l)}</li>`).join("")}</ul>${i.operations.filter(o=>o.op==="question").map(o=>`<p class="qsuivi">Je vous poserai ensuite : ${esc(o.valeur?.text)}</p>`).join("")}${i.effet?`<p class="note">${esc(effetClair(i.effet))}</p>`:""}<div class="qact"><button class="btn primary" type="button" data-qc="ok">C'est bien ça</button><button class="btn" type="button" data-qc="reformuler">Reformuler</button><button class="btn ghost" type="button" data-qc="brut">Envoyer tel quel à WeMa</button></div></div>`;
  if(i.etat==="prec") return `<div class="qcomp"><p>${esc(i.precision)}</p><p class="note">Modifiez votre réponse ci-dessus, puis cliquez sur « Comprendre ».</p></div>`;
  return `<div class="qcomp"><p class="qerr">${esc(i.msg)}</p><div class="qact"><button class="btn" type="button" data-qc="brut">Envoyer tel quel à WeMa</button></div></div>`; };
const effetClair=e=>String(e||"").replace("mesures alimentées","Indicateurs alimentés").replace("lignes FAITS","Lignes de données").replace("questions ouvertes","Questions restantes");
const impactClair=q=>{ const m=q.mesures||[]; if(!m.length) return ""; return `<p class="qimpact">Votre réponse alimente <b>${m.length} indicateur${m.length>1?"s":""}</b> de votre tableau de bord : ${m.slice(0,4).map(esc).join(", ")}${m.length>4?` et ${m.length-4} autre${m.length>5?"s":""}`:""}.</p>`; };
/* Maquette automatique : bloc réservé à l'admin (S.vue.maquette absent pour un adhérent), alimenté par l'événement SSE « maquette ». */
function etapeMaquette(m){ const k=m.n?` ${m.i}/${m.n}`:"";
  return {copie:"Préparation…",collecte:"Collecte et lecture des exports…",datasets:`Documentation des datasets${k}…`,relations:"Relations entre datasets…",flux:`Flux et contrôles${k}…`,controles:"Flux et contrôles…",perimetre:"Périmètre du tableau de bord…",libelles:"Libellés des catégories…",propositions:"Mesures propres à l'adhérent…",verification:"Vérification…",construction:"Construction des livrables…"}[m.etape]||"En cours…"; }
/* Journal en direct : les dernières lignes du run, repliable une fois terminé ; défile jusqu'en bas sauf si l'admin a remonté. */
function journalMaquette(m,replie){ const j=m.journal||[]; if(!j.length) return "";
  const corps=`<pre class="maq-journal" tabindex="0" aria-label="Journal de la maquette">${j.map(l=>`${esc(l.t)}  ${esc(l.texte)}`).join("\n")}</pre>`;
  return replie?`<details class="maq-det"><summary>Journal (${j.length} lignes)</summary>${corps}</details>`:corps; }
/* Suivi en direct : met à jour le seul bloc maquette (pas toute la spec ni les formulaires de questions en cours de saisie). */
function majBlocMaquette(){ const b=document.getElementById("maq-bloc"); if(!b||!S.vue) return false; b.outerHTML=blocMaquette(); suivreJournal(); return true; }
function suivreJournal(){ const p=document.querySelector(".maq-journal"); if(!p) return; if(S.journalSuit!==false) p.scrollTop=p.scrollHeight;
  p.addEventListener("scroll",()=>{ S.journalSuit=p.scrollTop+p.clientHeight>=p.scrollHeight-8; }); }
function blocMaquette(){
  const v=S.vue; if(!v||v.role!=="admin") return ""; const m=v.maquette, enCours=!!m&&!m.fin, adh=new URLSearchParams(location.search).get("adherent")||$("#sel-adh").value;
  let etat="";
  if(enCours) etat=`<p class="maq-etape" role="status">${esc(etapeMaquette(m))}</p>`+journalMaquette(m);
  else if(S.maqErr) etat=`<p class="qerr">${esc(S.maqErr)}</p>`;
  else if(m&&m.ok){ const r=m.resume||{}, h=r.hypotheses||{};
    etat=`<div class="maq-ok"><p>Maquette terminée : mesures alimentées ${esc(r.mesuresAvant)} → ${esc(r.mesuresApres)}.</p><p>Hypothèses à valider : ${esc(h.basse)} basses · ${esc(h.moyenne)} moyennes · ${esc(h.haute)} hautes.</p><p>Contrôles en écart : ${esc(r.controlesEnEcart)}. ${r.fiche?`<a href="/api/livrable?adherent=${encodeURIComponent(adh)}&f=${encodeURIComponent(String(r.fiche).replace(/^generated\//,""))}" download>Fiche de séance</a>`:""}</p></div>`; }
  else if(m) etat=`<div class="maq-ko"><p><b>La maquette a échoué : la spec est restée telle qu'avant.</b></p><ul>${(m.erreurs||[]).map(e=>`<li>${esc(e)}</li>`).join("")}</ul></div>`+journalMaquette(m,true);
  return `<section class="maq" id="maq-bloc"><h3>Maquette automatique</h3><p class="note">L'agent lit les exports, documente les datasets et écrit les flux. Rien n'est gardé si la vérification échoue.</p>
   <button class="btn" type="button" data-maq="lancer"${v.agent&&!enCours?"":" disabled"}>Lancer la maquette</button>${v.agent?"":' <span class="note">L\'agent n\'est pas disponible.</span>'}${etat}</section>`; }
$("#qv").addEventListener("click",async e=>{ const b=e.target.closest("[data-maq]"); if(!b||b.disabled) return; b.disabled=true; S.maqErr=null;
  try{ const r=await fetch("/api/maquette"+location.search,{method:"POST",headers:{"content-type":"application/json"},body:"{}"}); if(!r.ok){ let j={}; try{ j=await r.json(); }catch(_){} S.maqErr=(j.erreurs||[j.erreur||"Lancement impossible."]).join(" · "); } }
  catch(_){ S.maqErr="Serveur injoignable."; }
  await loadState(); renderQ(); });
/* Aperçu des données concernées par la question (GET /api/apercu-question) : panneau à droite, cache par question, texte serveur via esc(). */
const apq={}, ETROIT=matchMedia("(max-width:1100px)");
const urlApq=id=>"/api/apercu-question"+(location.search?location.search+"&":"?")+"id="+encodeURIComponent(id);
function tableApq(a){ if(a.aucun) return `<p class="note">${esc(a.raison||"Pas d'aperçu pour cette question.")}</p>`;
  const cs=a.colonnes||[], n=Number(a.total)||0;
  return `<h4 class="apq-t">${esc(a.dataset)} · ${esc(a.societe)} · ${n.toLocaleString("fr-FR")} ligne${n>1?"s":""}</h4><div class="apq-sc"><table class="apq"><thead><tr>${cs.map(c=>`<th class="${c.concerne?"on":""}"${c.pii?' title="Donnée personnelle masquée"':""}>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>${(a.lignes||[]).map(l=>`<tr>${cs.map((c,i)=>`<td class="${c.concerne?"on":""}${c.pii?" pii":""}">${esc(l[i])}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${cs.length||1}" class="note">Aucune ligne.</td></tr>`}</tbody></table></div>`; }
function corpsApq(id){ const a=apq[id];
  if(!a||a.etat==="charge") return `<p class="note" role="status">Chargement…</p>`;
  if(a.etat==="err") return `<p class="qerr">Aperçu indisponible.</p><button class="btn sm" type="button" data-apq="${esc(id)}">Réessayer</button>`;
  const j=a.j||{}; return Array.isArray(j.apercus)?(j.apercus.map(tableApq).join("")||`<p class="note">Pas d'aperçu pour cette question.</p>`):tableApq(j); }
const blocApq=id=>`<details class="qapercu" data-apq-id="${esc(id)}"${ETROIT.matches?"":" open"}><summary>Données concernées</summary><div class="apq-corps">${corpsApq(id)}</div></details>`;
const apqFile=[]; let apqActifs=0, apqObs=null;
function chargerApq(id,force){ if(apq[id]&&!force) return; apq[id]={etat:"charge"}; majApq(id); apqFile.push(id); apqPomper(); }
function apqPomper(){ while(apqActifs<3&&apqFile.length){ const id=apqFile.shift(); apqActifs++;
  fetch(urlApq(id),{cache:"no-store"}).then(r=>{ if(!r.ok) throw new Error(); return r.json(); }).then(j=>{ apq[id]={etat:"ok",j}; },()=>{ apq[id]={etat:"err"}; }).then(()=>{ apqActifs--; majApq(id); apqPomper(); }); } }
/* Chargement paresseux : carte visible (panneau ouvert) ou panneau ouvert à la main (écran étroit) ; sans IntersectionObserver, tout se charge, 3 à la fois. */
function observerApq(){ if(apqObs) apqObs.disconnect(); apqObs=null; const l=[...$("#qv").querySelectorAll(".qapercu[data-apq-id]")];
  if(!("IntersectionObserver" in window)){ l.forEach(d=>{ if(d.open) chargerApq(d.dataset.apqId); }); return; }
  apqObs=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting&&e.target.open){ apqObs.unobserve(e.target); chargerApq(e.target.dataset.apqId); } }),{rootMargin:"200px"});
  l.forEach(d=>apqObs.observe(d)); }
document.addEventListener("toggle",e=>{ const d=e.target; if(!d.classList||!d.classList.contains("qapercu")||!d.open) return; const r=d.getBoundingClientRect(); if(r.bottom>-200&&r.top<innerHeight+200) chargerApq(d.dataset.apqId); },true); /* l'ouverture initiale (attribut open) déclenche aussi « toggle » : seul le panneau proche de l'écran se charge */
function majApq(id){ document.querySelectorAll(".qapercu[data-apq-id]").forEach(d=>{ if(d.dataset.apqId===id) d.querySelector(".apq-corps").innerHTML=corpsApq(id); }); }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-apq]"); if(b) chargerApq(b.dataset.apq,true); });
ETROIT.addEventListener("change",()=>{ if(S.tab==="q") renderQ(); });
function renderQ(){
  const qs=listeQuestions(), f=S.qf||"ouvertes", fl=S.qFlash&&S.qFlash.id, repondable=q=>q.source!=="registre"&&!/^\(texte masqué/.test(q.question);
  const nOuv=qs.filter(q=>q.statut==="ouverte").length, nTot=qs.filter(q=>q.source!=="registre").length, mc=measureCounts(), mTot=mc.ok+mc.part+mc.none+mc.err;
  const skip=S.qSkip||(S.qSkip=[]), file=qs.filter(q=>q.statut==="ouverte"&&repondable(q)), cur=file.find(q=>!skip.includes(q.id))||file[0];
  const carte=(q,focus)=>{ const edit=repondable(q)&&(q.statut==="ouverte"||S.qEdit===q.id), n=q.historique.length, flash=q.id===fl;
    return `<article class="qi ${q.statut}${flash?" qflash":""}${focus?" qfocus":""}">${flash?`<div class="qfb" role="status" tabindex="-1">${S.qFlash.noter?"Merci, votre réponse est enregistrée. WeMa la prend en compte.":`Réponse appliquée · ${esc(effetClair(S.qFlash.effet))}`}</div>`:""}
    <div class="qcorps${edit?" qa":""}"><div class="qmain">
    ${focus&&cur?`<div class="qtop"><span>Question ${nTot-nOuv+1} sur ${nTot}</span><span class="qprog"><i style="width:${Math.round((nTot-nOuv)/Math.max(1,nTot)*100)}%"></i></span></div>`:""}
    ${q.intro?`<p class="qintro">${esc(q.intro)}</p>`:""}<h3 class="qtitre">${esc(q.titre||q.question)}</h3>
    ${q.titre&&q.apercu?`<p class="qd">${esc(q.apercu)}</p>`:""}
    ${q.statut==="traitee"?`<div class="qr"><b>Votre réponse${q.date?` du ${esc(q.date.slice(0,10))}`:""}${q.par?` · ${esc(q.par)}`:""}${q.retiree?" · retirée de la spec":""}${q.orpheline?" · à revoir : les données ont changé depuis":""}</b><p>${esc(q.reponse||"(réponse non saisie)")}</p>${q.effet?`<div class="qeff">${esc(effetClair(q.effet))}</div>`:""}
      ${n?`<details class="qhist"><summary>${n} réponse${n>1?"s":""} précédente${n>1?"s":""}</summary>${q.historique.map(h=>`<p><span class="note">${esc(h.date.slice(0,10))}${h.par?" · "+esc(h.par):""}</span> ${esc(h.reponse)}</p>`).join("")}</details>`:""}
      ${repondable(q)&&!edit?`<button class="btn sm" data-qre="${esc(q.id)}">Modifier ma réponse</button>`:""}</div>`:""}
    ${edit?formQ(q)+blocComp(q):""}${q.statut==="ouverte"?impactClair(q):""}
    <details class="qtech"><summary>Détails techniques</summary><p class="mono">${esc(q.id)} · ${esc(SRC_LIB[q.source]||q.source)}<br>${esc(q.element)}${q.element?" · ":""}${esc(q.fichier)}${q.apercu?`<br>${esc(q.apercu)}`:""}</p></details>
    ${focus&&file.length>1?`<div class="qnav"><button class="btn ghost sm" data-qskip="${esc(q.id)}">Passer cette question</button></div>`:""}</div>${edit?blocApq(q.id):""}</div></article>`; };
  const head=blocMaquette()+`<h2>Vos questions</h2><div class="qgauge"><span>Votre tableau de bord</span><span class="qprog big"><i style="width:${Math.round(mc.ok/Math.max(1,mTot)*100)}%"></i></span><b>${mc.ok} indicateur${mc.ok>1?"s":""} sur ${mTot}</b></div>
    <div class="qfilt">${[["ouvertes",`À traiter (${nOuv})`],["traitees","Mes réponses"],["toutes","Toutes"]].map(([k,l])=>`<button class="btn sm" data-qf="${k}" aria-pressed="${f===k}">${l}</button>`).join("")}</div>`;
  let body="";
  if(f==="ouvertes"){ const done=fl?qs.find(q=>q.id===fl):null;
    body=(done?carte(done,false):"")+(cur?carte(cur,true):`<p class="lede qfin">${nOuv?"Les questions restantes demandent l'équipe WeMa.":"Merci, vous avez répondu à toutes les questions."}</p>`); }
  else { const keep=q=>f==="toutes"||q.statut==="traitee"; body=qs.some(keep)?[...new Set(qs.map(q=>q.lot))].map(lot=>{ const l=qs.filter(q=>q.lot===lot&&keep(q)); return l.length?`<section class="qlot"><h3>${esc(nomFichier(lot))}</h3>${l.map(q=>carte(q,false)).join("")}</section>`:""; }).join(""):`<p class="lede">Aucune réponse pour l'instant.</p>`; }
  const sv={}; $("#qv").querySelectorAll(".qform").forEach(f=>{ const t=f.querySelector('[name="texte"]'); if(t&&t.value) sv[f.dataset.qid]={t:t.value,o:!!f.querySelector(".qautre")?.open}; });
  const fbFocus=document.activeElement?.classList?.contains("qfb");
  $("#qv").innerHTML=head+body; suivreJournal(); if(fbFocus) $("#qv .qfb")?.focus({preventScroll:true});
  observerApq();
  $("#qv").querySelectorAll(".qform").forEach(f=>{ const x=sv[f.dataset.qid]; if(!x) return; f.querySelector('[name="texte"]').value=x.t; const d=f.querySelector(".qautre"); if(d&&x.o) d.open=true; });
}
$("#qv").addEventListener("click",e=>{ const b=e.target.closest("[data-qf]"); if(b){ S.qf=b.dataset.qf; S.qFlash=null; renderQ(); } const sk=e.target.closest("[data-qskip]"); if(sk){ (S.qSkip=S.qSkip||[]).push(sk.dataset.qskip); S.qFlash=null; renderQ(); } const r=e.target.closest("[data-qre]"); if(r){ S.qEdit=r.dataset.qre; renderQ(); } });
const MSG_INDISPO="L'interprétation automatique n'est pas disponible, votre texte peut être envoyé tel quel à WeMa";
async function envoyerRep(q,saisie,par,echec){
  S.qFlash=null;
  try{ const r=await fetch("/api/reponse"+location.search,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:q.id,saisie,par})});
    const j=await r.json().catch(()=>({erreurs:[`erreur ${r.status}`]})); if(!r.ok){ echec((j.erreurs||[]).join(" · ")); return null; }
    const noter=j.entree.modifs.every(m=>m.op==="noter");
    S.qInt=null; S.qEdit=null; S.qFlash={id:q.id,effet:j.entree.effet||"",noter,t:Date.now()}; renderQ(); $("#qv .qfb")?.focus(); return j.entree; }
  catch(_){ echec("Serveur injoignable"); return null; }
}
async function comprendre(form,q){
  const texte=form.querySelector('[name="texte"]').value.trim(), par=form.querySelector('[name="par"]').value.trim(), err=form.querySelector(".qerr"); parEcrit(par);
  if(!texte){ err.hidden=false; err.textContent="Écrivez votre réponse."; return; }
  err.hidden=true; S.qInt={id:q.id,etat:"lecture",texte,par}; renderQ();
  const fin=i=>{ S.qInt={id:q.id,texte,par,...i}; renderQ(); };
  try{ const r=await fetch("/api/interpreter"+location.search,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:q.id,texte,par})});
    const j=await r.json().catch(()=>({})); 
    if(r.ok&&j.comprehension) return fin({etat:"comp",comprehension:j.comprehension,lignes:j.lignes||[],effet:j.effet||"",operations:j.operations||[]});
    if(r.ok&&j.precision) return fin({etat:"prec",precision:j.precision});
    fin({etat:"err",msg:(j.erreurs&&j.erreurs.join(" · "))||MSG_INDISPO}); }
  catch(_){ fin({etat:"err",msg:MSG_INDISPO}); }
}
$("#qv").addEventListener("submit",async e=>{
  const form=e.target.closest(".qform"); if(!form) return; e.preventDefault();
  const q=listeQuestions().find(x=>x.id===form.dataset.qid); if(!q) return;
  if(q.type==="libre"&&S.vue?.agent) return comprendre(form,q);
  const par=form.querySelector('[name="par"]').value.trim(), err=form.querySelector(".qerr"), b=form.querySelector('[type="submit"]'); parEcrit(par); b.disabled=true;
  const echec=m=>{ err.hidden=false; err.textContent=m; b.disabled=false; };
  const saisie=saisieQ(form,q);
  if(q.type==="codes"&&!saisie.autre&&!Object.values(saisie.codes).some(v=>v.trim())&&!saisie.exclus.length) return echec("Indiquez au moins une signification, ou cochez un code à exclure.");
  envoyerRep(q,saisie,par,echec);
});
$("#qv").addEventListener("click",e=>{ const b=e.target.closest("[data-qc]"); if(!b) return;
  const form=b.closest(".qi").querySelector(".qform"), q=listeQuestions().find(x=>x.id===form.dataset.qid), i=S.qInt; if(!q) return;
  if(b.dataset.qc==="comprendre") return comprendre(form,q);
  if(b.dataset.qc==="reformuler"){ S.qInt=null; return renderQ(); }
  if(!i||i.id!==q.id) return; b.disabled=true;
  const echec=m=>{ S.qInt={...i,etat:"err",msg:m}; renderQ(); };
  envoyerRep(q,b.dataset.qc==="ok"?{interpretation:{texte:i.texte,comprehension:i.comprehension,operations:i.operations}}:{texte:i.texte},i.par,echec);
});

/* ───────────── séance en visio (admin) : une question à la fois ; le mode partage ne montre que ce que le dirigeant doit voir ───────────── */
const seMesure=()=>{ const c=measureCounts(); return {l:buildFaits().rows.length,i:c.ok,tot:c.ok+c.part+c.none+c.err}; };
function freqSeance(q){ const ci=/^[^.#:]+\.[^.#]+$/.test(String(q.element||""))?colIndex(q.element):null, p=ci&&ci.ds._prof[ci.col.name]; if(!p||!p.n) return "";
  if(ci.col.pii) return `<p class="note">${p.distinct} valeurs distinctes · ${Math.round(p.nulls/p.n*100)} % vides (données personnelles, non affichées)</p>`;
  const mx=Math.max(1,...p.top.map(t=>t[1]));
  return `<ul class="se-freq" aria-label="Ce que montrent les données">${p.top.slice(0,6).map(([v,n])=>`<li><span class="v">${esc(String(v)||"(vide)")}</span><span class="b" aria-hidden="true"><i style="width:${Math.max(2,n/mx*100)}%"></i></span><span class="p">${n.toLocaleString("fr-FR")} · ${Math.round(n/p.n*100)} %</span></li>`).join("")}</ul>${p.nulls?`<p class="note">${Math.round(p.nulls/p.n*100)} % de lignes vides sur ${p.n.toLocaleString("fr-FR")}.</p>`:""}`; }
function renderSeance(){
  const v=$("#sev"), part=!!S.sePartage, qs=listeQuestions(), skip=S.seSkip||(S.seSkip=[]); document.body.classList.toggle("se-partage",part);
  const file=qs.filter(q=>q.statut==="ouverte"&&q.source!=="registre"&&!/^\(texte masqué/.test(q.question)), q=file.find(x=>!skip.includes(x.id))||file[0];
  const m=seMesure(), ef=S.seEffet;
  const tete=`<div class="se-tete"><div><h2>Séance en visio</h2><p class="lede">${esc(S.st.adherent)} · une question à la fois, partagée avec le dirigeant.</p></div><button class="btn" type="button" data-se-partage aria-pressed="${part}">${part?"Quitter le mode partage":"Mode partage d'écran"}</button></div>`;
  const effet=`<div class="se-effet" role="status"><div class="m${ef&&m.l!==ef.l?" gain":""}"><span>Lignes de données</span><b>${ef?`${ef.l.toLocaleString("fr-FR")} <span class="fl">→</span> `:""}${m.l.toLocaleString("fr-FR")}</b></div>
    <div class="m${ef&&m.i!==ef.i?" gain":""}"><span>Indicateurs prêts</span><b>${ef?`${ef.i} <span class="fl">→</span> `:""}${m.i} <span class="note">sur ${m.tot}</span></b></div>
    <p class="note">${ef?`Effet de la réponse « ${esc(ef.titre)} ».`:"L'effet de la prochaine réponse s'affichera ici."}</p></div>`;
  if(!q){ v.innerHTML=tete+effet+`<div class="qfin"><p><b>Toutes les questions de la séance sont traitées.</b></p><p class="note">Prochaine étape : construire les livrables, puis relire la fiche de séance avec l'adhérent.</p></div>`; return; }
  const rang=qs.filter(x=>x.source!=="registre").length-file.length+1, tot=qs.filter(x=>x.source!=="registre").length, nm=(q.mesures||[]).length;
  const suite=file.filter(x=>x!==q).sort((a,b)=>(b.mesures||[]).length-(a.mesures||[]).length).slice(0,4);
  const titreFocus=document.activeElement?.id==="se-t", sv=v.querySelector(".qform"), garde=sv&&sv.dataset.qid===q.id?{t:sv.querySelector('[name="texte"]')?.value||"",o:!!sv.querySelector(".qautre")?.open}:null;
  v.innerHTML=tete+effet+`<div class="se-grille${part?" partage":""}">
    <section class="se-ecran" aria-labelledby="se-t">
      <p class="se-qid">${esc(q.id)} · question ${rang} sur ${tot}</p>
      ${q.intro?`<p class="qintro">${esc(q.intro)}</p>`:""}<h3 id="se-t" tabindex="-1">${esc(q.titre||q.question)}</h3>
      ${freqSeance(q)}
      ${nm?`<p class="qimpact">La réponse débloque <b>${nm} indicateur${nm>1?"s":""}</b> du tableau de bord.</p>`:""}
      <div class="se-rep">${formQ(q,{relai:true})}</div>
      ${file.length>1?`<div class="qnav"><button class="btn ghost sm" type="button" data-se-skip="${esc(q.id)}">Passer cette question</button></div>`:""}
    </section>
    <div class="se-pw">
      <section><h4>Données (pour WeMa)</h4><dl><dt>Source</dt><dd class="mono">${esc(SRC_LIB[q.source]||q.source)}</dd><dt>Élément</dt><dd class="mono">${esc(q.element||"·")}</dd><dt>Fichier</dt><dd class="mono">${esc(q.fichier)}</dd>${q.apercu?`<dt>Profil</dt><dd>${esc(q.apercu)}</dd>`:""}</dl></section>
      <section><h4>Formulation technique</h4><p>${esc(q.question)}</p></section>
      <section><h4>Ensuite, par indicateurs débloqués</h4>${suite.length?`<ul class="se-suite">${suite.map(x=>`<li><span class="t">${esc(x.titre||x.question)}<small>${esc(x.id)}</small></span><span class="k">${(x.mesures||[]).length} <span>indic.</span></span></li>`).join("")}</ul>`:`<p class="note">Dernière question de la séance.</p>`}</section>
    </div></div>`;
  if(garde){ const f=v.querySelector(".qform"), t=f?.querySelector('[name="texte"]'); if(t) t.value=garde.t; const d=f?.querySelector(".qautre"); if(d&&garde.o) d.open=true; }
  if(titreFocus) $("#se-t")?.focus({preventScroll:true});
}
$("#sev").addEventListener("click",e=>{
  if(e.target.closest("[data-se-partage]")){ S.sePartage=!S.sePartage; renderSeance(); $("[data-se-partage]").focus(); return; }
  const sk=e.target.closest("[data-se-skip]"); if(sk){ S.seSkip.push(sk.dataset.seSkip); renderSeance(); $("#se-t")?.focus(); } });
$("#sev").addEventListener("submit",async e=>{
  const form=e.target.closest(".qform"); if(!form) return; e.preventDefault();
  const q=listeQuestions().find(x=>x.id===form.dataset.qid); if(!q) return;
  const par=form.querySelector('[name="par"]').value.trim(), err=form.querySelector(".qerr"), b=form.querySelector('[type="submit"]'); parEcrit(par); b.disabled=true;
  const echec=m=>{ err.hidden=false; err.textContent=m; b.disabled=false; }, saisie=saisieQ(form,q);
  if(q.type==="codes"&&!saisie.autre&&!Object.values(saisie.codes).some(x=>x.trim())&&!saisie.exclus.length) return echec("Indiquez au moins une signification, ou cochez un code à exclure.");
  const avant=seMesure(); if(!await envoyerRep(q,q.type==="libre"?{texte:saisie.texte}:saisie,par,echec)) return;
  S.seEffet={...avant,titre:q.titre||q.question}; renderSeance(); $("#se-t")?.focus(); });

/* ───────────── besoins ───────────── */
function pageBesoins() {
  const besoins = S.st.besoins || { themes: [], libres: [] };
  const themesChoisis = new Set(besoins.themes.filter(t => t.choisi).map(t => t.id));
  const cov = COV();
  const html = THEMES().map(t => {
    const checked = themesChoisis.has(t.id) ? " checked" : "";
    const alim = t.mesures.some(n => {
      const m = CAT().list.find(x => x.name === n);
      return m && (cov.get(m.id)?.s === "ok" || cov.get(m.id)?.s === "part");
    });
    const badge = alim ? ' <span class="badge">Données disponibles</span>' : "";
    const mesuresList = t.mesures.slice(0, 8).join(", ") + (t.mesures.length > 8 ? "…" : "");
    return `<div class="theme-block">
      <label><input type="checkbox" name="theme" value="${t.id}"${checked}> <strong>${esc(t.title)}</strong>${badge}</label>
      <details><summary>${t.mesures.length} mesures</summary><p>${esc(mesuresList)}</p></details>
    </div>`;
  }).join("\n");
  return `<h2>Quels indicateurs voulez-vous suivre ?</h2>
<p>Cochez les thèmes que vous souhaitez voir dans votre dashboard.</p>
<form id="form-besoins">
${html}
<div class="libre">
  <label>Autre indicateur :</label>
  <input type="text" name="libre" placeholder="ex: taux de sinistralité">
</div>
<button type="submit">Valider mes choix</button>
</form>`;
}

/* ───────────── onglets ───────────── */
const TABS=["canvas","cat","mes","prev","files","q","seance","log","adh"];
function renderTab(){ if(S.tab==="cat") renderCat(); if(S.tab==="mes") renderMes(); if(S.tab==="prev") renderPrev(); if(S.tab==="files") renderFiles(); if(S.tab==="q") renderQ(); if(S.tab==="seance") renderSeance(); if(S.tab==="log") renderLog(); if(S.tab==="adh") renderAdh(); }
function setTab(t){ S.tab=t; TABS.forEach(x=>{ $("#t-"+x).setAttribute("aria-selected",x===t); $("#view-"+x).hidden=x!==t; }); if(t==="canvas") renderAll(); else renderTab(); }
TABS.forEach(x=>$("#t-"+x).onclick=()=>setTab(x));


/* ───────────── adhérents (admin) ───────────── */
const nb=x=>Number(x)||0;
const barre=(a,b)=>{ a=nb(a); b=nb(b); return `<span class="adhn">${a}/${b}</span> <span class="qprog"><i style="width:${b?Math.min(100,Math.round(a/b*100)):0}%"></i></span>`; };
/* Mémoire commune : bloc admin, alimenté par vue.apprentissage et l'événement SSE « apprentissage ». */
function blocMemoire(){
  const v=S.vue; if(!v||v.role!=="admin"||!v.apprentissage) return ""; const f=v.apprentissage.faits||[], r=S.appr;
  const res=S.apprErr?`<p class="qerr">${esc(S.apprErr)}</p>`:r?`<p class="maq-ok" role="status">Mémoire mise à jour : ${nb(r.faits?.length)} fait${nb(r.faits?.length)>1?"s":""} appris.</p>`:"";
  return `<section class="maq mem"><h3>Mémoire commune</h3>${f.length?`<p><b>${f.length} hypothèse${f.length>1?"s":""} tranchée${f.length>1?"s":""} à apprendre</b></p><ul class="memfaits">${f.map(x=>`<li>${esc(x.type)} · ${esc(x.cle)} : ${esc(x.effet)}</li>`).join("")}</ul>`:'<p class="note">Rien à apprendre pour l\'instant.</p>'}
   <button class="btn" type="button" data-mem="appliquer"${f.length?"":" disabled"}>Appliquer à la mémoire</button>${res}</section>`; }
async function appliquerMemoire(b){ b.disabled=true; S.apprErr=null; S.appr=null;
  try{ const r=await fetch("/api/apprendre"+location.search,{method:"POST",headers:{"content-type":"application/json"},body:"{}"}); const j=await r.json().catch(()=>({})); if(r.ok) S.appr=j; else S.apprErr=(j.erreurs||[j.erreur||"Apprentissage impossible."]).join(" · "); }
  catch(_){ S.apprErr="Serveur injoignable."; }
  await loadState(); if(S.tab==="adh") renderAdh(); }
$("#adhv").addEventListener("click",e=>{ const b=e.target.closest("[data-mem]"); if(b&&!b.disabled) appliquerMemoire(b);
  const p=e.target.closest("[data-adh-pg]"); if(p){ S.adhPage=(S.adhPage||0)+Number(p.dataset.adhPg); listeAdh(); $("#adhnb")?.scrollIntoView({block:"nearest"}); ($(`[data-adh-pg="${p.dataset.adhPg}"]:not(:disabled)`)||$(`[data-adh-pg]:not(:disabled)`))?.focus(); }
  if(e.target.closest("[data-adh-rech-x]")){ S.adhRech=""; S.adhPage=0; $("#adh-rech").value=""; listeAdh(); $("#adh-rech").focus(); } });
$("#adhv").addEventListener("input",e=>{ if(e.target.id!=="adh-rech") return; S.adhRech=e.target.value; S.adhPage=0; listeAdh(); });
/* Nouvel adhérent (admin) : POST /api/adherents. L'état vit hors du rendu de la liste, le mot de passe n'est gardé que pour l'écran de résultat. */
let N=null;
const slug=t=>String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40).replace(/-+$/,"");
const nouvVide=()=>({nom:"",id:"",idManuel:false,soc:[{id:"",name:"",source:""}],sftp:{host:"",port:"",user:"",password:"",dir:""},sftpOuvert:false,maquette:false,erreurs:{},general:"",envoi:false,resultat:null,copie:""});
const MSG_MAQ={lancee:"La maquette est lancée : suivez-la dans l'onglet Questions de cet adhérent.","indisponible":"La maquette n'a pas pu démarrer (agent non configuré) : lancez-la plus tard depuis l'onglet Questions de cet adhérent.","non-demandee":"Aucune maquette lancée."};
const champ=(cle,label,val,o={})=>`<label class="nv-ch"><span>${esc(label)}</span><input data-nv="${esc(cle)}" type="${o.type||"text"}" value="${esc(val)}"${o.ph?` placeholder="${esc(o.ph)}"`:""} autocomplete="${o.type==="password"?"new-password":"off"}"${o.max?` maxlength="${o.max}"`:""}><span class="qerr" data-err="${esc(cle)}">${esc(N.erreurs[cle]||"")}</span></label>`;
function renderNouv(){
  const z=$("#nouv"); if(!z) return;
  if(!N){ z.innerHTML=`<button class="btn primary" type="button" data-nv-act="ouvrir">Nouvel adhérent</button>`; return; }
  if(N.resultat){ const r=N.resultat;
    z.innerHTML=`<section class="maq nv-res" role="status"><h3>Adhérent « ${esc(r.id)} » créé</h3>
     <p>Mot de passe du compte (à transmettre à l'adhérent) :</p>
     <p><code class="nv-mdp" id="nv-mdp">${esc(r.mdp)}</code> <button class="btn sm" type="button" data-nv-act="copier">Copier</button> <span class="note" id="nv-copie" role="status">${esc(N.copie)}</span></p>
     <p class="qerr">Il ne sera plus affiché : copiez-le maintenant.</p>
     <p class="note">${esc(MSG_MAQ[r.maquette]||"")}</p>
     <button class="btn" type="button" data-nv-act="fermer">J'ai copié le mot de passe, fermer</button></section>`; return; }
  const soc=N.soc.map((s,i)=>`<div class="nv-soc" data-i="${i}">${champ(`societes[${i}].id`,"Identifiant de la société",s.id,{ph:i?"":N.id||"identique à l'adhérent",max:40})}${champ(`societes[${i}].name`,"Nom de la société",s.name,{ph:i?"":N.nom||"identique à l'adhérent",max:120})}${champ(`societes[${i}].source`,"Source (facultatif)",s.source,{ph:"TMS, comptabilité…",max:120})}${N.soc.length>1?`<button class="btn sm ghost" type="button" data-nv-act="retirer" data-i="${i}">Retirer</button>`:""}</div>`).join("");
  const sf=N.sftp;
  z.innerHTML=`<form class="maq nv-form" novalidate><h3>Nouvel adhérent</h3>
   ${champ("nom","Nom de l'adhérent",N.nom,{max:120})}${champ("id","Identifiant (a-z, 0-9, - et _)",N.id,{max:40})}
   <h4>Sociétés</h4><p class="qerr" data-err="societes">${esc(N.erreurs.societes||"")}</p>${soc}
   <button class="btn sm" type="button" data-nv-act="ajouter">Ajouter une société</button>
   <details class="nv-sftp"${N.sftpOuvert?" open":""}><summary>Accès SFTP (facultatif)</summary>
    <p class="note">Si un champ est rempli, serveur, utilisateur, mot de passe et dossier sont tous nécessaires.</p>
    ${champ("sftp.host","Serveur",sf.host)}${champ("sftp.port","Port (22 par défaut)",sf.port,{type:"number"})}${champ("sftp.user","Utilisateur",sf.user)}${champ("sftp.password","Mot de passe",sf.password,{type:"password"})}${champ("sftp.dir","Dossier distant",sf.dir,{max:200})}${N.soc.length>1?`<p class="note">Plusieurs sociétés : un sous-dossier par identifiant de société.</p>`:""}
   </details>
   <label class="nv-chk"><input type="checkbox" data-nv="maquette"${N.maquette?" checked":""}> Lancer la maquette après la création</label>
   <p class="qerr" data-err="general" role="alert">${esc(N.general)}</p>
   <div class="nv-act"><button class="btn primary" type="button" data-nv-act="creer"${N.envoi?" disabled":""}>${N.envoi?"Création…":"Créer l'adhérent"}</button> <button class="btn ghost" type="button" data-nv-act="fermer">Annuler</button></div></form>`;
}
function lireNouv(){ const f=$("#nouv .nv-form"); if(!f||!N) return; /* le DOM fait foi */
  f.querySelectorAll("[data-nv]").forEach(i=>{ const k=i.dataset.nv; if(k==="maquette") N.maquette=i.checked; else if(k==="nom") N.nom=i.value; else if(k==="id") N.id=i.value; else if(k.startsWith("sftp.")) N.sftp[k.slice(5)]=i.value; else { const m=k.match(/^societes\[(\d+)\]\.(id|name|source)$/); if(m&&N.soc[m[1]]) N.soc[m[1]][m[2]]=i.value; } });
  N.sftpOuvert=f.querySelector(".nv-sftp").open; }
function corpsNouv(){ const s=N.soc.map((x,i)=>({id:x.id||(i?"":N.id),name:x.name||(i?"":N.nom),...(x.source?{source:x.source}:{})})), sf=N.sftp, a=Object.values(sf).some(v=>v!=="");
  return {nom:N.nom,id:N.id,societes:s,maquette:N.maquette,...(a?{sftp:{host:sf.host,user:sf.user,password:sf.password,dir:sf.dir,...(sf.port!==""?{port:Number(sf.port)}:{})}}:{})}; }
const LIB_NV={"nom":"Nom de l'adhérent","id":"Identifiant","societes":"Sociétés"};
async function creerNouv(){ lireNouv(); N.erreurs={}; N.general=""; N.envoi=true; renderNouv();
  try{ const r=await fetch("/api/adherents",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(corpsNouv())}); const j=await r.json().catch(()=>({}));
    if(r.status===201){ N.resultat={id:j.id,mdp:j.mdp,maquette:j.maquette}; N.sftp.password=""; N.envoi=false; renderNouv(); if(S.tab==="adh") renderAdh(); return; }
    if(Array.isArray(j.erreurs)) j.erreurs.forEach(x=>{ const c=String(x.champ||""); if(!N.erreurs[c]) N.erreurs[c]=String(x.msg||"Valeur invalide."); });
    else N.general=r.status===429?"Trop de créations, réessayez plus tard.":r.status===403?"Réservé à l'administrateur.":j.erreur||"Création impossible, rien n'a été créé.";
    const champs=[...document.querySelectorAll("#nouv [data-nv]")].map(i=>i.dataset.nv); Object.keys(N.erreurs).filter(c=>!champs.includes(c)&&c!=="societes").forEach(c=>{ N.general=(N.general?N.general+" ":"")+N.erreurs[c]; });
    if(Object.keys(N.erreurs).some(c=>c.startsWith("sftp."))) N.sftpOuvert=true;
  }catch(_){ N.general="Serveur injoignable, rien n'a été créé."; }
  N.envoi=false; renderNouv(); const e=document.querySelector("#nouv .qerr:not(:empty)"); if(e) e.scrollIntoView({block:"center"}); }
function copierMdp(){ const t=N?.resultat?.mdp; if(!t) return; const ok=()=>{ N.copie="Copié."; const c=$("#nv-copie"); if(c) c.textContent=N.copie; };
  const repli=()=>{ const r=document.createRange(); r.selectNodeContents($("#nv-mdp")); const s=getSelection(); s.removeAllRanges(); s.addRange(r); try{ if(document.execCommand("copy")) return ok(); }catch(_){} N.copie="Sélectionné : faites Ctrl+C."; $("#nv-copie").textContent=N.copie; };
  if(navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(ok,repli); else repli(); }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-nv-act]"); if(!b||!$("#nouv")?.contains(b)) return; const a=b.dataset.nvAct;
  if(a==="ouvrir"){ N=nouvVide(); renderNouv(); $("#nouv input")?.focus(); return; }
  if(a==="fermer"){ N=null; renderNouv(); return; }
  if(a==="copier") return copierMdp();
  lireNouv();
  if(a==="ajouter"){ N.soc.push({id:"",name:"",source:""}); renderNouv(); }
  else if(a==="retirer"){ N.soc.splice(Number(b.dataset.i),1); renderNouv(); }
  else if(a==="creer") creerNouv(); });
document.addEventListener("input",e=>{ const i=e.target.closest?.("#nouv [data-nv]"); if(!i||!N||N.resultat) return; const k=i.dataset.nv, f=$("#nouv [data-nv='id']");
  if(k==="id") N.idManuel=true;
  if(k==="nom"&&!N.idManuel&&f) f.value=slug(i.value);
  if(i.type!=="checkbox"){ const m=document.querySelector(`#nouv [data-err="${CSS.escape(k)}"]`); if(m) m.textContent=""; delete N.erreurs[k]; }
  if(k==="nom"||k==="id"){ lireNouv(); document.querySelectorAll("#nouv .nv-soc[data-i='0'] input").forEach(x=>{ const kk=x.dataset.nv; if(kk==="societes[0].id") x.placeholder=N.id||"identique à l'adhérent"; if(kk==="societes[0].name") x.placeholder=N.nom||"identique à l'adhérent"; }); } });
let adhSeq=0;
async function renderAdh(){
  const v=$("#adhv"), seq=++adhSeq; let l;
  try{ const r=await fetch("/api/adherents",{cache:"no-store"}); if(!r.ok) throw new Error(); l=await r.json(); }
  catch(_){ if(seq===adhSeq) v.innerHTML=`<h2>Adhérents</h2><p class="qerr">Liste indisponible.</p>`; return; }
  if(seq!==adhSeq) return;
  S.adhL=Array.isArray(l)?l:[]; const ouverts=new Set([...v.querySelectorAll("[data-liv].open")].map(b=>b.dataset.liv));
  if(!$("#adhliste")){
    v.innerHTML=`<div id="adhmem"></div><h2>Adhérents</h2><div id="nouv"></div><p class="lede">Avancement de chaque adhérent : questions traitées, mesures du dashboard alimentées, dernier build.</p>
     <div class="adhoutils"><label class="adhrech"><input class="inp" id="adh-rech" type="search" aria-label="Rechercher un adhérent" placeholder="Rechercher un adhérent (nom ou identifiant)" autocomplete="off" value="${esc(S.adhRech||"")}"></label><p class="note" id="adhnb" role="status"></p></div><div id="adhliste"></div>`;
    renderNouv(); }
  $("#adhmem").innerHTML=blocMemoire(); listeAdh(ouverts);
}
const ADH_PP=25;
function listeAdh(ouverts){
  const z=$("#adhliste"); if(!z) return; ouverts=ouverts||new Set([...z.querySelectorAll("[data-liv].open")].map(b=>b.dataset.liv));
  const tous=S.adhL||[], r=String(S.adhRech||"").trim().toLowerCase(), l=r?tous.filter(a=>`${a.nom||""} ${a.id}`.toLowerCase().includes(r)):tous;
  const nP=Math.max(1,Math.ceil(l.length/ADH_PP)); S.adhPage=Math.min(Math.max(0,S.adhPage||0),nP-1); const vis=l.slice(S.adhPage*ADH_PP,(S.adhPage+1)*ADH_PP);
  $("#adhnb").textContent=`${l.length} adhérent${l.length>1?"s":""}${r?` sur ${tous.length}`:""}`;
  const ligne=a=>a.erreur?`<tr class="adh-ko"><td><b>${esc(a.id)}</b></td><td colspan="7"><span class="adhpill ko">${esc(a.erreur)}</span></td></tr>`
   :`<tr><td><b>${esc(a.nom||a.id)}</b><div class="note">${esc(a.id)}</div></td>
    <td data-l="Questions">${barre(a.questions?.traitees,a.questions?.total)}</td><td data-l="Mesures">${barre(a.mesures?.ok,a.mesures?.total)}</td>
    <td data-l="Erreurs">${nb(a.erreurs)?`<span class="adhpill ko">${nb(a.erreurs)}</span>`:`<span class="adhpill ok">0</span>`}</td>
    <td data-l="Dernier build">${a.dernierBuild?`${esc(new Date(a.dernierBuild).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}))} <span class="adhpill ${a.buildOk?"ok":"ko"}">${a.buildOk?"ok":"échec"}</span>`:'<span class="note">jamais</span>'}</td>
    <td data-l="Réponses libres">${nb(a.libres)}</td><td data-l="Fichiers non lus">${nb(a.nonLus)}</td>
    <td class="adhact"><a class="adhopen" href="/?adherent=${encodeURIComponent(a.id)}">Ouvrir</a> <button class="btn sm" type="button" data-liv="${esc(a.id)}">Livrables</button></td></tr>
    <tr class="adh-liv" data-livr="${esc(a.id)}" hidden><td colspan="8"></td></tr>`;
  z.innerHTML=!tous.length?`<div class="qfin"><p><b>Aucun adhérent pour l'instant.</b></p><p class="note">Créez le premier avec « Nouvel adhérent ».</p></div>`
   :!l.length?`<div class="qfin"><p><b>Aucun adhérent ne correspond à « ${esc(S.adhRech)} ».</b></p><p class="note">Vérifiez l'orthographe ou cherchez par identifiant.</p><button class="btn" type="button" data-adh-rech-x>Effacer la recherche</button></div>`
   :`<table class="adhtab"><thead><tr><th>Adhérent</th><th>Questions</th><th>Mesures</th><th>Erreurs</th><th>Dernier build</th><th>Réponses libres</th><th>Fichiers non lus</th><th></th></tr></thead><tbody>${vis.map(ligne).join("")}</tbody></table>
     ${nP>1?`<div class="adhpages"><span>Page ${S.adhPage+1} sur ${nP}</span><button class="btn" type="button" data-adh-pg="-1"${S.adhPage?"":" disabled"}>Précédente</button><button class="btn" type="button" data-adh-pg="1"${S.adhPage<nP-1?"":" disabled"}>Suivante</button></div>`:""}`;
  z.querySelectorAll("[data-liv]").forEach(b=>{
    const cell=z.querySelector(`[data-livr="${CSS.escape(b.dataset.liv)}"]`);
    const charger=async()=>{ const id=b.dataset.liv; b.classList.add("open");
      if(!cell.firstChild.innerHTML){ cell.firstChild.innerHTML='<span class="note">Chargement…</span>'; cell.hidden=false; }
      try{ const r=await fetch("/api/livrables?adherent="+encodeURIComponent(id),{cache:"no-store"}); if(!r.ok) throw new Error(); const j=await r.json(); const fs=Array.isArray(j)?j:[];
        cell.firstChild.innerHTML=fs.length?`<ul class="adhliv">${fs.map(f=>{ const p=f.path; return `<li><a href="/api/livrable?adherent=${encodeURIComponent(id)}&f=${encodeURIComponent(p)}" download>${esc(p)}</a></li>`; }).join("")}</ul>`:'<span class="note">Aucun livrable : pas encore de build.</span>';
      }catch(_){ cell.firstChild.innerHTML='<span class="qerr">Livrables indisponibles.</span>'; }
      if(b.classList.contains("open")) cell.hidden=false; };
    b.onclick=()=>{ if(b.classList.contains("open")){ b.classList.remove("open"); cell.hidden=true; } else charger(); };
    if(ouverts.has(b.dataset.liv)) charger();
  });
}
