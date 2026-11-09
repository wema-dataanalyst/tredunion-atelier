/* ───────────── questions de séance : liste unique, réponses greffées ───────────── */
const SRC_RANG={projet:-1,hypothese:0,besoins:0.5,kpi:0.6,controle:1,profil:2,hors_recette:3,non_lu:4,registre:5};
const TYPE_DEFAUT={hypothese:"confirmer",non_lu:"fichier"};
function lotDe(dsId){ return String(dsId||"").split("_")[0]||"divers"; }
function datasetDe(c){ c=String(c||""); if(c.startsWith("flux:")){ const fl=FX(c.slice(5).split("#")[0]); return fl?fl.ds:null; }
  if(/^(DIM_|controle:|perimetre:|categorie:|mesures:)/.test(c)) return null; return c.split(/[.#]/)[0]||null; }
function impactsMesures(){ return cached("impm",()=>{ const m=new Map(); CAT().list.forEach(x=>ciblesMesure(x).forEach(c=>{ if(!m.has(c)) m.set(c,new Set()); m.get(c).add(x.name); })); return m; }); }
function mesuresDe(elements){ const im=impactsMesures(), out=new Set();
  (elements||[]).filter(Boolean).forEach(e=>im.forEach((ms,c)=>{ if(c===e||(!/[.#:]/.test(e)&&(c.startsWith(e+".")||c.startsWith(e+"#")))) ms.forEach(n=>out.add(n)); }));
  return [...out]; }
function apercuDe(element){ const ci=/^[^.#:]+\.[^.#]+$/.test(String(element||""))?colIndex(element):null; const p=ci&&ci.ds._prof[ci.col.name]; if(!p||!p.n) return "";
  return `${p.distinct} valeur${p.distinct>1?"s":""} distincte${p.distinct>1?"s":""} · ${Math.round(p.nulls/p.n*100)} % vides`+(ci.col.pii?"":` · fréquentes : ${p.top.slice(0,5).map(([v,n])=>`${v} (${n})`).join(", ")}`); }
/* libellé probable d'un code : lu dans une autre colonne du même fichier qui ne donne qu'une seule valeur par code */
function suggestionsCodes(ci){ const {ds,i}=ci; let best=null;
  ds.columns.forEach((c,j)=>{ const p=ds._prof[c.name]||{}; if(j===i||c.pii||p.guess!=="text"||p.unique) return; const m=new Map();
    ds.rows.forEach(r=>{ const k=String(r[i]??"").trim(), v=String(r[j]??"").trim(); if(!k||!v) return; if(!m.has(k)) m.set(k,new Set()); m.get(k).add(v); });
    const un=new Map([...m].filter(([k,s])=>s.size===1&&[...s][0]!==k).map(([k,s])=>[k,[...s][0]]));
    if(un.size&&(!best||un.size>best.m.size)) best={m:un,col:c.name}; });
  return best; }
const nomFichier=id=>{ const s=String(id||"").replace(/_/g," ").trim(); return s.charAt(0).toUpperCase()+s.slice(1); };
/* la question de profil, reformulée pour un exploitant ; f.titre / f.contexte (écrits par la maquette) l'emportent */
function titreClair(q,f,fo){ if(f.titre) return {titre:String(f.titre),intro:String(f.contexte||"")};
  if(q.source!=="profil") return {titre:"",intro:String(f.contexte||"")};
  const [dsId,col]=String(q.element||"").split("."), t=String(q.question||""), fic=`votre fichier « ${nomFichier(dsId)} »`, intro=col?`Dans ${fic}, colonne « ${col} »`:"";
  let m;
  if(/Que signifie chacune/.test(t)) return {titre:fo.valeurs.length?`Que représente chacune de ces ${fo.valeurs.length} valeurs ?`:"Que représentent ces valeurs ?",intro:intro+"."};
  if((m=/(\d+) % de valeurs vides/.exec(t))) return {titre:`${m[1]} % des lignes n'ont rien dans cette colonne. Est-ce normal ?`,intro:intro+"."};
  if(/date en texte/.test(t)) return {titre:"Ces dates sont-elles des dates réelles ou des dates prévues ?",intro:intro+"."};
  if(/virgule décimale/.test(t)) return {titre:"Ces montants sont-ils hors taxes ou toutes taxes comprises ?",intro:intro+"."};
  if(/majuscules et minuscules/.test(t)) return {titre:"Les références écrites en majuscules et en minuscules désignent-elles la même chose ?",intro:intro+"."};
  return {titre:"",intro:""}; }
function formulaireDe(type,f,element){
  const fo={cible:String(f.reponse_cible||""),options:(Array.isArray(f.options)?f.options:[]).map(o=>({libelle:String(o&&o.libelle||""),valeur:o&&o.valeur})),sql:String(f.sql||""),valeurs:[]};
  if(!fo.cible) fo.cible=type==="exclure"?String(element||"").split(/[.#]/)[0]:String(element||"");
  const ci=type==="codes"?colIndex(fo.cible):null;
  if(ci&&!ci.col.pii){ const n=new Map(), codes=ci.col.codes||{}; ci.ds.rows.forEach(r=>{ const v=String(r[ci.i]??"").trim(); if(v) n.set(v,(n.get(v)||0)+1); });
    const sug=suggestionsCodes(ci), top=[...n].sort((a,b)=>b[1]-a[1]).slice(0,60), vus=new Set(top.map(x=>x[0]));
    fo.valeurs=[...top,...Object.keys(codes).filter(k=>!vus.has(k)).map(k=>[k,n.get(k)||0])].map(([code,n])=>({code,n,libelle:Object.hasOwn(codes,code)?String(codes[code]):"",suggestion:sug&&sug.m.get(code)||""})); if(sug) fo.suggestionDe=sug.col; }
  return fo;
}
function listeQuestions(){ return cached("questions",()=>{
  const reg=(Array.isArray(S.st.reponses)?S.st.reponses:[]).filter(idScalaire), greffees=new Set(), out=[];
  const fuites=new Set(piiFuites().map(x=>x.cible)), MR="(réponse masquée : contient une donnée personnelle)", MQ=f=>`(texte masqué : contient une donnée personnelle, à reformuler dans ${f})`;
  const orph=new Set((S.st._orphelines||[]).map(o=>o.id));
  const add=q=>{ const t=String(q.question||"").trim(), memes=reg.filter(r=>String(r.id)===q.id&&(q.source==="controle"||r.question==null||String(r.question).trim()===t)), r=memes[memes.length-1]; memes.forEach(x=>greffees.add(x));
    const fq=fuites.has(q.id), fr=fuites.has("reponse:"+q.id), f=q.form||{}, type=TYPES_REPONSE.includes(f.reponse_type)?f.reponse_type:TYPE_DEFAUT[q.source]||"libre";
    const fo=formulaireDe(type,f,q.element), tc=titreClair(q,f,fo);
    out.push({id:q.id,source:q.source,titre:fq?"":tc.titre,intro:fq?"":tc.intro,lot:q.lot,element:q.element,elements:q.elements,fichier:q.fichier,question:fq?MQ(q.fichier):String(q.question||""),
    statut:q.traitee||r?"traitee":"ouverte",reponse:fq||fr?MR:String((r&&r.reponse)||q.reponse||""),date:String((r&&r.date)||""),effet:fr?MR:String((r&&r.effet)||""),par:fr?"":String((r&&r.par)||""),
    historique:memes.slice(0,-1).reverse().map(x=>({reponse:fr?MR:String(x.reponse||""),date:String(x.date||""),par:fr?"":String(x.par||"")})),
    orpheline:orph.has(q.id),type,formulaire:fo,apercu:apercuDe(q.element),mesures:mesuresDe(q.elements)}); };
  (S.st.questions||[]).forEach(q=>add({id:`projet#${q.id}`,source:"projet",lot:"adherent",element:"",elements:[],fichier:"spec/projet.yml",question:q.text,traitee:!!q.done,reponse:q.answer,form:q}));
  S.st.datasets.forEach(d=>d.questions.forEach(q=>{ const col=d.columns.find(c=>String(q.text||"").startsWith(c.name+" :")); const el=col?`${d.id}.${col.name}`:d.id;
    add({id:`${d.id}#${q.id}`,source:"profil",lot:lotDe(d.id),element:el,elements:[el],fichier:`spec/datasets/${d.id}.yml`,question:q.text,traitee:!!q.done,reponse:q.answer,form:q}); }));
  listeHypotheses().filter(h=>h.valide||h.refuse||h.confiance!=="haute").forEach(h=>{ const ds=datasetDe(h.cible);
    add({id:h.cible,source:"hypothese",lot:h.cible.startsWith("perimetre:")||h.cible.startsWith("mesures:")?"adherent":h.cible.startsWith("categorie:")?"categories":ds?lotDe(ds):"dimensions",element:h.cible,elements:[h.cible],fichier:h.fichier,question:h.question||h.libelle,traitee:h.valide||h.refuse,reponse:h.reponse,form:h.form,titre:h.form&&h.form.titre||""}); });
  // Lot besoins : une question par thème non tranché (après les hypothèses, avant les contrôles)
  const besoins = S.st.besoins || { themes: [], libres: [] };
  const themesTraites = new Set(besoins.themes.map(t => t.id));
  THEMES().forEach(t => {
    if (!themesTraites.has(t.id)) {
      add({id:`theme:${t.id}`,source:"besoins",lot:"besoins",element:`theme:${t.id}`,elements:t.mesures.map(m=>`mesure:${m}`),fichier:"spec/besoins.yml",
        question:`Voulez-vous suivre les indicateurs « ${t.title} » ?`,traitee:false,form:{titre:`Voulez-vous suivre les indicateurs « ${t.title} » ?`,contexte:`${t.mesures.length} mesures : ${t.mesures.slice(0,5).join(", ")}${t.mesures.length>5?"…":""}`,reponse_type:"confirmer"}});
    }
  });
  // Lot kpi : questions KPI par thème coché
  questionsKpi().forEach(q => {
    add({id: q.id, source: "kpi", lot: "kpi", element: `theme:${q.theme}`, elements: [],
      fichier: "core/kpi.js", question: q.titre, traitee: false,
      form: { titre: q.titre, contexte: q.contexte, reponse_type: "libre" }});
  });
  CTRL().forEach(r=>{ const c=(S.st.controles||[]).find(x=>String(x.id)===r.id)||{}; if(r.statut==="ok"&&!c.reponse) return;
    const ds=c.ds||(c.a&&c.a.ds)||(c.from&&String(c.from).split(".")[0])||r.porte_sur.map(datasetDe).find(Boolean);
    add({id:`controle:${r.id}`,source:"controle",lot:ds?lotDe(ds):"divers",element:`controle:${r.id}`,elements:r.porte_sur,fichier:"spec/controles.yml",question:`${r.libelle} : ${r.msg}`,traitee:!!c.reponse,reponse:c.reponse}); });
  S.st.datasets.filter(d=>d.meta&&d.meta.hors_recette>0).forEach(d=>add({id:`hors_recette:${d.id}`,source:"hors_recette",lot:lotDe(d.id),element:d.id,elements:[d.id],fichier:d.file,
    question:`${d.meta.hors_recette} valeurs hors recette dans ${d.id} : que contiennent ces colonnes, faut-il les lire ?`}));
  (S.st.nonLus||[]).forEach(x=>add({id:`non_lu:${x.fichier}${x.feuille?"#"+x.feuille:""}`,source:"non_lu",lot:"fichiers",element:x.fichier,elements:[],fichier:`data/bronze/${x.societe}/_non_lus.json`,
    question:`Fichier non lu (${x.raison}) : faut-il le traiter ?`}));
  reg.filter(r=>!greffees.has(r)).forEach(r=>{ const id=String(r.id), f=fuites.has("reponse:"+id);
    out.push({id,source:"registre",lot:r.lot||lotDe(datasetDe(r.element||id)),element:String(r.element||""),elements:[],fichier:"spec/reponses.yml",
    question:f?MQ("spec/reponses.yml"):String(r.question||""),statut:"traitee",reponse:f?MR:String(r.reponse||""),date:String(r.date||""),effet:f?MR:String(r.effet||""),par:f?"":String(r.par||""),
    historique:[],orpheline:orph.has(id),type:"",formulaire:null,apercu:"",mesures:[],retiree:true}); });
  const imp=lot=>out.filter(q=>q.lot===lot&&q.statut==="ouverte").reduce((n,q)=>n+q.mesures.length,0);
  const ouvAdh=out.some(q=>q.lot==="adherent"&&q.statut==="ouverte");
  const rangLot=l=>l==="adherent"&&ouvAdh?0:l==="besoins"?0.5:l==="kpi"?0.6:1;
  const lots=[...new Set(out.map(q=>q.lot))].sort((a,b)=>rangLot(a)-rangLot(b)||imp(b)-imp(a)||a.localeCompare(b));
  return out.sort((a,b)=>lots.indexOf(a.lot)-lots.indexOf(b.lot)||(a.statut===b.statut?0:a.statut==="ouverte"?-1:1)
    ||(a.statut==="ouverte"?b.mesures.length-a.mesures.length||SRC_RANG[a.source]-SRC_RANG[b.source]:b.date.localeCompare(a.date))||a.id.localeCompare(b.id));
}); }
function questions(){ return listeQuestions(); }
