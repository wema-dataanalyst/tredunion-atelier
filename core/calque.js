/* ───────────── calque des réponses : le registre appliqué sur la spec ───────────── */
const OPS_REPONSE=["valider","codes","exclure","definir","fichier","noter","question","mesure","classer","kpi"];
const DEFINIR={flux:["valeur","unite","champ","filtre"],colonne:["format","decimalComma","role"]};
const TYPES_REPONSE=["confirmer","codes","choix","exclure","fichier","libre"];
function porteurHypothese(st,cible){
  cible=String(cible||""); let m=/^flux:([^#]+)(?:#(.+))?$/.exec(cible);
  if(m){ const fl=st.flux.find(f=>f.id===m[1]); if(!fl) return null; return m[2]==null?fl:(fl.rules||[]).find(r=>String(r.prefix)===m[2])||null; }
  m=/^categorie:(.+)$/.exec(cible); if(m) return (st.categories||[]).find(c=>c.cod===m[1])||null;
  m=/^mesures:(.+)$/.exec(cible); if(m) return (st.propositions||[]).find(p=>String(p.id)===m[1])||null;
  m=/^perimetre:(.+)$/.exec(cible); if(m) return (st.perimetre||[]).find(g=>String(g.id)===m[1])||null;
  m=/^([^.#]+)#regle(\d+)$/.exec(cible);
  if(m){ const d=st.datasets.find(x=>x.id===m[1]); return d&&d.rules[+m[2]-1]||null; }
  m=/^([^.#]+)\.(.+)$/.exec(cible); if(!m) return null;
  const d=st.datasets.find(x=>x.id===m[1]); if(d) return d.columns.find(c=>c.name===m[2])||null;
  const t=st.gold.find(x=>x.id===m[1]&&x.kind==="dim"); return t&&t.columns.find(c=>c.name===m[2])||null;
}
function cibleDefinir(cible){ const c=String(cible||""); let k=/^categorie:(.+)\.(\w+)$/.exec(c); if(k) return {categorie:k[1],champ:k[2]}; let x=/^flux:([^.]+)\.(\w+)$/.exec(c); if(x) return {flux:x[1],champ:x[2]}; x=/^([^.]+\.[^.]+)\.(\w+)$/.exec(c); return x?{ref:x[1],champ:x[2]}:null; }
function modifCibles(st){ const ds=id=>st.datasets.find(x=>x.id===id)||null;
  return {ds,col:ref=>{ const [d,c]=String(ref||"").split("."); const x=ds(d); return x&&x.columns.find(k=>k.name===c)||null; },flux:id=>st.flux.find(f=>f.id===id)||null}; }
/* texte libre : une ligne, sans caractère de contrôle (il finit en commentaire SQL ou Qlik) */
const TEXTE_MAX=300;
function texteInvalide(t){ if(t==null) return null; if(typeof t!=="string") return "doit être un texte";
  if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(t)) return "ne doit contenir ni retour à la ligne ni caractère de contrôle";
  return t.length>TEXTE_MAX?`trop long (${TEXTE_MAX} caractères au plus)`:null; }
/* masquer : sans la valeur saisie, pour les messages de check (elle peut contenir une donnée personnelle) */
function erreurModif(m,st=S.st,masquer=false){
  if(!m||!OPS_REPONSE.includes(m.op)) return `opération inconnue (${OPS_REPONSE.join(", ")})`;
  const bad=texteInvalide(m.text); if(bad) return `text ${bad}`;
  const {ds,col,flux}=modifCibles(st), v=x=>masquer?"":` : ${x}`;
  if(m.op==="valider"){ if(typeof m.valeur!=="boolean") return "valeur doit être true ou false";
    const th=/^theme:(.+)$/.exec(String(m.cible||"")); if(th) return THEMES().some(t=>t.id===th[1])?null:`thème introuvable : ${m.cible}`;
    const p=porteurHypothese(st,m.cible); return p&&p.hypothese?null:`hypothèse introuvable : ${m.cible}`; }
  if(m.op==="codes"){ if(!col(m.cible)) return `colonne introuvable : ${m.cible}`;
    if(!m.valeur||typeof m.valeur!=="object"||Array.isArray(m.valeur)||!Object.keys(m.valeur).length) return "codes : table code → libellé attendue";
    return Object.values(m.valeur).every(v=>typeof v==="string"&&v.trim())?null:"codes : libellé vide"; }
  if(m.op==="exclure"){ if(!ds(m.cible)) return `dataset introuvable : ${m.cible}`; return m.sql&&parseCond(m.sql)?null:`condition non reconnue${v(m.sql)}`; }
  if(m.op==="definir"){ const x=cibleDefinir(m.cible);
    if(x&&x.categorie){ const c=(st.categories||[]).find(k=>k.cod===x.categorie); if(!c) return `catégorie introuvable : ${x.categorie}`; if(x.champ!=="lib") return `champ de catégorie non modifiable : ${x.champ} (lib)`;
      const t=typeof m.valeur==="string"?m.valeur.trim():""; if(!t) return "libellé vide"; if(t.length>60) return "libellé trop long (60 caractères au plus)"; const bad=texteInvalide(m.valeur); return bad?`libellé ${bad}`:null; }
    if(x&&x.flux){ const fl=flux(x.flux); if(!fl) return `flux introuvable : ${x.flux}`; if(!DEFINIR.flux.includes(x.champ)) return `champ de flux non modifiable : ${x.champ} (${DEFINIR.flux.join(", ")})`;
      if(x.champ==="champ"&&!CHAMPS.includes(m.valeur)) return `champ inconnu${v(m.valeur)}`;
      if(x.champ==="unite"&&!UNITES.includes(m.valeur)) return `unité inconnue${v(m.valeur)}`;
      if(x.champ==="valeur"){ const d=ds(fl.ds); if(!d||!compileVal(m.valeur,d)) return `valeur non calculable${v(m.valeur)}`; }
      if(x.champ==="filtre"&&(typeof m.valeur!=="string"||m.valeur!==""&&!parseCond(m.valeur))) return `filtre non reconnu${v(m.valeur)}`;
      return null; }
    if(!x||!col(x.ref)) return `cible introuvable : ${m.cible}`;
    if(!DEFINIR.colonne.includes(x.champ)) return `champ de colonne non modifiable : ${x.champ} (${DEFINIR.colonne.join(", ")})`;
    if(x.champ==="role"&&!Object.keys(ROLES).includes(m.valeur)) return `rôle inconnu${v(m.valeur)}`;
    if(x.champ==="decimalComma"&&typeof m.valeur!=="boolean") return "decimalComma : true ou false";
    if(x.champ==="format"&&(typeof m.valeur!=="string"||!/^[A-Za-z0-9 \/:.\-]+$/.test(m.valeur))) return `format non reconnu${v(m.valeur)}`;
    return null; }
  if(m.op==="question"){ const d=ds(m.cible); if(!d) return `dataset introuvable : ${m.cible}`; const q=m.valeur, t=q&&typeof q.text==="string"?q.text.trim():"";
    for(const k of ["titre","contexte"]){ const e=q&&texteInvalide(q[k]); if(e) return `question : ${k} ${e}`; }
    if(t.length<5||t.length>300||/[\r\n]/.test(t)) return "question : texte de 5 à 300 caractères sur une ligne attendu";
    if(d.questions.some(x=>x.text===t)) return null;
    const ty=q.reponse_type==null?"libre":q.reponse_type; if(!TYPES_REPONSE.includes(ty)) return `question : type de réponse inconnu (${TYPES_REPONSE.join(", ")})`;
    if(ty==="choix"&&(typeof q.reponse_cible!=="string"||!Array.isArray(q.options)||!q.options.length)) return "question : choix exige reponse_cible et options";
    if(ty==="exclure"&&!(typeof q.sql==="string"&&parseCond(q.sql))) return `question : condition non reconnue${v(q.sql)}`;
    return d.questions.filter(x=>x.suivi&&!x.done).length>=3?"question : 3 questions de suivi ouvertes au plus par dataset":null; }
  if(m.op==="mesure"){ if(typeof m.cible!=="string"||!/^[a-z0-9_]+$/.test(m.cible)) return "mesure : id de proposition invalide";
    if(!m.valeur||typeof m.valeur!=="object"||Array.isArray(m.valeur)) return "mesure : proposition attendue";
    const e=erreursProposition({...m.valeur,id:m.cible},st); return e.length?`proposition : ${e[0]}`:null; }
  if(m.op==="fichier") return ["traiter","ignorer"].includes(m.valeur)?null:"valeur traiter ou ignorer attendue";
  return null;
}
function erreursModifs(modifs){
  if(!Array.isArray(modifs)||!modifs.length) return ["aucune modification"];
  const nouvelles={};
  return modifs.map((m,i)=>{ let e=erreurModif(m);
    if(!e&&m.op==="question"){ const d=S.st.datasets.find(x=>x.id===m.cible), t=m.valeur.text.trim(); if(!d.questions.some(x=>x.text===t)){ nouvelles[m.cible]=(nouvelles[m.cible]||0)+1; if(d.questions.filter(x=>x.suivi&&!x.done).length+nouvelles[m.cible]>3) e="question : 3 questions de suivi ouvertes au plus par dataset"; } }
    return e?`modification ${i+1} (${m&&m.op||"?"}) : ${e}`:null; }).filter(Boolean);
}
function appliquerModif(st,m,entree){
  const e=erreurModif(m,st,true); if(e) return e; const {ds,col,flux}=modifCibles(st);
  if(m.op==="valider"&&String(m.cible).startsWith("theme:")){ const id=String(m.cible).slice(6);
    st.besoins.themes=st.besoins.themes.filter(t=>t.id!==id).concat([{id,choisi:m.valeur}]); st._themesRegistre.push(id); return null; }
  if(m.op==="valider") Object.assign(porteurHypothese(st,m.cible).hypothese,{valide:m.valeur,refuse:!m.valeur,reponse:String(entree.reponse||"")});
  if(m.op==="codes") col(m.cible).codes=Object.assign({},m.valeur);
  if(m.op==="exclure") ds(m.cible).rules.push({text:String(m.text||entree.reponse||""),sql:String(m.sql)});
  if(m.op==="definir"){ const x=cibleDefinir(m.cible); if(x.categorie) st.categories.find(k=>k.cod===x.categorie).lib=String(m.valeur).trim(); else (x.flux?flux(x.flux):col(x.ref))[x.champ]=m.valeur; }
  if(m.op==="question"){ const d=ds(m.cible), q=m.valeur, t=q.text.trim();
    if(!d.questions.some(x=>x.text===t)){ const n=Math.max(0,...d.questions.map(x=>+String(x.id).replace(/\D/g,"")||0))+1, o={id:`q${n}`,text:t};
      ["reponse_type","titre","contexte","reponse_cible","options","sql"].forEach(k=>{ if(q[k]!=null) o[k]=q[k]; }); d.questions.push(Object.assign(o,{done:false,suivi:true})); } }
  if(m.op==="mesure"){ const p={...JSON.parse(JSON.stringify(m.valeur)),id:m.cible,hypothese:{source:"client",preuves:[String(entree.reponse||"")].filter(Boolean),question:String(m.valeur.titre||""),valide:true,refuse:false}};
    st.propositions=(st.propositions||[]).filter(x=>x.id!==m.cible).concat([p]); }
  if(m.op==="kpi"){
    const q=typeof KPI_QUESTIONS!=="undefined"?KPI_QUESTIONS.find(x=>x.id===m.cible):null;
    if(q&&typeof q.propositions==="function"){
      const props=q.propositions(m.valeur);
      if(Array.isArray(props)){
        st.propositions=st.propositions||[];
        props.forEach(p=>{ if(!st.propositions.some(x=>x.id===p.id)) st.propositions.push(p); });
      }
    }
    return;
  }
  if(m.op==="classer"){
    const matchRules=/^flux:(\w+)\.rules\[(\d+)\]$/.exec(m.cible);
    if(matchRules){ const fl=st.flux.find(f=>f.id===matchRules[1]); if(fl&&fl.rules&&fl.rules[matchRules[2]]){ fl.rules[matchRules[2]].cod=m.valeur.cod; fl.rules[matchRules[2]].lib=m.valeur.lib; } return; }
    const matchFixe=/^flux:(\w+)$/.exec(m.cible);
    if(matchFixe){ const fl=st.flux.find(f=>f.id===matchFixe[1]); if(fl&&fl.codMode==="fixe"){ fl.cod=m.valeur.cod; fl.lib=m.valeur.lib; } }
    return;
  }
  return null;
}
/* appliquerCalque n'est pas idempotente (exclure ajoute une règle) : une seule application sur un état neuf */
function appliquerCalque(st){
  st._orphelines=[]; st._themesRegistre=[]; st.besoins=st.besoins||{themes:[],libres:[]}; if(!Array.isArray(st.reponses)) return st;
  const dernieres=new Map(), texte=x=>typeof x==="string"?x:""; st.reponses.forEach(r=>{ if(idScalaire(r)){ const id=String(r.id); dernieres.delete(id); dernieres.set(id,r); } });
  dernieres.forEach((r,id)=>(Array.isArray(r.modifs)?r.modifs:[]).forEach(m=>{ let e; try{ e=appliquerModif(st,m,r); }catch(x){ e="modification illisible"; } if(e) st._orphelines.push({id,op:texte(m&&m.op),cible:texte(m&&m.cible),msg:e}); }));
  return st;
}
function idScalaire(r){ return !!r&&(typeof r.id==="string"||typeof r.id==="number"); }
function entreeReponse(id,saisie,par,date){
  if(!Array.isArray(S.st.reponses)) return {erreurs:["registre spec/reponses.yml illisible"]};
  const q=listeQuestions().find(x=>x.id===id&&x.source!=="registre"); if(!q) return {erreurs:[`question introuvable : ${id}`]};
  if(/^\(texte masqué/.test(q.question)) return {erreurs:["question à reformuler par WeMa (donnée personnelle)"]};
  const s=saisie||{}, f=q.formulaire, txt=x=>String(x??"").trim(), type=s.autre||s.interpretation?"libre":q.type; let reponse="", modifs, interprete="";
  if(type==="confirmer"){ if(typeof s.oui!=="boolean") return {erreurs:["réponse oui ou non attendue"]};
    reponse=(s.oui?"Oui":"Non")+(txt(s.precision)?". "+txt(s.precision):""); modifs=[{op:"valider",cible:f.cible,valeur:s.oui}]; }
  else if(type==="codes"){ const codes={}; Object.entries(s.codes||{}).forEach(([k,v])=>{ if(txt(v)) codes[k]=txt(v); }); const exclus=(s.exclus||[]).map(String), [ds,col]=f.cible.split(".");
    reponse=Object.entries(codes).map(([k,v])=>`${k} ${v}`).join(", ")+(exclus.length?` ; à exclure : ${exclus.join(", ")}`:"");
    modifs=[{op:"codes",cible:f.cible,valeur:codes}]; if(exclus.length) modifs.push({op:"exclure",cible:ds,sql:`${col} not in (${exclus.map(sq).join(", ")})`,text:`Exclure ${col} ${exclus.join(", ")}`}); }
  else if(type==="choix"){ const o=Number.isInteger(s.option)&&f.options[s.option]; if(!o) return {erreurs:["choisir une option"]}; reponse=o.libelle; modifs=[{op:"definir",cible:f.cible,valeur:o.valeur}]; }
  else if(type==="exclure"){ if(typeof s.exclure!=="boolean") return {erreurs:["exclure ou garder attendu"]};
    reponse=s.exclure?"Exclure ces lignes":"Garder ces lignes"; modifs=[s.exclure?{op:"exclure",cible:f.cible,sql:f.sql,text:q.question}:{op:"noter"}]; }
  else if(type==="fichier"){ if(!["traiter","ignorer"].includes(s.valeur)) return {erreurs:["traiter ou ignorer attendu"]}; reponse=s.valeur==="traiter"?"À traiter":"À ignorer"; modifs=[{op:"fichier",cible:q.id,valeur:s.valeur}]; }
  else if(s.interpretation){ const it=s.interpretation, ops=it&&it.operations;
    reponse=txt(it&&it.texte); if(!reponse) return {erreurs:["réponse vide"]};
    if(!Array.isArray(ops)||!ops.length||ops.length>10) return {erreurs:["1 à 10 opérations attendues"]};
    modifs=ops.map(o=>(o&&typeof o==="object"?{...o}:o)); interprete=txt(it.comprehension).slice(0,500); }
  else { reponse=txt(s.texte); if(!reponse) return {erreurs:["réponse vide"]}; modifs=[{op:"noter"}]; }
  const erreurs=erreursModifs(modifs); if(erreurs.length) return {erreurs};
  const e={id:q.id,question:q.question,reponse,origine:"client",date:String(date),modifs}; if(txt(par)) e.par=txt(par);
  if(interprete) e.interprete=interprete;
  /* id provisoire : seule la nouvelle entrée est testée, pas les anciennes réponses à la même question */
  S.st.reponses.push({...e,id:"\u0000nouvelle"}); S.ver++; let fuite; try{ fuite=piiFuites().some(x=>x.cible==="reponse:\u0000nouvelle"); } finally{ S.st.reponses.pop(); S.ver++; }
  return fuite?{erreurs:["la réponse cite une donnée personnelle (nom, carte…) : reformulez sans la citer, indiquez un service plutôt qu'un nom"]}:{entree:e};
}
