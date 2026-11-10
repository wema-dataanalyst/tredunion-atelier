/* ───────────── vue Dashboard (reproduction des feuilles Qlik) ───────────── */
const DASH_EXTRA=`Total Coûts Réel
    [Charges réelles]
Taux de frais d'entretien
    [Entretien] / [CA Réel]
Taux de frais de personnel
    [Masse réel] / [CA Réel]
KM / Moteur
    [KM Réel] / [Nb Véhicules]
Masse / heure Réel
    [Masse réel] / [Nbre Heure Réel]`;
const RECON=new Set(["Total Coûts Réel","Taux de frais d'entretien","Taux de frais de personnel","KM / Moteur","Masse / heure Réel","Nb jours ouvrables","CA par jour travaillé"]);
const ALIAS={"Masse Budget Réel":"Marge budget réel","Masse Réel Intérim M-1":"Masse réel intermin M-1","Masse Réel Intérim N-1":"Masse réel intermin N-1","Nbre Heure Total Réel":"Nbre Heure Réel","Résultat Réel M-1":"Résultat réel M-1"};
const SERIES=["var(--soc-0)","var(--gold)","var(--soc-1)","var(--soc-3)","var(--soc-2)","var(--accent)"];
function DCAT(){ return cached("dcat",()=>analyseCatalogue(parseCatalogue((S.st.catalogue??CAT_SRC)+extensionCatalogue()+"\n"+DASH_EXTRA),new Set(S.st.categories.map(c=>c.cod)))); }
function dm(name){ const c=DCAT(); if(name==="Résultat Réel N-1"){ const l=c.list.filter(m=>m.name==="Résultat réel M-1"); return l.length>1?l[l.length-1]:null; } return c.resolve(ALIAS[name]||name); }
let EVC=new Map();
function dashRows(){ let rows=buildFaits().rows; const p=S.prev;
  if(p.site) rows=rows.filter(r=>(r.site||"")===(p.site==="∅"?"":p.site));
  if(p.veh) rows=rows.filter(r=>r.veh===p.veh); if(p.chauf) rows=rows.filter(r=>r.chauf===p.chauf); return rows; }
function workDays(){ const a=S.prev.annee; const months=S.prev.mois?[S.prev.mois]:Array.from({length:12},(_,i)=>i+1); let n=0; months.forEach(m=>{ const last=new Date(a,m,0).getDate(); for(let d=1;d<=last;d++){ const w=new Date(a,m-1,d).getDay(); if(w&&w<6) n++; } }); return n; }
function dv(name,filt){
  if(name==="Nb jours ouvrables") return {v:workDays()};
  if(name==="CA par jour travaillé"){ const r=dv("CA Réel",filt); return r.err?r:{v:r.v/workDays()}; }
  const m=dm(name); if(!m) return {err:"mesure absente du catalogue"};
  const k=filt?filt.key:""; if(!EVC.has(k)){ const base=dashRows(); EVC.set(k,makeEval(DCAT(),filt?base.filter(filt.fn):base,buildDims(),{annee:S.prev.annee,mois:S.prev.mois})); }
  return EVC.get(k)(m);
}
const FMT={eur:v=>fmtN(v,0)+" €",pct:v=>fmtN(v*100,2)+" %",num:v=>fmtN(v,0),km:v=>fmtN(v,0)+" km"};
function fv(r,fmt){ if(r.err) return null; const v=r.v; if(typeof v!=="number"||!isFinite(v)) return null; return (FMT[fmt]||FMT.eur)(v); }
function mTitle(name){ const m=dm(name); const real=m?m.name:"absente"; const st=m&&!RECON.has(name)?(COVD().get(m.id)?.s):null; const cm=m&&!RECON.has(name)?CAT().resolve(m.name):null; const hb=cm?badgeMesure(cm):null; return `Mesure : ${real}${RECON.has(name)?" (reconstituée, hors catalogue)":""}${st?" · "+ST_M[st]:""}${hb?" · "+CONF_LIB[hb.pire]:""}`; }
function COVD(){ return cached("covd",()=>coverage(DCAT(),buildFaits().rows)); }
function kcell(it,main){ const r=dv(it.m), m=dm(it.m), vide=m&&COVD().get(m.id)?.s==="none", t=vide?null:fv(r,it.fmt);
  const warn=m&&m.issues.some(i=>i.sev==="bad")?`<span class="q" title="${esc(m.issues.filter(i=>i.sev==="bad").map(i=>i.txt).join("\n"))}">anomalie catalogue</span>`:"";
  const lb=(S.prev.sheet||"")+"|"+(it.label||it.m), n=KN.get(lb)||0; KN.set(lb,n+1);
  return `<div data-k="${esc(lb+"|"+n)}" class="kc${main?" main":""}${t==null?" nc":""}" title="${esc(mTitle(it.m))}"><div class="l">${esc(it.label||it.m)}${RECON.has(it.m)?' <span class="recon">reconstituée</span>':""}</div><div class="v">${t??"En attente"}</div>${warn}</div>`; }
function oKB(o){ return `<div class="obj" style="grid-column:span ${o.span||6}"><h4>${esc(o.title)}</h4><div class="kb${o.items.length===2?" n2":""}" ${o.items.length===4&&o.grid?'style="grid-template-columns:1fr 1fr"':""}>${o.items.map((it,i)=>kcell(it,i===0&&!o.grid)).join("")}</div></div>`; }
function oStack(o){ return `<div class="stack" style="grid-column:span ${o.span||3}">${o.items.map(it=>`<div class="obj">${kcell(it,true)}</div>`).join("")}</div>`; }
function dimValues(dim){
  const rows=dashRows();
  if(dim==="mois") return Array.from({length:12},(_,i)=>({label:pad(i+1),key:"m"+(i+1),fn:r=>r.mois===i+1}));
  if(dim==="filiale"){ const s=[...new Set(rows.map(r=>r.site||""))].sort(); return s.map(x=>({label:x||"Sans filiale",key:"s"+x,fn:r=>(r.site||"")===x})); }
  if(dim==="veh"){ const dims=buildDims(); const s=[...new Set(rows.map(r=>r.veh).filter(Boolean))]; return s.map(x=>({label:dims.veh.get(x)?.NUM_IMAT||x,key:"v"+x,fn:r=>r.veh===x})); }
  return [];
}
function series(o){ const dv0=dimValues(o.dim); let cats=dv0.map(d=>({label:d.label,vals:o.measures.map(ms=>{ const r=dv(ms.m,{key:o.dim+":"+d.key,fn:d.fn}); return r.err||typeof r.v!=="number"?null:r.v; })}));
  if(o.top){ cats=cats.sort((a,b)=>(b.vals[0]||0)-(a.vals[0]||0)).slice(0,o.top); } return cats; }
function axisFmt(v,fmt){ if(fmt==="pct") return fmtN(v*100,0)+" %"; const a=Math.abs(v); return a>=1e6?fmtN(v/1e6,1)+" M":a>=1e3?fmtN(v/1e3,0)+" k":fmtN(v,0); }
function chartFrame(cats,o,body){ const all=cats.flatMap(c=>c.vals).filter(v=>v!=null); if(!all.length) return '<p class="note">Aucune valeur calculable : les catégories utilisées par ces mesures ne sont pas encore alimentées.</p>';
  const W=Math.max(420,cats.length*(o.type==="line"?40:22*o.measures.length+16)),H=220,pl=52,pb=o.rot?60:24,pt=10; const max=Math.max(0,...all),min=Math.min(0,...all),span=(max-min)||1; const y=v=>pt+(H-pt-pb)*(1-(v-min)/span); const bw=(W-pl-8)/cats.length;
  const ticks=[min,min+span/2,max].filter((v,i,a)=>a.indexOf(v)===i);
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:${Math.min(W,420)}px;display:block" role="img" aria-label="${esc(o.title)}">
   ${ticks.map(t=>`<line x1="${pl}" x2="${W-4}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line-2)"/><text x="${pl-6}" y="${y(t)+3.5}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="var(--f-mono)">${axisFmt(t,o.fmt)}</text>`).join("")}
   ${body({y,bw,pl,H,pb})}
   ${cats.map((c,i)=>{ const x=pl+i*bw+bw/2; return o.rot?`<text transform="translate(${x},${H-pb+10}) rotate(-40)" text-anchor="end" font-size="9.5" fill="var(--muted)">${esc(c.label)}</text>`:`<text x="${x}" y="${H-8}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${esc(c.label)}</text>`; }).join("")}
  </svg></div>`; }
function oChart(o){
  const cats=series(o); const legend=`<div class="legend">${o.measures.map((ms,i)=>`<span title="${esc(mTitle(ms.m))}"><i style="background:${SERIES[i]}"></i>${esc(ms.label||ms.m)}</span>`).join("")}</div>`;
  const svg=chartFrame(cats,o,({y,bw,pl})=>o.type==="line"
    ? o.measures.map((ms,si)=>{ const pts=cats.map((c,i)=>c.vals[si]==null?null:[pl+i*bw+bw/2,y(c.vals[si])]).filter(Boolean); return `<polyline points="${pts.map(p=>p.join(",")).join(" ")}" fill="none" stroke="${SERIES[si]}" stroke-width="2"/>${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${SERIES[si]}"><title>${esc(ms.label||ms.m)} : ${axisFmt(cats.filter(c=>c.vals[si]!=null)[i].vals[si],o.fmt)}</title></circle>`).join("")}`; }).join("")
    : cats.map((c,i)=>{ const n=o.measures.length, gw=Math.min(bw-6,n*22), w=gw/n; return c.vals.map((v,si)=>{ if(v==null) return ""; const x=pl+i*bw+(bw-gw)/2+si*w, y0=y(0), y1=y(v); return `<rect x="${x}" y="${Math.min(y0,y1)}" width="${Math.max(2,w-2)}" height="${Math.max(1,Math.abs(y1-y0))}" rx="2" fill="${SERIES[si]}"><title>${esc(c.label)} · ${esc(o.measures[si].label||o.measures[si].m)} : ${(FMT[o.fmt]||FMT.eur)(v)}</title></rect>`; }).join(""); }).join(""));
  return `<div class="obj" style="grid-column:span ${o.span||6}"><h4>${esc(o.title)}${o.note?`<small>${esc(o.note)}</small>`:""}</h4>${legend}${svg}</div>`;
}
function oTable(o){ const cats=series(o); return `<div class="obj" style="grid-column:span ${o.span||6}"><h4>${esc(o.title)}</h4><div class="tblwrap"><table class="ptab" style="width:100%"><thead><tr><th>${esc(o.dimLabel||"")}</th>${o.measures.map(ms=>`<th title="${esc(mTitle(ms.m))}">${esc(ms.label||ms.m)}</th>`).join("")}</tr></thead><tbody>
  <tr class="tot"><td>Totaux</td>${o.measures.map(ms=>`<td>${fv(dv(ms.m),o.fmt)??"—"}</td>`).join("")}</tr>
  ${cats.map(c=>`<tr><td>${esc(c.label)}</td>${c.vals.map(v=>`<td>${v==null?"—":(FMT[o.fmt]||FMT.eur)(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`; }
function oPivot(o){ const fil=dimValues("filiale"); const months=dimValues("mois");
  const cell=(ms,f,m)=>{ const fns=[f&&f.fn,m&&m.fn].filter(Boolean); const r=dv(ms.m,fns.length?{key:"pv:"+(f?f.key:"")+"|"+(m?m.key:""),fn:x=>fns.every(fn=>fn(x))}:null); return r.err||typeof r.v!=="number"?"—":fmtN(r.v,0); };
  return `<div class="obj" style="grid-column:span ${o.span||12}"><h4>${esc(o.title)}<small>mois en colonnes, filiales en lignes</small></h4><div class="tblwrap"><table class="ptab"><thead>
   <tr><th></th>${months.map(m=>`<th class="grp" colspan="${o.measures.length}">${m.label}</th>`).join("")}</tr>
   <tr><th>Filiale</th>${months.map(()=>o.measures.map((ms,i)=>`<th class="${i?"":"gs"}" title="${esc(mTitle(ms.m))}">${esc(ms.label||ms.m)}</th>`).join("")).join("")}</tr></thead><tbody>
   <tr class="tot"><td>Totaux</td>${months.map(m=>o.measures.map((ms,i)=>`<td class="${i?"":"gs"}">${cell(ms,null,m)}</td>`).join("")).join("")}</tr>
   ${fil.map(f=>`<tr><td>${esc(f.label)}</td>${months.map(m=>o.measures.map((ms,i)=>`<td class="${i?"":"gs"}">${cell(ms,f,m)}</td>`).join("")).join("")}</tr>`).join("")}
  </tbody></table></div></div>`; }
function arcPath(cx,cy,r0,r1,a0,a1){ const p=(r,a)=>[cx+r*Math.sin(a),cy-r*Math.cos(a)]; const lg=a1-a0>Math.PI?1:0; const [x1,y1]=p(r1,a0),[x2,y2]=p(r1,a1),[x3,y3]=p(r0,a1),[x4,y4]=p(r0,a0); return `M${x1},${y1} A${r1},${r1} 0 ${lg} 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 ${lg} 0 ${x4},${y4} Z`; }
function donutSvg(items,fmt){ const tot=items.reduce((s,x)=>s+x.v,0); if(!tot) return '<p class="note">Aucune valeur positive à afficher.</p>'; let a=0; const C=SERIES.concat(["var(--muted)","var(--warn)","var(--ok)"]);
  return `<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 200 200" width="180" height="180" role="img" aria-label="Répartition">${items.map((x,i)=>{ const a0=a; a+=x.v/tot*2*Math.PI; return `<path d="${arcPath(100,100,55,92,a0,Math.min(a,a0+2*Math.PI-1e-4))}" fill="${C[i%C.length]}"><title>${esc(x.label)} : ${(FMT[fmt]||FMT.eur)(x.v)} (${fmtN(x.v/tot*100,1)} %)</title></path>`; }).join("")}</svg>
  <div class="legend" style="flex-direction:column;gap:4px;min-width:0;flex:1">${items.map((x,i)=>`<span><i style="background:${C[i%C.length]}"></i>${esc(x.label)} · ${fmtN(x.v/tot*100,1)} %</span>`).join("")}</div></div>`; }
function oPieDim(o){ const cats=series(o).filter(c=>c.vals[0]>0).map(c=>({label:c.label,v:c.vals[0]})); return `<div class="obj" style="grid-column:span ${o.span||4}"><h4>${esc(o.title)}<small>${esc(o.note||"")}</small></h4>${donutSvg(cats,o.fmt)}</div>`; }
const CA_CODES=new Set(["CA TOTAL","PR EXEP","CA POLE","CA TPS TOT","CA AFF","CA LOG","CA TPS","Egal","FRAIS FI","STRUCT"]);
function costRows(){ const p=S.prev; return dashRows().filter(r=>r.annee===p.annee&&(!p.mois||r.mois===p.mois)&&r.MontantReel!=null&&!CA_CODES.has(r.cod)&&(r.unite==="€")); }
function costByLib(){ const m=new Map(); costRows().forEach(r=>m.set(r.lib,(m.get(r.lib)||0)+r.MontantReel)); return [...m.entries()].map(([label,v])=>({label,v})).sort((a,b)=>b.v-a.v); }
function oCostDonut(o){ let it=costByLib().filter(x=>x.v>0); if(it.length>9){ const rest=it.slice(8).reduce((s,x)=>s+x.v,0); it=it.slice(0,8).concat([{label:"Autres",v:rest}]); }
  return `<div class="obj" style="grid-column:span ${o.span||6}"><h4>${esc(o.title)}<small>LIB_Categorie des charges en €, sur la période</small></h4>${donutSvg(it,"eur")}</div>`; }
function oCostTable(o){ const it=costByLib(); const km=dv("KM Réel"); const kmv=km.err?null:km.v; const jd=workDays(); const tot=it.reduce((s,x)=>s+x.v,0);
  return `<div class="obj" style="grid-column:span ${o.span||6}"><h4>${esc(o.title)}</h4><div class="tblwrap"><table class="ptab" style="width:100%"><thead><tr><th>Type de coût</th><th>Montant</th><th>Montant / jour</th><th>Montant / km</th></tr></thead><tbody>
   ${it.map(x=>`<tr><td>${esc(x.label)}</td><td>${fmtN(x.v,0)} €</td><td>${fmtN(x.v/jd,0)} €</td><td>${kmv?fmtN(x.v/kmv,3)+" €":"—"}</td></tr>`).join("")||'<tr><td colspan="4" class="note">Aucune charge en € sur la période.</td></tr>'}
   <tr class="tot"><td>Totaux</td><td>${fmtN(tot,0)} €</td><td>${fmtN(tot/jd,0)} €</td><td>${kmv?fmtN(tot/kmv,3)+" €":"—"}</td></tr></tbody></table></div></div>`; }
function oGauge(o){ const r=dv(o.m); const v=r.err||typeof r.v!=="number"?null:r.v; const frac=v==null?0:Math.max(0,Math.min(1,v/(o.max||1))); const a=-Math.PI/2+frac*Math.PI;
  return `<div class="obj" style="grid-column:span ${o.span||3}" title="${esc(mTitle(o.m))}"><h4>${esc(o.title)}</h4><svg viewBox="0 0 200 120" width="100%" style="max-width:260px;align-self:center" role="img" aria-label="${esc(o.title)}">
   <path d="${arcPath(100,105,62,86,-Math.PI/2,Math.PI/2)}" fill="var(--line-2)"/>${v!=null?`<path d="${arcPath(100,105,62,86,-Math.PI/2,a)}" fill="var(--accent)"/>`:""}
   <text x="100" y="100" text-anchor="middle" font-size="20" font-family="var(--f-mono)" fill="var(--fg)">${v==null?"n.c.":fmtN(v*100,1)+" %"}</text></svg></div>`; }
function oAGrid(o){ const g=(m,k)=>{ const r=dv(m); if(r.err||typeof r.v!=="number") return "—"; if(!k) return fmtN(r.v,0)+" €"; const km=dv("KM Réel"); return km.err||!km.v?"—":fmtN(r.v/km.v,3)+" €"; };
  const rows=[["CA","CA Réel"],["Coût","Charges réelles"],["Résultat","Résultat Avec Exceptionnel Réel"]];
  return `<div class="obj" style="grid-column:span ${o.span||6}"><h4>${esc(o.title)}</h4><div class="agrid"><div></div><div class="h">Global</div><div class="h">Par km</div>${rows.map(([l,m])=>`<div class="r" title="${esc(mTitle(m))}">${l}</div><div class="c">${g(m)}</div><div class="c">${g(m,1)}</div>`).join("")}</div></div>`; }
const SHEETS=[
 {id:"accueil",title:"Accueil",objs:[
  {t:"kb",title:"Chiffre d'affaires",span:7,items:[{m:"CA Réel"},{m:"Budget"},{m:"CA Réel M-1"},{m:"CA Réel N-1"}]},
  {t:"pie",title:"Répartition CA",dim:"filiale",measures:[{m:"CA Réel"}],note:"par filiale",span:3},
  {t:"stack",span:2,items:[{m:"Nb Véhicules",label:"Nombre de véhicules",fmt:"num"},{m:"KM Réel",fmt:"km"}]},
  {t:"kb",title:"Résultat avec exceptionnel",span:7,items:[{m:"Résultat Avec Exceptionnel Réel",label:"Résultat avec exceptionnel"},{m:"Budget résultat",label:"Budget"},{m:"Résultat Réel M-1"},{m:"Résultat Réel N-1"}]},
  {t:"chart",type:"bar",title:"Comparatif CA groupe mensuel par filiale",dim:"filiale",measures:[{m:"CA Réel N-1"},{m:"CA Réel"},{m:"Budget"}],span:5},
  {t:"pivot",title:"Comparatif CA par filiale",measures:[{m:"CA Réel"},{m:"Budget"},{m:"CA Réel N-1"},{m:"Ecart Budget VS Réel",label:"Écart budget"}],span:12},
 ]},
 {id:"general",title:"Général",objs:[
  {t:"stack",span:3,items:[{m:"Résultat Avec Exceptionnel Réel",label:"Résultat avec exceptionnel"},{m:"Masse réel",label:"Masse réel"},{m:"Marge parc propre",label:"Marge parc propre"},{m:"Marge affrètement",label:"Marge affrètement"},{m:"Total Coûts Réel"}]},
  {t:"table",title:"Résultat par filiale avec exceptionnel",dim:"filiale",dimLabel:"Filiale",measures:[{m:"Résultat Avec Exceptionnel Réel",label:"Résultat avec exceptionnel"},{m:"CA Réel"}],span:5},
  {t:"kb",title:"Chiffre d'affaires",grid:true,span:4,items:[{m:"CA Réel"},{m:"Budget"},{m:"CA Réel M-1"},{m:"CA Réel N-1"}]},
  {t:"chart",type:"line",title:"Comparatif évolution mensuelle marge par activité",dim:"mois",measures:[{m:"Marge affrètement"},{m:"Marge parc propre"}],span:5},
  {t:"chart",type:"bar",title:"Évolution mensuelle CA",dim:"mois",measures:[{m:"CA Réel"}],span:4},
 ]},
 {id:"resultat",title:"Résultat",objs:[
  {t:"chart",type:"bar",title:"Résultat vs budget",dim:"filiale",measures:[{m:"Résultat sans exceptionnel réel",label:"Résultat sans exceptionnel réel"},{m:"Budget résultat",label:"Budget"}],span:6},
  {t:"kb",title:"Résultat avec exceptionnel",span:6,items:[{m:"Résultat Avec Exceptionnel Réel",label:"Résultat avec exceptionnel"},{m:"Budget résultat",label:"Budget"},{m:"Résultat Réel M-1"},{m:"Résultat Réel N-1"}]},
  {t:"chart",type:"line",title:"Évolution de l'exceptionnel",dim:"mois",measures:[{m:"Total exceptionnel"}],span:6},
  {t:"chart",type:"bar",title:"Résultat avec exceptionnel par filiale",note:"remplace la carte",dim:"filiale",measures:[{m:"Résultat Avec Exceptionnel Réel",label:"Résultat avec exceptionnel"}],span:6},
 ]},
 {id:"masse",title:"Masse salariale",objs:[
  {t:"kb",title:"Masse totale réel",span:6,items:[{m:"Masse réel",label:"Masse réel"},{m:"Masse Budget Réel"},{m:"Masse réel M-1",label:"Masse réel M-1"},{m:"Masse réel N-1",label:"Masse réel N-1"}]},
  {t:"gauge",title:"% masse vs CA réel",m:"% Masse Vs CA Réel",span:3},
  {t:"gauge",title:"Coût intérim vs masse réel",m:"% Intérim Vs Réel",span:3},
  {t:"kb",title:"Masse intérim réel",span:6,items:[{m:"Masse intérim Réel",label:"Masse intérim réel"},{m:"Masse Budget Intérim Réel"},{m:"Masse Réel Intérim M-1"},{m:"Masse Réel Intérim N-1"}]},
  {t:"stack",span:6,items:[{m:"Masse / heure Réel",label:"Masse / heure réel"}]},
  {t:"kb",title:"Nombre d'heures réel",span:6,items:[{m:"Nbre Heure Total Réel",fmt:"num"},{m:"Nbre Heure Budget Réel",fmt:"num"},{m:"Nbre Heure Réel M-1",fmt:"num"},{m:"Nbre Heure Réel N-1",fmt:"num"}]},
  {t:"chart",type:"line",title:"Comparatif heures d'intérimaire réel vs budget",note:"la feuille trace les masses, pas les heures",dim:"mois",measures:[{m:"Masse Budget Intérim Réel"},{m:"Masse intérim Réel",label:"Masse intérim réel"}],span:6},
 ]},
 {id:"activites",title:"Activités",objs:[
  {t:"kb",title:"Chiffre d'affaires",span:6,items:[{m:"CA Réel"},{m:"CA parc",label:"CA parc"},{m:"CA Affrètement"},{m:"CA Logistique"}]},
  {t:"agrid",title:"CA, coût et résultat",span:6},
  {t:"chart",type:"bar",title:"Comparatif CA / heure travaillée réel vs budget",dim:"mois",fmt:"num",measures:[{m:"CA / Heure travaillée Année",label:"Réel"},{m:"CA Budget / Heure travaillée Année",label:"Budget"}],span:12},
 ]},
 {id:"couts",title:"Coûts d'exploitation",objs:[
  {t:"stack",span:3,items:[{m:"CA Réel",label:"Chiffre d'affaires"},{m:"CA par jour travaillé"},{m:"KM Réel",label:"Nb de km parcourus",fmt:"km"}]},
  {t:"stack",span:3,items:[{m:"Nb jours ouvrables",fmt:"num"},{m:"KM / Moteur",fmt:"km"},{m:"Taux de frais d'entretien",fmt:"pct"},{m:"Taux de frais de personnel",fmt:"pct"}]},
  {t:"costdonut",title:"Décomposition du coût d'exploitation des camions",span:6},
  {t:"costtable",title:"Charges par type de coût",span:6},
  {t:"chart",type:"bar",title:"Chiffre d'affaires / coûts par immatriculation",dim:"veh",top:15,rot:true,measures:[{m:"CA Réel",label:"CA"},{m:"Charges réelles",label:"Charges"}],span:6},
 ]},
];
/* chiffre clé (vue adhérent) : le CA de la période, comparé, puis trois indicateurs et ce qui reste à faire */
const MOIS_L=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
function nv(name){ const m=dm(name), s=m&&COVD().get(m.id)?.s; if(s!=="ok"&&s!=="part") return null; const r=dv(name); return !r.err&&typeof r.v==="number"&&isFinite(r.v)?r.v:null; }
function delta(a,b,hausseBonne=true){ if(a==null||b==null||!b) return `<span class="delta nd">non comparable</span>`;
  const d=(a-b)/Math.abs(b), nul=Math.abs(d)<0.0005, cls=nul?"neutre":(d>0)===hausseBonne?"bon":"mauvais";
  return `<span class="delta ${cls}">${nul?"=":d>0?"▲":"▼"} ${d>0?"+":d<0?"−":""}${fmtN(Math.abs(d)*100,1)} %</span>`; }
function heroAdh(){
  const p=S.prev, ca=nv("CA Réel"); if(ca==null) return "";
  const mo=p.mois?MOIS_L[p.mois-1]:"", per=p.mois?`${/^[aeiou]/.test(mo)?"d'":"de "}${mo} ${p.annee}`:String(p.annee);
  const comp=[["Budget",nv("Budget")],p.mois?[`${MOIS_L[(p.mois+10)%12]} ${p.mois===1?p.annee-1:p.annee}`,nv("CA Réel M-1")]:null,[`${mo?mo+" ":""}${p.annee-1}`,nv("CA Réel N-1")]].filter(Boolean);
  const eur=v=>v==null?"Non disponible":fmtN(v,0)+" €", pc=v=>v==null||!ca?"":`${fmtN(v/ca*100,1)} % du chiffre d'affaires`;
  const res=nv("Résultat Avec Exceptionnel Réel"), mas=nv("Masse réel"), km=nv("KM Réel");
  const ind=(l,v,txt,sous)=>v==null?`<li class="attente"><span class="il">${l}</span><span class="iv">En attente</span><span class="is">Se complétera au fil de vos réponses.</span></li>`:`<li><span class="il">${l}</span><span class="iv">${txt}</span><span class="is">${sous}</span></li>`;
  const c=measureCounts(), tot=c.ok+c.part+c.none+c.err, nq=listeQuestions().filter(q=>q.statut==="ouverte").length;
  return `<div class="dh-hero"><section class="dh-cle" aria-labelledby="dh-ca"><h3 id="dh-ca">Chiffre d'affaires ${per}${p.site?` · ${esc(p.site==="∅"?"Sans filiale":p.site)}`:""}</h3><p class="dh-v">${eur(ca)}</p>
    <dl class="dh-comp">${comp.map(([l,v])=>`<div><dt>${esc(l)}</dt><dd><span class="cv">${eur(v)}</span>${delta(ca,v)}</dd></div>`).join("")}</dl></section>
    <ul class="dh-indics" aria-label="Autres indicateurs">${ind("Résultat",res,eur(res),pc(res))}${ind("Masse salariale",mas,eur(mas),pc(mas))}${ind("Kilomètres parcourus",km,km==null?"":fmtN(km,0)+" km","")}</ul></div>
   ${nq?`<div class="dh-reste"><p><b>${c.ok} indicateurs sur ${tot}</b> sont prêts. ${nq} question${nq>1?"s restent ouvertes":" reste ouverte"} : chaque réponse complète votre tableau de bord.</p><button class="btn primary" type="button" data-dh-q>Répondre</button></div>`:""}`; }
function renderPrev(){
  EVC=new Map(); KN=new Map(); const {ys}=prevSel(); const fa=buildFaits(), dims=buildDims(); const p=S.prev;
  const hors=horsDe(DCAT()), feuilles=filtrerFeuilles([...SHEETS,...feuillesAdherent()],n=>{ const m=dm(n); return hors.has(m?m.name:n); });
  if(!feuilles.length){ $("#prevv").innerHTML='<h2>Dashboard</h2><p class="lede">Aucun indicateur applicable à cet adhérent pour l\'instant.</p>'; return; }
  if(!p.sheet) p.sheet="accueil"; const sh=feuilles.find(s=>s.id===p.sheet)||feuilles[0];
  const sites=[...new Set(fa.rows.map(r=>r.site||"∅"))].sort(); const vehs=[...new Set(fa.rows.map(r=>r.veh).filter(Boolean))].sort(); const chs=[...new Set(fa.rows.map(r=>r.chauf).filter(Boolean))].sort();
  const R={kb:oKB,stack:oStack,chart:oChart,table:oTable,pivot:oPivot,pie:oPieDim,gauge:oGauge,agrid:oAGrid,costdonut:oCostDonut,costtable:oCostTable};
  const lede=S.vue?.role==="adherent"?"Votre tableau de bord, calculé sur vos propres données. Les indicateurs « En attente » se rempliront au fil de vos réponses.":"Les feuilles de l'app démo, recalculées avec les expressions du catalogue sur les lignes FAITS de la séance. Survole une valeur pour voir la mesure utilisée. Les indicateurs marqués « reconstituée » ne sont pas dans les éléments principaux : leur formule est déduite de la capture.";
  const adh=S.vue?.role==="adherent";
  $("#prevv").innerHTML=`<h2>${adh?"Votre tableau de bord":"Dashboard"}</h2><p class="lede">${lede}</p>
  <div class="sheetbar">${feuilles.map(s=>`<button data-sh="${s.id}" aria-pressed="${s.id===sh.id}">${esc(s.title)}</button>`).join("")}</div>
  <div class="filters">
    <label>Filiale<select class="inp" id="pv-s"><option value="">Toutes</option>${sites.map(s=>`<option value="${esc(s)}" ${p.site===s?"selected":""}>${esc(s==="∅"?"Sans filiale":s)}</option>`).join("")}</select></label>
    <label>Année<select class="inp" id="pv-a">${ys.map(y=>`<option ${y===p.annee?"selected":""}>${y}</option>`).join("")}</select></label>
    <label>Mois<select class="inp" id="pv-m"><option value="">Aucun (année entière)</option>${MOIS.map((m,i)=>`<option value="${i+1}" ${p.mois===i+1?"selected":""}>${m}</option>`).join("")}</select></label>
    <label>Immatriculation<select class="inp" id="pv-v"><option value="">Toutes</option>${vehs.map(v=>`<option value="${esc(v)}" ${p.veh===v?"selected":""}>${esc(dims.veh.get(v)?.NUM_IMAT||v)}</option>`).join("")}</select></label>
    <label>Chauffeur<select class="inp" id="pv-c"><option value="">Tous</option>${chs.map(v=>`<option value="${esc(v)}" ${p.chauf===v?"selected":""}>${esc(dims.chauf.get(v)?.LIB_CHAUFFEUR||v)}</option>`).join("")}</select></label>
  </div>
  ${sh.id==="general"?'<p class="note" style="margin:0 0 10px">Les boutons « Sélection activité » (Général, Parc, Affrètement, Logistique) ne sont pas reproduits : leur action de sélection n\'est pas visible sur la capture.</p>':""}
  ${adh&&sh.id==="accueil"?heroAdh():""}
  <div class="dash">${sh.objs.filter(o=>!(adh&&sh.id==="accueil"&&o.t==="kb"&&o.title==="Chiffre d'affaires"&&nv("CA Réel")!=null)).map(o=>R[o.t](o)).join("")}</div>`;
  $("#prevv").querySelector("[data-dh-q]")?.addEventListener("click",()=>setTab("q"));
  $("#prevv").querySelectorAll("[data-sh]").forEach(b=>b.onclick=()=>{ p.sheet=b.dataset.sh; renderPrev(); });
  $("#pv-s").onchange=e=>{ p.site=e.target.value; renderPrev(); };
  $("#pv-a").onchange=e=>{ p.annee=+e.target.value; renderPrev(); };
  $("#pv-m").onchange=e=>{ p.mois=e.target.value?+e.target.value:null; renderPrev(); };
  $("#pv-v").onchange=e=>{ p.veh=e.target.value; renderPrev(); };
  $("#pv-c").onchange=e=>{ p.chauf=e.target.value; renderPrev(); };
  suiviTuiles();
}
let KN=new Map();
function tuilesChangees(avant, apres){ return [...apres.keys()].filter(k=>avant.has(k)&&avant.get(k)!==apres.get(k)); }
function fusionFlash(ancien, changees, maintenant){ const a=ancien&&maintenant-ancien.t<60000?ancien:null; return changees.length?{cles:new Set([...(a?a.cles:[]),...changees]),t:a?a.t:maintenant}:a; }
function suiviTuiles(){
  const p=S.prev, sig=[p.sheet,p.annee,p.mois,p.site,p.veh,p.chauf].join("|");
  const now=new Map(); document.querySelectorAll("#prevv [data-k]").forEach(el=>now.set(el.dataset.k,el.querySelector(".v")?.textContent||""));
  if(S.tuiles&&S.tuiles.sig===sig){ const ch=tuilesChangees(S.tuiles.v,now); S.flashTuiles=fusionFlash(S.flashTuiles,ch,Date.now()); }
  S.tuiles={sig,v:now}; S.flashTuiles=fusionFlash(S.flashTuiles,[],Date.now());
  if(S.flashTuiles&&S.tab==="prev"){ document.querySelectorAll("#prevv [data-k]").forEach(el=>{ if(S.flashTuiles.cles.has(el.dataset.k)){ el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } }); S.flashTuiles=null; }
}
