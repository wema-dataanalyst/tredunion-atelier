/* ───────────── mesures propres à l'adhérent : propositions de spec/mesures.yml, gabarits fermés ───────────── */
const GABARITS_M=["somme","ratio","ecart"];
const PERIODES_M=["reel","m1","n1","budget"];
const COD_NOUVEAU=/^[A-Z0-9][A-Z0-9 ]{1,18}[A-Z0-9]$/;
const NOM_MESURE=/^[^\[\]{}'"$\n\r]{1,60}$/;
const ID_PROP=/^[a-z0-9_]+$/;
const MAX_MESURES_P=8, MAX_CODES_P=3;
const sansCasse=s=>String(s).trim().toLowerCase();
function nomsMesureGabarit(g){
  if(!g||g.gabarit!=="somme") return [String(g&&g.nom)];
  const ps=Array.isArray(g.periodes)&&g.periodes.length?g.periodes:["reel"];
  return ps.map(k=>k==="m1"?`${g.nom} M-1`:k==="n1"?`${g.nom} N-1`:k==="budget"?`Budget ${g.nom}`:String(g.nom));
}
function nomsProposition(p){ return (p&&Array.isArray(p.mesures)?p.mesures:[]).flatMap(nomsMesureGabarit); }
function nomsBaseCatalogue(st){ return new Set(parseCatalogue(st.catalogue||"").map(m=>sansCasse(m.name))); }
const nomsBase=nomsBaseCatalogue;
function erreursProposition(p,st=S.st){
  const e=[]; if(!p||typeof p!=="object") return ["proposition illisible"];
  if(typeof p.id!=="string"||!ID_PROP.test(p.id)) e.push("id invalide (minuscules, chiffres, _)");
  if(typeof p.titre!=="string"||!p.titre.trim()) e.push("titre manquant");
  const codes=Array.isArray(p.codes)?p.codes:[], mesures=Array.isArray(p.mesures)?p.mesures:[];
  if(!mesures.length) e.push("aucune mesure"); if(mesures.length>MAX_MESURES_P) e.push(`${MAX_MESURES_P} mesures au plus`);
  if(codes.length>MAX_CODES_P) e.push(`${MAX_CODES_P} codes nouveaux au plus`);
  if(p.feuille!==undefined&&(typeof p.feuille!=="string"||!p.feuille.trim()||p.feuille.length>40||/[\n\r]/.test(p.feuille))) e.push("feuille : texte de 1 à 40 caractères sur une ligne");
  const existants=new Set((st.categories||[]).filter(c=>c.ajoute!==p.id).map(c=>c.cod));
  const autres=(st.propositions||[]).filter(x=>x&&x.id!==p.id);
  const codesAutres=new Set(autres.flatMap(x=>(x.codes||[]).map(c=>c&&c.cod)));
  const propres=new Set();
  codes.forEach(c=>{ if(!c||typeof c.cod!=="string"||!COD_NOUVEAU.test(c.cod)) return e.push("code nouveau mal formé (3 à 20 caractères : majuscules, chiffres, espaces)");
    if(existants.has(c.cod)) e.push(`code « ${c.cod} » déjà au référentiel`); if(codesAutres.has(c.cod)) e.push(`code « ${c.cod} » déjà proposé ailleurs`); propres.add(c.cod);
    if(typeof c.lib!=="string"||!c.lib.trim()||c.lib.length>60||/[\n\r]/.test(c.lib)) e.push(`code « ${c.cod} » : libellé de 1 à 60 caractères sur une ligne`); });
  const admis=c=>existants.has(c)||propres.has(c);
  const base=nomsBase(st), pris=new Set([...base]); autres.forEach(x=>nomsProposition(x).forEach(n=>pris.add(sansCasse(n))));
  const propresNoms=new Set(); mesures.forEach(g=>nomsMesureGabarit(g).forEach(n=>propresNoms.add(sansCasse(n))));
  const connue=n=>typeof n==="string"&&(base.has(sansCasse(n))||propresNoms.has(sansCasse(n)));
  const vus=new Set();
  mesures.forEach((g,i)=>{ const ou=`mesure ${i+1}`;
    if(!g||typeof g!=="object"||!GABARITS_M.includes(g.gabarit)) return e.push(`${ou} : gabarit inconnu (${GABARITS_M.join(", ")})`);
    if(typeof g.nom!=="string"||!NOM_MESURE.test(g.nom)) return e.push(`${ou} : nom de 1 à 60 caractères, sans [ ] { } ' " $`);
    nomsMesureGabarit(g).forEach(n=>{ const k=sansCasse(n); if(pris.has(k)) e.push(`${ou} : le nom « ${n} » existe déjà`); if(vus.has(k)) e.push(`${ou} : nom « ${n} » en double`); vus.add(k); });
    if(g.gabarit==="somme"){ const cs=g.categories; if(!Array.isArray(cs)||!cs.length||cs.length>6||!cs.every(c=>typeof c==="string"&&c&&!/['\n\r]/.test(c))) e.push(`${ou} : 1 à 6 catégories attendues`); else cs.filter(c=>!admis(c)).forEach(c=>e.push(`${ou} : catégorie inconnue « ${c} »`));
      if(g.periodes!==undefined&&(!Array.isArray(g.periodes)||!g.periodes.length||!g.periodes.every(k=>PERIODES_M.includes(k)))) e.push(`${ou} : périodes parmi ${PERIODES_M.join(", ")}`); }
    else { const [a,b]=g.gabarit==="ratio"?[g.num,g.den]:[g.a,g.b]; [a,b].forEach(r=>{ if(!connue(r)) e.push(`${ou} : mesure inconnue « ${r} »`); }); } });
  return e;
}
/* trois niveaux (mois sélectionné, année sélectionnée, année max), comme les mesures du catalogue de base */
function formuleTrois(cods,champ,vm,vy,vx){ const f=`{${cods.map(c=>`'${c}'`).join(",")}}`;
  const bloc=(v,cap)=>`        ${cap?"Sum":"sum"}(\n    {<\n        [%COD_CATEGORIE] = ${f},\n        $(${v})\n    >}\n    ${champ})`;
  return `    If(\n        GetSelectedCount(MoisVar) > 0,\n    // Si un mois est sélectionné -> Calculer pour le mois\n${bloc(vm,false)},\n    // Si une année est sélectionnée -> Calculer l'année\n    If(\n        GetSelectedCount(AnneeVar) > 0,\n${bloc(vy,true)},\n    // Sinon afficher l'année max\n${bloc(vx,true)}\n    ))`; }
function mesuresGabarit(g){
  if(g.gabarit==="ratio") return [{nom:g.nom,expr:`    ([${g.num}] / [${g.den}])`}];
  if(g.gabarit==="ecart") return [{nom:g.nom,expr:`    ([${g.a}] - [${g.b}])`}];
  const ps=Array.isArray(g.periodes)&&g.periodes.length?g.periodes:["reel"], f=`{${g.categories.map(c=>`'${c}'`).join(",")}}`;
  return ps.map(k=>k==="m1"?{nom:`${g.nom} M-1`,expr:`    sum({<\t\t\t$(vSET_M-1),    [%COD_CATEGORIE]=${f}>}MontantReel)`}
    :k==="n1"?{nom:`${g.nom} N-1`,expr:formuleTrois(g.categories,"MontantReel","vSET_N-1","vMaxAnneeVar-1","vMaxAnnee-1")}
    :k==="budget"?{nom:`Budget ${g.nom}`,expr:formuleTrois(g.categories,"BudgetNextN","vSET_N-1","vMaxAnneeVar-1","vMaxAnnee-1")}
    :{nom:g.nom,expr:formuleTrois(g.categories,"MontantReel","vSET_M","vMaxAnneeVar","vMaxAnnee")});
}
function texteCatalogue(p){ return (p.mesures||[]).flatMap(mesuresGabarit).map(m=>`${m.nom}\n${m.expr}\n`).join("\n"); }
/* codes des propositions validées : entrés dans les catégories (marqués ajoute:<id>), libellé repris */
function appliquerPropositions(st){
  (st.propositions||[]).filter(p=>p&&p.hypothese&&p.hypothese.valide&&!erreursProposition(p,st).length).forEach(p=>(p.codes||[]).forEach(c=>{
    if(!st.categories.some(x=>x.cod===c.cod)) st.categories.push({cod:c.cod,note:"",lib:c.lib,ajoute:p.id}); }));
  return st;
}
function propositionsActives(){ return (S.st.propositions||[]).filter(p=>p&&p.hypothese&&p.hypothese.valide&&!erreursProposition(p,S.st).length); }
function extensionCatalogue(){ return cached("extcat",()=>{ const t=propositionsActives().map(texteCatalogue).join("\n"); return t?"\n"+t:""; }); }
function nomsMesuresAdherent(){ return new Set(propositionsActives().flatMap(nomsProposition)); }
const FEUILLE_DEFAUT="Mes indicateurs";
function feuillesAdherent(){
  const par=new Map();
  propositionsActives().forEach(p=>{ const t=(p.feuille&&p.feuille.trim())||FEUILLE_DEFAUT; if(!par.has(t)) par.set(t,[]);
    p.mesures.forEach(g=>{ if(g.gabarit==="somme"){ const L={reel:"Réel",m1:"M-1",n1:"N-1",budget:"Budget"}, ps=g.periodes&&g.periodes.length?g.periodes:["reel"], noms=nomsMesureGabarit(g);
        par.get(t).push({t:"kb",title:g.nom,span:6,items:ps.map((k,i)=>({m:noms[i],label:L[k]}))}); }
      else par.get(t).push({t:"stack",span:3,items:[{m:g.nom,...(g.gabarit==="ratio"?{fmt:"pct"}:{})}]}); }); });
  return [...par.entries()].map(([title,objs],i)=>({id:`adh${i+1}`,title,objs}));
}
