/* ───────────── hypothèses : collecte, confiance, dépendances des mesures ───────────── */
const CONF_RANG={confirme:0,haute:1,moyenne:2,basse:3};
const CONF_LIB={confirme:"Confirmé",haute:"Confiance haute",moyenne:"Confiance moyenne",basse:"Confiance basse"};
function entreeMemoire(source){ const m=/^memoire:(logiciels|comptes|colonnes)\/(.+)$/.exec(String(source||"")); if(!m) return null; return ((S.st.memoire||{})[m[1]]||[]).find(e=>String(e.id)===m[2])||null; }
function confianceDe(h){
  if(h.valide) return {confiance:"confirme",conflit:false,raisons:["confirmé par l'adhérent"]};
  const raisons=[]; const deMem=h.source.startsWith("memoire:"); const e=deMem?entreeMemoire(h.source):null;
  if(deMem&&!e) raisons.push(`entrée de mémoire introuvable : ${h.source}`);
  /* vue adhérent : sous 3 adhérents la liste est vide et confirme_peu / contredit_peu vaut true (pas de comptage exact) */
  const chez=(l,peu)=>peu?"moins de 3":new Set(l).size;
  const mem=!!(e&&((e.confirme_chez||[]).length||e.confirme_peu)), contredite=!!(e&&((e.contredit_chez||[]).length||e.contredit_peu));
  if(mem) raisons.push(`mémoire : confirmé chez ${chez(e.confirme_chez,e.confirme_peu)} adhérent(s)`);
  if(contredite) raisons.push(`mémoire : contredit chez ${chez(e.contredit_chez,e.contredit_peu)} adhérent(s)`);
  const ctrls=CTRL().filter(r=>r.porte_sur.includes(h.cible)); ctrls.forEach(r=>raisons.push(`contrôle ${r.id} (${r.statut}) : ${r.msg}`));
  const ok=ctrls.some(r=>r.statut==="ok"), conflit=h.refuse||ctrls.some(r=>r.statut==="ecart");
  if(h.refuse) raisons.push("démenti par l'adhérent");
  let confiance=conflit?"basse":mem&&ok?"haute":mem||ok?"moyenne":"basse";
  if(contredite&&confiance==="haute") confiance="moyenne";
  return {confiance,conflit,raisons};
}
function listeHypotheses(){ return cached("hyp",()=>{
  const out=[]; const push=(cible,fichier,libelle,h)=>{ if(h) out.push({cible,fichier,libelle,question:h.question||"",source:String(h.source||"agent"),preuves:Array.isArray(h.preuves)?h.preuves:[],preuvesListe:h.preuves==null||Array.isArray(h.preuves),valide:!!h.valide,refuse:!!h.refuse,reponse:String(h.reponse||""),form:{reponse_type:String(h.reponse_type||""),reponse_cible:String(h.reponse_cible||""),options:Array.isArray(h.options)?h.options:[],sql:String(h.sql||""),titre:String(h.titre||""),contexte:String(h.contexte||"")}}); };
  S.st.datasets.forEach(d=>{ const f=`spec/datasets/${d.id}.yml`;
    d.columns.forEach(c=>push(`${d.id}.${c.name}`,f,`${d.id}.${c.name} : ${c.desc||"sens à confirmer"}`,c.hypothese));
    d.rules.forEach((r,i)=>push(`${d.id}#regle${i+1}`,f,`${d.id} : ${r.text||r.sql}`,r.hypothese)); });
  S.st.flux.forEach(fl=>{ const f=`spec/flux/${fl.id}.yml`;
    push(`flux:${fl.id}`,f,`${fl.ds} → ${fluxLabel(fl)}`,fl.hypothese);
    (fl.rules||[]).forEach(r=>push(`flux:${fl.id}#${r.prefix}`,f,`${fl.ds} : comptes ${r.prefix}… → ${r.cod}`,r.hypothese)); });
  S.st.gold.filter(t=>t.kind==="dim"&&!t.generated).forEach(t=>t.columns.forEach(c=>push(`${t.id}.${c.name}`,`spec/dims/${t.id}.yml`,`${t.id}.${c.name}`,c.hypothese)));
  (S.st.perimetre||[]).forEach(g=>push(`perimetre:${g.id}`,"spec/perimetre.yml",`Mesures écartées : ${g.cause||g.id}`,g.hypothese&&{...g.hypothese,titre:g.hypothese.titre||g.titre,contexte:g.hypothese.contexte||g.contexte}));
  (S.st.categories||[]).forEach(c=>{ if(c.hypothese) push(`categorie:${c.cod}`,"spec/referentiel.yml",`Libellé de la catégorie ${c.cod} : ${c.lib||c.cod}`,{...c.hypothese,titre:c.hypothese.titre||`Appelez-vous « ${c.cod} » : ${c.lib||c.cod} ?`,contexte:c.hypothese.contexte||""}); });
  (S.st.propositions||[]).forEach(p=>push(`mesures:${p.id}`,"spec/mesures.yml",`Mesures de l'adhérent : ${p.titre||p.id}`,p.hypothese&&{...p.hypothese,titre:p.hypothese.titre||p.titre,contexte:p.hypothese.contexte||p.contexte}));
  out.forEach(h=>Object.assign(h,confianceDe(h)));
  return out;
}); }
function ciblesFlux(fl,cods){
  const t=[`flux:${fl.id}`]; const d=DS(fl.ds);
  if(fl.codMode==="regles") (fl.rules||[]).filter(r=>cods.has(r.cod)).forEach(r=>t.push(`flux:${fl.id}#${r.prefix}`));
  if(d){ const cols=new Set(d.columns.map(c=>c.name));
    const txt=[fl.valeur,fl.date,fl.vehicule,fl.chauffeur,fl.site,fl.client,fl.collaborateur,fl.codCol,fl.libCol,fl.filtre].filter(Boolean).join(" ");
    (txt.match(/\b[a-z_][a-z0-9_]*\b/gi)||[]).forEach(w=>{ const n=w.replace(/_libelle$/,""); if(cols.has(n)) t.push(`${d.id}.${n}`); });
    d.rules.forEach((r,i)=>t.push(`${d.id}#regle${i+1}`)); }
  return t;
}
function couplesMesure(m,seen){
  const out=new Set(); if(!m||seen.has(m.id)) return out; seen.add(m.id); const rows=buildFaits().rows;
  measureNeeds(m).forEach(n=>{ let rs=rows.filter(r=>!n.field||!(n.field in r)||r[n.field]!=null);
    n.filters.forEach(fl=>{ const vs=new Set(fl.vals); const get=r=>fl.f==="%COD_CATEGORIE"?r.cod:r.lib; rs=rs.filter(r=>fl.op==="-="?!vs.has(get(r)):vs.has(get(r))); });
    rs.forEach(r=>out.add(r.flux+"\u0001"+r.cod)); });
  (m.refs||[]).forEach(x=>couplesMesure(CAT().resolve(x),seen).forEach(k=>out.add(k)));
  return out;
}
function ciblesMesure(m){ return cached("cibm:"+m.id,()=>{
  const parFlux=new Map(); couplesMesure(m,new Set()).forEach(k=>{ const [f,c]=k.split("\u0001"); if(!parFlux.has(f)) parFlux.set(f,new Set()); parFlux.get(f).add(c); });
  const cibles=new Set(); parFlux.forEach((cods,fid)=>{ const fl=FX(fid); if(fl) ciblesFlux(fl,cods).forEach(t=>cibles.add(t)); });
  return cibles;
}); }
function hypothesesMesure(m){ return cached("hypm:"+m.id,()=>{ const c=ciblesMesure(m); return listeHypotheses().filter(h=>c.has(h.cible)); }); }
function badgeMesure(m){
  const hs=hypothesesMesure(m); if(!hs.length) return null;
  const pire=hs.reduce((a,h)=>CONF_RANG[h.confiance]>CONF_RANG[a]?h.confiance:a,"confirme");
  return {niveau:pire==="basse"?"rouge":pire==="moyenne"?"orange":"vert",pire,n:hs.length};
}
function ficheSeanceMd(){
  const parCible=new Map(listeHypotheses().filter(h=>h.confiance!=="confirme"&&h.confiance!=="haute").map(h=>[h.cible,{h,mesures:[]}]));
  CAT().list.forEach(m=>hypothesesMesure(m).forEach(h=>{ const x=parCible.get(h.cible); if(x) x.mesures.push(m.name); }));
  const items=[...parCible.values()].sort((a,b)=>b.mesures.length-a.mesures.length||CONF_RANG[b.h.confiance]-CONF_RANG[a.h.confiance]);
  const L=[`# Fiche de séance — ${S.st.adherent}`,"",`${items.length} point${items.length>1?"s":""} à valider avec l'adhérent, du plus impactant au moins impactant.`,""];
  items.forEach((x,i)=>{ const h=x.h;
    L.push(`## ${i+1}. ${h.question||h.libelle}`,"",`- ${CONF_LIB[h.confiance]}${h.conflit?" · sources en désaccord":""} · \`${h.fichier}\` · \`${h.cible}\``,
      `- Mesures concernées (${x.mesures.length}) : ${x.mesures.slice(0,6).join(", ")||"aucune pour l'instant"}${x.mesures.length>6?"…":""}`);
    h.preuves.forEach(p=>L.push(`- Preuve : ${p}`)); h.raisons.forEach(r=>L.push(`- ${r}`)); L.push(""); });
  const nl=S.st.nonLus||[]; if(nl.length){ L.push("## Fichiers non lus",""); nl.forEach(x=>L.push(`- \`${x.fichier}\`${x.feuille?` (feuille ${x.feuille})`:""} : ${x.raison}`)); L.push(""); }
  const hr=S.st.datasets.filter(d=>d.meta&&d.meta.hors_recette>0); if(hr.length){ L.push("## Valeurs hors recette",""); hr.forEach(d=>L.push(`- ${d.id} : ${d.meta.hors_recette} valeurs`)); L.push(""); }
  const ec=CTRL().filter(r=>r.statut!=="ok"); if(ec.length){ L.push("## Contrôles en écart",""); ec.forEach(r=>L.push(`- ${r.id} ${r.libelle} : ${r.msg}`)); L.push(""); }
  return L.join("\n");
}
