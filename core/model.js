"use strict";
/* ───────────── utilitaires ───────────── */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const pad = (n,l=2) => String(n).padStart(l,"0");
const snake = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").replace(/^(\d)/,"c_$1") || "col";
const fmtN = (v,dec) => v==null||isNaN(v) ? "—" : Number(v).toLocaleString("fr-FR",{minimumFractionDigits:dec??0,maximumFractionDigits:dec??(Math.abs(v)<100?2:0)});
const MOIS=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];

const TYPES=["text","int","decimal","date","timestamp","bool"];
const ROLES={attr:"Attribut",key:"Clé (identifiant)",fk:"Référence vers un autre dataset",measure:"Mesure",ignore:"Ignorée"};
const ROLE_TAG={key:"PK",fk:"FK",measure:"Σ",ignore:"×",attr:""};
const KINDS={equal:"Même identifiant",lookup:"Correspondance via table",fuzzy:"Rapprochement approximatif"};
const NORMS={none:"Aucune",trim_upper:"Majuscules, sans espaces autour",alnum_upper:"Lettres et chiffres seulement, majuscules",strip_zeros:"Sans zéros initiaux"};
const UNITES=["€","km","h","L","nb","jours","%"];
const CHAMPS=["MontantReel","BudgetNextN","MontantLoc"];
const AGGS={sum:"Somme",count:"Nombre de lignes",avg:"Moyenne",min:"Minimum",max:"Maximum"};
const CODES_REF="AFFR|AMORT|ASS|ASS ST|AUTRES|CA AFF|CA LOG|CA PARTIEL|CA POLE|CA TOTAL|CA TPS|CA TPS TOT|CH EXEP|DISTANCE|DIV|Egal|ENERGIE|ENT|ENTR|ENTRE|ENTRETIEN|ESSENCE|FOUR|FRAIS|FRAIS FI|FRAIS PASS|GAZ|GO|INFO|JOUR|LOC|LOCATION|MASSE|PEAGE|PNEU|PR EXEP|SALAIRE|ST AFF|ST POLE|ST TPS|ST TPS TOT|STRUCT|SYNTHESE|TAXE|TAXE ESS|TAXE FON|TAXE PRO|TEL|TEL+INFO|TICPE".split("|");
const FAITS_FIELDS=[["%KEY_VEHICULE","text","Véhicule (immatriculation normalisée)"],["%LIB_SITE","text","Site"],["%COD_CATEGORIE","text","Code catégorie"],["LIB_Categorie","text","Libellé catégorie"],["LIB_LISIBLE","text","Libellé lisible de la catégorie"],["Mois","int","Mois"],["Annee","int","Année"],["MontantReel","decimal","Montant réel"],["LIB_COLLABORATEUR","text","Collaborateur"],["TYP_UNITE","text","Unité"],["FLG_CATEGORIE","text","Indicateur catégorie"],["LIB_CLIENT","text","Client"],["matricule","text","Matricule chauffeur"],["%Date","date","Mois (1er jour)"],["%KEY_CHAUFFEUR","text","Chauffeur"],["Date","date","Date"],["MontantLoc","decimal","Montant de location"],["BudgetNextN","decimal","Budget de l'année suivante"],["Source_Faits","text","Dataset d'origine"]];

function goldTemplate(){
  const G=(name,type,desc)=>({name,type,desc,map:{}});
  return [
    {id:"DIM_CHAUFFEUR",kind:"dim",desc:"Un chauffeur. Clé reliée à FAITS.%KEY_CHAUFFEUR",x:690,y:40,columns:[G("%KEY_CHAUFFEUR","text","Identifiant unique du chauffeur"),G("matricule","text","Matricule de paie"),G("LIB_CHAUFFEUR","text","Nom et prénom"),G("LIB_SITE","text","Site de rattachement"),G("TYP_CONTRAT","text","CDI, CDD, intérim, mise à disposition"),G("DAT_ENTREE","date","Date d'entrée"),G("DAT_SORTIE","date","Date de sortie")]},
    {id:"DIM_SITE",kind:"dim",desc:"Un site (établissement). Clé reliée à FAITS.%LIB_SITE",x:690,y:330,columns:[G("%LIB_SITE","text","Nom du site"),G("COD_POSTAL","text","Code postal")]},
    {id:"FAITS",kind:"faits",desc:"Table de faits longue : un montant par catégorie, mois, véhicule, site et chauffeur. Alimentée par les flux.",x:960,y:40,columns:FAITS_FIELDS.map(([n,t,d])=>G(n,t,d))},
    {id:"Calendar",kind:"dim",generated:true,desc:"Îlot de sélection (non relié) : DateVar, AnneeVar, MoisVar",x:960,y:560,columns:[G("DateVar","date","Jour"),G("AnneeVar","int","Année"),G("MoisVar","text","Mois")]},
    {id:"DIM_VEHICULE",kind:"dim",desc:"Un véhicule. Clé reliée à FAITS.%KEY_VEHICULE (immatriculation normalisée)",x:1250,y:40,columns:[["%KEY_VEHICULE","text","Immatriculation normalisée (lettres et chiffres, majuscules)"],["NUM_VEHICULE","text","Numéro interne"],["COD_TYPE","text","TR, SR, PL…"],["NUM_IMAT","text","Immatriculation lisible"],["DAT_ENTREE","date","Entrée dans le parc"],["DAT_SORTIE","date","Sortie du parc"],["SOC_LOC","text","Loueur"],["LIB_CHAUFFEUR","text","Chauffeur attitré"],["LIB_ACTIVITE","text","Activité"],["Source","text","Source"],["DAT_MISE_EN_CIRC","date","Mise en circulation (nom tronqué sur la capture)"],["LIB_PROPRIETAIRE","text","Propriétaire"],["LIB_MOTIF_SORTIE","text","Motif de sortie"],["LIB_COMMENTAIRES","text","Commentaires"],["LIB_EXPLOITANT","text","Exploitant"],["LIB_MARQUE","text","Marque"],["LIB_CARROSERIE","text","Carrosserie"],["LIB_DIVERS","text","Divers"],["FLAG_TR","text","1 si tracteur"],["FLAG_SR","text","1 si semi-remorque"]].map(([n,t,d])=>G(n,t,d))},
  ];
}


/* ───────────── état ───────────── */
const S={st:null,sel:null,flows:true,mask:true,tab:"canvas",file:null,ver:0,check:null,
  mesFilter:"all",mesQ:"",prev:{annee:null,mois:null,site:"",veh:"",chauf:"",sheet:null}};
const DS=id=>S.st.datasets.find(d=>d.id===id);
const GT=id=>S.st.gold.find(t=>t.id===id);
const SOC=id=>S.st.societes.find(s=>s.id===id);
const FX=id=>S.st.flux.find(f=>f.id===id);
const socColor=id=>`var(--soc-${(SOC(id)?.color??0)%4})`;
/* l'état vient du serveur (spec YAML + CSV) ; ici on complète et on profile */
function hydrate(st){
  st.datasets.forEach(d=>{ d.rows=d.rows||[]; d.rules=d.rules||[]; d.questions=d.questions||[]; d.cases=d.cases||[]; d.columns=d.columns||[]; d.x=d.x??40; d.y=d.y??40; });
  st.relations=st.relations||[]; st.flux=st.flux||[]; st.categories=st.categories||[]; st.cases=st.cases||[]; st.questions=st.questions||[]; st.perimetre=st.perimetre||[]; st.propositions=st.propositions||[]; st.besoins=st.besoins||{themes:[],libres:[]}; st.log=st.log||[]; st.catalogue=st.catalogue||"";
  st.controles=st.controles||[]; st.memoire=st.memoire||{logiciels:[],comptes:[],colonnes:[]}; st.nonLus=st.nonLus||[]; st.reponses=st.reponses==null?[]:st.reponses;
  appliquerCalque(st);
  appliquerPropositions(st);
  st.datasets.forEach(profile);
  return st;
}
/* ───────────── profilage ───────────── */
const reDateFR=/^\d{2}\/\d{2}\/\d{4}$/, reISO=/^\d{4}-\d{2}-\d{2}$/, reTS=/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/, reInt=/^-?\d+$/, reDec=/^-?\d+[.,]\d+$/;
function profile(d){
  const prof={};
  d.columns.forEach((c,i)=>{
    const vals=d.rows.map(r=>r[i]); const ne=vals.filter(v=>v!==""&&v!=null);
    const set=new Map(); ne.forEach(v=>set.set(v,(set.get(v)||0)+1));
    let guess="text",fmt="",comma=false; const all=re=>ne.length&&ne.every(v=>re.test(String(v)));
    if(all(reInt)) guess="int";
    else if(ne.length&&ne.every(v=>reDec.test(String(v))||reInt.test(String(v)))){ guess="decimal"; comma=ne.some(v=>String(v).includes(",")); }
    else if(all(reDateFR)){ guess="date"; fmt="DD/MM/YYYY"; }
    else if(all(reISO)) guess="date";
    else if(all(reTS)) guess="timestamp";
    const top=[...set.entries()].sort((a,b)=>b[1]-a[1]);
    let min="",max=""; if(guess==="int"||guess==="decimal"){ const n=ne.map(v=>parseFloat(String(v).replace(",","."))); min=Math.min(...n); max=Math.max(...n); }
    const hasLow=ne.some(v=>/[a-z]/.test(v)&&v===String(v).toLowerCase()), hasUp=ne.some(v=>/[A-Z]/.test(v)&&v===String(v).toUpperCase());
    prof[c.name]={n:vals.length,nulls:vals.length-ne.length,distinct:set.size,guess,fmt,comma,top:top.slice(0,8),min,max,
      lowcard:set.size>0&&set.size<=8&&ne.length>set.size*2, unique:set.size===ne.length&&ne.length>0, mixedCase:guess==="text"&&hasLow&&hasUp};
  });
  d._prof=prof;
}
function autoQuestions(d){
  const q=[];
  d.columns.forEach(c=>{ const p=d._prof[c.name]; if(!p||!p.n) return;
    if(p.lowcard&&p.guess==="text") q.push(`${c.name} : valeurs ${p.top.map(t=>t[0]).join(", ")}. Que signifie chacune ? Faut-il en exclure ?`);
    if(p.nulls/p.n>0.02) q.push(`${c.name} : ${Math.round(p.nulls/p.n*100)} % de valeurs vides. Normal ? Que faire de ces lignes ?`);
    if(p.guess==="date"&&p.fmt) q.push(`${c.name} : date en texte ${p.fmt}. Date réelle ou prévue ?`);
    if(p.guess==="decimal"&&p.comma) q.push(`${c.name} : nombre avec virgule décimale. Unité, HT ou TTC ?`);
    if(p.mixedCase) q.push(`${c.name} : majuscules et minuscules mélangées. Même référence ?`); });
  return q.slice(0,6).map(text=>({text,done:false}));
}
function normVal(v,norm){ v=String(v??""); if(norm==="trim_upper") return v.trim().toUpperCase(); if(norm==="alnum_upper") return v.replace(/[^A-Za-z0-9]/g,"").toUpperCase(); if(norm==="strip_zeros") return v.trim().replace(/^0+/,""); return v; }
function colIndex(ref){ const [d,c]=String(ref).split("."); const ds=DS(d); if(!ds) return null; const i=ds.columns.findIndex(x=>x.name===c); return i<0?null:{ds,i,col:ds.columns[i]}; }
function matchRate(rel){
  const a=colIndex(rel.from), b=colIndex(rel.to); if(!a||!b||!a.ds.rows.length||!b.ds.rows.length) return null;
  const target=new Set(b.ds.rows.map(r=>normVal(r[b.i],rel.norm)).filter(v=>v!==""));
  let tot=0,ok=0; const miss=new Map();
  a.ds.rows.forEach(r=>{ const v=normVal(r[a.i],rel.norm); if(v==="") return; tot++; if(target.has(v)) ok++; else miss.set(r[a.i],(miss.get(r[a.i])||0)+1); });
  return {rate:tot?ok/tot:0,tot,ok,miss:[...miss.entries()].sort((x,y)=>y[1]-x[1]).slice(0,8)};
}
function colNorm(d,c){ const r=S.st.relations.find(r=>(r.from===`${d.id}.${c.name}`||r.to===`${d.id}.${c.name}`)&&r.norm&&r.norm!=="none"); return r?r.norm:"none"; }

/* ───────────── silver et FAITS calculés dans la page ───────────── */
const memo={};
function cached(key,fn){ const k=key+"@"+S.ver; if(!(k in memo)){ Object.keys(memo).forEach(x=>{ if(!x.endsWith("@"+S.ver)) delete memo[x]; }); memo[k]=fn(); } return memo[k]; }
function castVal(d,c,raw){
  const s=raw==null?"":String(raw).trim(); if(s==="") return null;
  const p=d._prof[c.name]||{}; const type=c.type||p.guess||"text";
  if(type==="int"||type==="decimal"){ let t=s.replace(/\s/g,""); if(t.includes(",")) t=t.replace(/\./g,"").replace(",","."); const n=parseFloat(t); return isNaN(n)?null:n; }
  if(type==="date"||type==="timestamp"){ let m=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if(m) return new Date(+m[3],+m[2]-1,+m[1]); m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if(m) return new Date(+m[1],+m[2]-1,+m[3]); const dt=new Date(s); return isNaN(dt)?null:dt; }
  if(type==="bool") return /^(1|true|vrai|oui|o|y|yes)$/i.test(s);
  return s;
}
function splitAnd(sql){ const out=[]; let buf="",q=false,d=0; const s=sql; for(let i=0;i<s.length;i++){ const ch=s[i]; if(ch==="'") q=!q; if(!q){ if(ch==="(")d++; if(ch===")")d--; if(d===0&&/\s/.test(ch)&&/^\s+and\s+/i.test(s.slice(i))){ out.push(buf); buf=""; i+=/^\s+and\s+/i.exec(s.slice(i))[0].length-1; continue; } } buf+=ch; } out.push(buf); return out; }
function parseCond(sql){
  if(!sql||!String(sql).trim()) return ()=>true;
  const preds=splitAnd(String(sql)).map(c=>{
    c=c.trim(); while(/^\(.*\)$/.test(c)&&c.split("(").length===c.split(")").length) c=c.slice(1,-1).trim();
    const lit=x=>{ x=x.trim(); const m=/^'((?:[^']|'')*)'$/.exec(x); return m?{s:m[1].replace(/''/g,"'")}:(/^-?\d+(?:\.\d+)?$/.test(x)?{n:+x}:null); };
    const nlit=L=>L.n!=null?L.n:/^-?\d+(?:[.,]\d+)?$/.test(L.s)?+L.s.replace(",","."):null;
    let m=/^([a-z_]\w*)\s*(=|<>|!=|>=|<=|>|<)\s*(.+)$/i.exec(c);
    if(m){ const L=lit(m[3]); if(!L) return null; const col=m[1], op=m[2], eq=/^(=|<>|!=)$/.test(op);
      return o=>{ const v=o[col]; if(v==null) return false; const n=eq&&typeof v==="number"?nlit(L):null; const a=n!=null?v:L.n!=null?(typeof v==="number"?v:parseFloat(v)):String(v instanceof Date?v.toISOString().slice(0,10):v); const b=n!=null?n:L.n!=null?L.n:L.s;
        return op==="="?a===b:(op==="<>"||op==="!=")?a!==b:op===">"?a>b:op==="<"?a<b:op===">="?a>=b:a<=b; }; }
    m=/^([a-z_]\w*)\s+(not\s+)?in\s*\((.*)\)$/i.exec(c);
    if(m){ const vals=m[3].split(",").map(lit); if(vals.some(v=>!v)) return null; const set=new Set(vals.map(v=>String(v.n??v.s))), nums=new Set(vals.map(nlit)); const neg=!!m[2]; return o=>{ const v=o[m[1]]; if(v==null) return false; return (typeof v==="number"?nums.has(v):set.has(String(v)))!==neg; }; }
    m=/^([a-z_]\w*)\s+(not\s+)?(i?like)\s+'([^']*)'$/i.exec(c);
    if(m){ const re=new RegExp("^"+m[4].replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/%/g,".*").replace(/_/g,".")+"$",m[3].toLowerCase()==="ilike"?"i":""); const neg=!!m[2]; return o=>{ const v=o[m[1]]; if(v==null) return false; return re.test(String(v))!==neg; }; }
    m=/^([a-z_]\w*)\s+is\s+(not\s+)?null$/i.exec(c);
    if(m){ const neg=!!m[2]; return o=>(o[m[1]]==null)!==neg; }
    return null; });
  if(preds.some(p=>!p)) return null;
  return o=>preds.every(p=>p(o));
}
function silverRows(d){ return cached("silver:"+d.id,()=>{
  const norms=d.columns.map(c=>colNorm(d,c)); const rules=d.rules.map(r=>({r,p:parseCond(r.sql)}));
  const rows=[]; let dropped=0;
  d.rows.forEach(raw=>{ const o={}; d.columns.forEach((c,i)=>{ let v=castVal(d,c,raw[i]); if(norms[i]!=="none"&&v!=null) v=normVal(v,norms[i]); o[c.name]=v; if(c.codes){ const k=String(raw[i]??"").trim(); o[c.name+"_libelle"]=k in c.codes?c.codes[k]:(k||null); } });
    if(rules.every(x=>!x.p||x.p(o))) rows.push(o); else dropped++; });
  return {rows,dropped,unparsed:rules.filter(x=>!x.p).map(x=>x.r.sql)};
}); }
function compileVal(expr,d){
  expr=String(expr||"").trim(); if(!expr) return null;
  const cols=new Set(d.columns.map(c=>c.name)); d.columns.forEach(c=>{ if(c.codes) cols.add(c.name+"_libelle"); });
  const num=v=>v==null?null:typeof v==="number"?v:(isNaN(parseFloat(v))?null:parseFloat(v));
  if(cols.has(expr)) return o=>num(o[expr]);
  if(!/^[\w\s.+\-*/()]+$/.test(expr)) return null;
  /* évaluateur arithmétique sans eval (la CSP de la plateforme interdit new Function) : nombres, colonnes, + - * / et parenthèses */
  const tok=expr.match(/\d+(?:\.\d+)?|\.\d+|[a-z_][a-z0-9_]*|[-+*/()]|\S/gi)||[]; let i=0, bad=false;
  const ids=tok.filter(t=>/^[a-z_]/i.test(t)); if(ids.some(t=>!cols.has(t))) return null;
  const prim=()=>{ const t=tok[i++];
    if(t==="("){ const e=add(); if(tok[i++]!==")") bad=true; return e; }
    if(t==="-"){ const e=prim(); return o=>-e(o); } if(t==="+") return prim();
    if(t!=null&&/^[\d.]/.test(t)){ const n=parseFloat(t); return ()=>n; }
    if(t!=null&&cols.has(t)) return o=>num(o[t])??0;
    bad=true; return ()=>0; };
  const mul=()=>{ let l=prim(); while(tok[i]==="*"||tok[i]==="/"){ const op=tok[i++], r=prim(), a=l; l=op==="*"?o=>a(o)*r(o):o=>a(o)/r(o); } return l; };
  const add=()=>{ let l=mul(); while(tok[i]==="+"||tok[i]==="-"){ const op=tok[i++], r=mul(), a=l; l=op==="+"?o=>a(o)+r(o):o=>a(o)-r(o); } return l; };
  const f=add(); if(bad||i<tok.length) return null;
  return o=>{ const v=f(o); return Number.isFinite(v)?v:null; };
}
function keyOf(spec,o){ if(!spec) return null; const s=String(spec).trim(); const m=/^'(.*)'$/.exec(s); if(m) return m[1]; const v=o[s]; return v==null||v===""?null:(v instanceof Date?v.toISOString().slice(0,10):String(v)); }
function fluxLabel(f){ return f.codMode==="regles"?`${(f.rules||[]).length} règles sur ${f.codCol||"?"}`:f.codMode==="colonne"?`codes lus dans ${f.codCol||"?"}`:`${f.cod||"code ?"}${f.lib&&f.lib!==f.cod?" · "+f.lib:""}`; }
/* libellé lisible d'un code catégorie : le libellé du référentiel, sinon le code */
function libelleCat(cod){ const c=(S.st.categories||[]).find(x=>x.cod===cod); return c&&c.lib&&String(c.lib).trim()?String(c.lib).trim():String(cod); }
function libLisibleSql(){ const cs=(S.st.categories||[]).filter(c=>c.lib&&String(c.lib).trim());
  if(!cs.length) return `u."%COD_CATEGORIE"`;
  return `case u."%COD_CATEGORIE"\n${cs.map(c=>`        when ${sq(c.cod)} then ${sq(String(c.lib).trim())}`).join("\n")}\n        else u."%COD_CATEGORIE"\n    end`; }
function buildFaits(){ return cached("faits",()=>{
  const rows=[], stats={};
  S.st.flux.forEach(f=>{
    const st={n:0,src:0,filtered:0,noDate:0,noVal:0,unclassified:0,total:0,filterWarn:false,badVal:false,cods:new Set()}; stats[f.id]=st;
    const d=DS(f.ds); if(!d) return;
    const sr=silverRows(d); const pf=parseCond(f.filtre); if(f.filtre&&!pf) st.filterWarn=true;
    const valFn=f.agg==="count"?(()=>1):compileVal(f.valeur,d); if(!valFn) st.badVal=true;
    const groups=new Map();
    sr.rows.forEach(o=>{
      st.src++; if(pf&&!pf(o)){ st.filtered++; return; }
      const dt=o[f.date]; if(!(dt instanceof Date)||isNaN(dt)){ st.noDate++; return; }
      let cod,lib;
      if(f.codMode==="regles"){ const v=String(o[f.codCol]??""); const r=(f.rules||[]).find(r=>r.prefix!==""&&v.startsWith(r.prefix)); if(!r){ st.unclassified++; return; } cod=r.cod; lib=r.lib||r.cod; }
      else if(f.codMode==="colonne"){ cod=o[f.codCol]; lib=f.libCol?o[f.libCol]:cod; if(cod==null){ st.unclassified++; return; } cod=String(cod); lib=String(lib??cod); }
      else { cod=f.cod; lib=f.lib||f.cod; if(!cod){ st.unclassified++; return; } }
      const val=valFn?valFn(o):null; if(val==null){ st.noVal++; return; }
      const annee=dt.getFullYear(), mois=dt.getMonth()+1;
      const veh=f.vehicule?(normVal(o[f.vehicule],"alnum_upper")||null):null;
      const site=keyOf(f.site,o), chauf=keyOf(f.chauffeur,o), client=keyOf(f.client,o), collab=keyOf(f.collaborateur,o);
      const k=[annee,mois,cod,lib,veh,site,chauf,client,collab].join("\u0001");
      let g=groups.get(k); if(!g){ g={annee,mois,cod,lib,veh,site,chauf,client,collab,vals:[]}; groups.set(k,g); } g.vals.push(val);
    });
    groups.forEach(g=>{ const v=g.vals; const a=f.agg==="count"?v.length:f.agg==="avg"?v.reduce((s,x)=>s+x,0)/v.length:f.agg==="min"?Math.min(...v):f.agg==="max"?Math.max(...v):v.reduce((s,x)=>s+x,0);
      rows.push({annee:g.annee,mois:g.mois,cod:g.cod,lib:g.lib,unite:f.unite,veh:g.veh,site:g.site,chauf:g.chauf,client:g.client,collab:g.collab,
        MontantReel:f.champ==="MontantReel"?a:null,BudgetNextN:f.champ==="BudgetNextN"?a:null,MontantLoc:f.champ==="MontantLoc"?a:null,src:f.ds,flux:f.id});
      st.n++; st.total+=a; st.cods.add(g.cod); });
  });
  return {rows,stats};
}); }
function evalDimExpr(expr,o,base){
  if(!expr) return null; const e=String(expr).trim(); let m;
  const fmt=v=>v instanceof Date?v.toISOString().slice(0,10):v;
  if((m=/^'((?:[^']|'')*)'$/.exec(e))) return m[1].replace(/''/g,"'");
  const refs=refsIn(e).filter(r=>r.ds===base);
  if(refs.length===1&&e===`${refs[0].ds}.${refs[0].col}`) return fmt(o[refs[0].col]);
  if((m=/^case\s+when\s+([a-z_]\w*)\.([a-z_]\w*)\s*(=|<>)\s*'([^']*)'\s+then\s+'([^']*)'(?:\s+else\s+'([^']*)')?\s+end$/i.exec(e))){ if(m[1]!==base) return null; const v=String(o[m[2]]??""); return (m[3]==="="?v===m[4]:v!==m[4])?m[5]:(m[6]??null); }
  if(refs.length===1&&/regexp_replace/i.test(e)) return normVal(o[refs[0].col],"alnum_upper");
  if(refs.length===1&&/^upper\(/i.test(e)) return String(o[refs[0].col]??"").toUpperCase();
  if(/\|\|/.test(e)) return e.split("||").map(p=>{ p=p.trim(); const lm=/^'((?:[^']|'')*)'$/.exec(p); if(lm) return lm[1]; const r=refsIn(p)[0]; return r&&r.ds===base?(fmt(o[r.col])??""):""; }).join("");
  return undefined;
}
function dimBase(t,sid){ const counts={}; t.columns.forEach(c=>refsIn(c.map?.[sid]).forEach(r=>counts[r.ds]=(counts[r.ds]||0)+1)); const ks=Object.keys(counts); return ks.sort((a,b)=>counts[b]-counts[a])[0]||null; }
function buildDims(){ return cached("dims",()=>{
  const out={tables:{},veh:new Map(),chauf:new Map(),partial:{}};
  S.st.gold.filter(t=>t.kind==="dim"&&!t.generated).forEach(t=>{ const rows=[]; let partial=false;
    S.st.societes.forEach(s=>{ const base=dimBase(t,s.id); if(!base||!DS(base)) return;
      silverRows(DS(base)).rows.forEach(o=>{ const r={}; t.columns.forEach(c=>{ const v=evalDimExpr(c.map?.[s.id],o,base); if(v===undefined){ partial=true; r[c.name]=null; } else r[c.name]=v; }); rows.push(r); }); });
    out.tables[t.id]=rows; out.partial[t.id]=partial; });
  (out.tables.DIM_VEHICULE||[]).forEach(r=>{ if(r["%KEY_VEHICULE"]) out.veh.set(r["%KEY_VEHICULE"],r); });
  (out.tables.DIM_CHAUFFEUR||[]).forEach(r=>{ if(r["%KEY_CHAUFFEUR"]) out.chauf.set(String(r["%KEY_CHAUFFEUR"]),r); });
  return out;
}); }
function CAT(){ return cached("cat",()=>{ const raw=(S.st.catalogue||"")+extensionCatalogue(); return analyseCatalogue(parseCatalogue(raw),new Set(S.st.categories.map(c=>c.cod))); }); }
function COV(){ return cached("cov",()=>coverage(CAT(),buildFaits().rows)); }

/* ───────────── statuts ───────────── */
function refsIn(expr){ const out=[]; if(!expr) return out; const re=/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi; let m; while((m=re.exec(expr))){ if(DS(m[1])) out.push({ds:m[1],col:m[2]}); } return out; }
function dsStats(d){
  const doc=d.columns.filter(c=>c.role==="ignore"||(c.desc&&c.type)).length; const ratio=d.columns.length?doc/d.columns.length:0;
  const used=S.st.flux.some(f=>f.ds===d.id)||S.st.gold.some(t=>t.columns.some(c=>Object.values(c.map||{}).some(e=>refsIn(e).some(r=>r.ds===d.id))));
  let st="brut"; if(ratio>0) st="cours"; if(ratio===1) st="doc"; if(used) st=ratio===1?"gold":st==="brut"?"cours":st;
  return {ratio,st,doc,total:d.columns.length,used};
}
const ST_LABEL={brut:"Brut",cours:"En cours",doc:"Documenté",gold:"Dans le gold"};
/* mesures hors périmètre : groupes validés de spec/perimetre.yml, plus les mesures qui s'appuient sur elles */
function horsDe(cat, seed){
  const hors=new Set();
  if(seed) seed.forEach(n=>{ const m=cat.resolve(String(n)); hors.add(m?m.name:String(n)); });
  (Array.isArray(S.st.perimetre)?S.st.perimetre:(S.st.perimetre?.groupes||[])).filter(g=>g&&g.hypothese&&g.hypothese.valide).forEach(g=>(g.mesures||[]).forEach(n=>{ const m=cat.resolve(String(n)); hors.add(m?m.name:String(n)); }));
  if(!hors.size) return hors;
  let change=true;
  while(change){ change=false; cat.list.forEach(m=>{ if(!hors.has(m.name)&&(m.refs||[]).some(x=>{ const t=cat.resolve(x); return !!t&&hors.has(t.name); })){ hors.add(m.name); change=true; } }); }
  return hors;
}
function horsPerimetre() {
  return cached("hors", () => {
    const set = new Set();
    // périmètre explicite (cycle 2)
    (S.st.perimetre?.groupes || []).forEach(g => {
      if (g.hypothese?.valide) (g.mesures || []).forEach(n => set.add(n));
    });
    // thèmes non cochés (cycle 5)
    const besoins = S.st.besoins || { themes: [], libres: [] };
    if (besoins.themes.length) {
      THEMES().forEach(t => {
        const choix = besoins.themes.find(b => b.id === t.id);
        if (choix && !choix.choisi) t.mesures.forEach(n => set.add(n));
      });
    }
    return horsDe(CAT(), set);
  });
}
function statutMesure(m){ return horsPerimetre().has(m.name)?"hors":COV().get(m.id).s; }
function measureCounts(){ const c={ok:0,part:0,none:0,err:0,hors:0}; CAT().list.forEach(m=>{ c[statutMesure(m)]++; }); return c; }
/* feuilles du dashboard sans les mesures hors périmètre : objet vide retiré, objet partiel gardé, feuille vide retirée */
function filtrerFeuilles(sheets,estHors){
  const garde=l=>l.filter(x=>!estHors(x.m));
  const objet=o=>{
    if(Array.isArray(o.items)){ const items=garde(o.items); return items.length?{...o,items}:null; }
    if(Array.isArray(o.measures)){ const measures=garde(o.measures); return measures.length?{...o,measures}:null; }
    if(o.m) return estHors(o.m)?null:o;
    return o; };
  return sheets.map(s=>({...s,objs:s.objs.map(objet).filter(Boolean)})).filter(s=>s.objs.length);
}

const ST_M={ok:"Alimentée",part:"Partielle",none:"Non alimentée",err:"À corriger",hors:"Hors périmètre"};
/* ───────────── génération dbt / Qlik / ODCS / doc ───────────── */
const pgType={text:"text",int:"integer",decimal:"numeric",date:"date",timestamp:"timestamptz",bool:"boolean"};
/* texte libre dans un commentaire SQL ou Qlik : une seule ligne, sans caractère de contrôle */
const ligne=s=>String(s??"").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g," ").trim();
const sq=s=>"'"+String(s).replace(/'/g,"''")+"'";
const qi=s=>'"'+String(s).replace(/"/g,'""')+'"';
function normSql(expr,norm){ if(norm==="trim_upper") return `upper(trim(${expr}))`; if(norm==="alnum_upper") return `upper(regexp_replace(${expr}, '[^A-Za-z0-9]', '', 'g'))`; if(norm==="strip_zeros") return `ltrim(trim(${expr}), '0')`; return expr; }
function castSql(c){ const s=`nullif(trim(src.${c.name}), '')`;
  switch(c.type){ case "int": return `${s}::integer`; case "decimal": return c.decimalComma?`replace(replace(${s}, ' ', ''), ',', '.')::numeric`:`${s}::numeric`;
    case "date": return c.format?`to_date(${s}, ${sq(c.format)})`:`${s}::date`; case "timestamp": return c.format?`to_timestamp(${s}, ${sq(c.format)})`:`${s}::timestamptz`; case "bool": return `${s}::boolean`; default: return s; } }
function silverSql(d){
  const soc=SOC(d.societe), R=d.rules.length;
  const L=[`-- stg_${d.id} · ${ligne(soc?.name||d.societe)}`,`-- ${ligne(d.desc)||"Description à compléter"}`,`-- Grain : ${ligne(d.grain)||"à préciser"}`,"",`with src as (`,`    select * from {{ source('bronze_${d.societe}', '${d.id}') }}`,R?"),":")","",...(R?["silver as ("]:[]),"select"];
  const sel=[];
  d.columns.forEach(c=>{ if(c.role==="ignore"){ sel.push([`    -- ${c.name} : ignorée${c.desc?" ("+ligne(c.desc)+")":""}`,null]); return; }
    const n=colNorm(d,c); let e=castSql(c); if(n!=="none") e=normSql(e,n); sel.push([`    ${e} as ${c.name}`,ligne(c.desc)]);
    if(c.codes) sel.push([`    case trim(src.${c.name})\n${Object.entries(c.codes).map(([k,v])=>`        when ${sq(k)} then ${sq(v)}`).join("\n")}\n        else trim(src.${c.name})\n    end as ${c.name}_libelle`,null]); });
  sel.push([`    ${sq(d.societe)} as societe_key`,null]);
  const real=sel.filter(x=>x[1]!==null||!x[0].trim().startsWith("--")); const last=real[real.length-1];
  L.push(sel.map(x=>x[0].trim().startsWith("--")?x[0]:x[0]+(x===last?"":",")+(x[1]?"  -- "+x[1]:"")).join("\n"));
  L.push("from src"); if(R) L.push(")","select * from silver","where "+d.rules.map(r=>`(${r.sql})  -- ${ligne(r.text)}`).join("\n  and "));
  return L.join("\n")+"\n";
}
function findPath(fromSet,target){
  const edges=S.st.relations.filter(r=>r.kind!=="fuzzy").map(r=>({a:r.from.split(".")[0],b:r.to.split(".")[0],ca:r.from,cb:r.to}));
  const q=fromSet.map(ds=>({ds,path:[]})); const seen=new Set(fromSet);
  while(q.length){ const cur=q.shift(); if(cur.ds===target) return cur.path;
    edges.forEach(e=>{ let nx=null,on=null; if(e.a===cur.ds&&!seen.has(e.b)){nx=e.b;on=`${e.cb} = ${e.ca}`;} else if(e.b===cur.ds&&!seen.has(e.a)){nx=e.a;on=`${e.ca} = ${e.cb}`;}
      if(nx&&DS(nx)?.societe===DS(cur.ds)?.societe){ seen.add(nx); q.push({ds:nx,path:[...cur.path,{ds:nx,on}]}); } }); }
  return null;
}
function dimSql(t){
  const parts=[];
  S.st.societes.forEach(s=>{
    const exprs=t.columns.map(c=>c.map?.[s.id]||""); if(!exprs.some(Boolean)) return;
    const used=[]; const counts={}; exprs.forEach(e=>refsIn(e).forEach(r=>{ counts[r.ds]=(counts[r.ds]||0)+1; if(!used.includes(r.ds)) used.push(r.ds); }));
    const base=used.slice().sort((a,b)=>(counts[b]||0)-(counts[a]||0))[0]; if(!base) return;
    const joined=[base], joins=[], missing=[];
    used.forEach(u=>{ if(joined.includes(u)) return; const path=findPath(joined,u); if(!path){ missing.push(u); return; } path.forEach(st=>{ if(joined.includes(st.ds)) return; joins.push(`left join {{ ref('stg_${st.ds}') }} as ${st.ds}\n    on ${st.on}`); joined.push(st.ds); }); });
    const sel=t.columns.map(c=>{ const e=c.map?.[s.id]; return e?[`    ${e} as ${qi(c.name)}`,""]:[`    null::${pgType[c.type]||"text"} as ${qi(c.name)}`,`  -- non alimentée pour ${ligne(s.name)}`]; });
    let q=`-- ${ligne(s.name)}\nselect\n${sel.map(([x,cm],i)=>x+(i<sel.length-1?",":"")+cm).join("\n")}\nfrom {{ ref('stg_${base}') }} as ${base}`+(joins.length?"\n"+joins.join("\n"):"");
    if(missing.length) q=`-- TODO : aucune relation documentée pour joindre ${ligne(missing.join(", "))} à ${ligne(base)}\n`+q; parts.push(q);
  });
  if(!parts.length) return `-- ${ligne(t.id)} : aucune colonne alimentée pour l'instant\nselect ${t.columns.map(c=>`null::${pgType[c.type]||"text"} as ${qi(c.name)}`).join(", ")}\nwhere false\n`;
  return `-- ${ligne(t.id)} · ${ligne(t.desc)}\n\n`+parts.join("\n\nunion all\n\n")+"\n";
}
function fluxSql(f){
  const d=DS(f.ds); if(!d) return null; const a=d.id; const col=c=>`${a}.${c}`;
  const date=f.date?col(f.date):"null::date";
  let cod,lib,extraWhere=null;
  if(f.codMode==="regles"){ const rs=(f.rules||[]).filter(r=>r.prefix!==""); cod=`case\n${rs.map(r=>`        when ${col(f.codCol)} like ${sq(r.prefix+"%")} then ${sq(r.cod)}`).join("\n")}\n    end`; lib=`case\n${rs.map(r=>`        when ${col(f.codCol)} like ${sq(r.prefix+"%")} then ${sq(r.lib||r.cod)}`).join("\n")}\n    end`; extraWhere=rs.length?"("+rs.map(r=>`${col(f.codCol)} like ${sq(r.prefix+"%")}`).join(" or ")+")":"false"; }
  else if(f.codMode==="colonne"){ cod=`${col(f.codCol)}::text`; lib=f.libCol?`${col(f.libCol)}::text`:cod; }
  else { cod=sq(f.cod||"?"); lib=sq(f.lib||f.cod||"?"); }
  const keyExpr=spec=>{ if(!spec) return "null::text"; const m=/^'(.*)'$/.exec(String(spec).trim()); return m?sq(m[1]):`${col(spec)}::text`; };
  const valCols=new Set(d.columns.map(c=>c.name)); d.columns.forEach(c=>{ if(c.codes) valCols.add(c.name+"_libelle"); });
  const val=f.agg==="count"?"count(*)":`${f.agg}(${String(f.valeur||"null").replace(/\b[a-z_][a-z0-9_]*\b/gi,id=>valCols.has(id)?col(id):id)})`;
  const vals=CHAMPS.map(c=>c===f.champ?`    ${val} as ${qi(c)}`:`    null::numeric as ${qi(c)}`);
  const where=[f.filtre?`(${f.filtre})`:null,extraWhere].filter(Boolean);
  return `-- Flux ${ligne(f.id)} : ${ligne(fluxLabel(f))} · ${ligne(d.id)} (${ligne(SOC(d.societe)?.name||d.societe)})${f.note?"\n-- "+ligne(f.note):""}
select
    date_trunc('month', ${date})::date as "%Date",
    date_trunc('month', ${date})::date as "Date",
    extract(year from ${date})::int as "Annee",
    extract(month from ${date})::int as "Mois",
    ${cod} as "%COD_CATEGORIE",
    ${lib} as "LIB_Categorie",
    ${sq(f.unite)} as "TYP_UNITE",
    null::text as "FLG_CATEGORIE",
    ${f.vehicule?normSql(col(f.vehicule),"alnum_upper"):"null::text"} as "%KEY_VEHICULE",
    ${keyExpr(f.site)} as "%LIB_SITE",
    ${keyExpr(f.chauffeur)} as "%KEY_CHAUFFEUR",
    ${keyExpr(f.chauffeur)} as "matricule",
    ${keyExpr(f.client)} as "LIB_CLIENT",
    ${keyExpr(f.collaborateur)} as "LIB_COLLABORATEUR",
${vals.join(",\n")},
    ${sq(d.id)} as "Source_Faits"
from {{ ref('stg_${d.id}') }} as ${a}${where.length?"\nwhere "+where.join("\n  and "):""}
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14`;
}
function faitsSql(){ const parts=S.st.flux.map(fluxSql).filter(Boolean); if(!parts.length) return `-- FAITS : aucun flux défini\nselect ${FAITS_FIELDS.map(([n,t])=>`null::${pgType[t]} as ${qi(n)}`).join(", ")}\nwhere false\n`;
  return `-- FAITS · table longue du modèle Qlik Tredunion\n-- Une ligne = un montant pour une catégorie, un mois et les axes connus du flux.\n\nselect\n    u.*,\n    ${libLisibleSql()} as "LIB_LISIBLE"\nfrom (\n${parts.join("\n\nunion all\n\n")}\n) as u\n`; }
function yq(s){ return JSON.stringify(String(s??"")); }
function schemaYml(){
  const L=["version: 2","","sources:"];
  S.st.societes.forEach(s=>{ const ds=S.st.datasets.filter(d=>d.societe===s.id); if(!ds.length) return; L.push(`  - name: bronze_${s.id}`,`    description: ${yq(s.name+" — "+(s.source||""))}`,`    schema: bronze_${s.id}`,`    tables:`); ds.forEach(d=>L.push(`      - name: ${d.id}`,`        description: ${yq(d.desc)}`)); });
  L.push("","models:");
  S.st.datasets.forEach(d=>{ L.push(`  - name: stg_${d.id}`,`    description: ${yq((d.desc||"")+(d.grain?" Grain : "+d.grain:""))}`,`    columns:`);
    d.columns.filter(c=>c.role!=="ignore").forEach(c=>{ L.push(`      - name: ${c.name}`,`        description: ${yq(c.desc)}`); const tests=[]; if(c.role==="key") tests.push("unique","not_null");
      S.st.relations.filter(r=>r.from===`${d.id}.${c.name}`&&r.kind==="equal").forEach(r=>{ const [td,tc]=r.to.split("."); if(DS(td)?.societe===d.societe) tests.push(`relationships:\n              to: ref('stg_${td}')\n              field: ${tc}\n              config:\n                severity: warn`); });
      if(c.codes) tests.push(`accepted_values:\n              values: [${Object.keys(c.codes).map(k=>yq(k)).join(", ")}]\n              config:\n                severity: warn`);
      if(tests.length){ L.push(`        data_tests:`); tests.forEach(t=>L.push(`          - ${t}`)); } }); });
  L.push(`  - name: faits`,`    description: "Table longue FAITS du modèle Qlik"`,`    columns:`);
  FAITS_FIELDS.forEach(([n,,d])=>{ L.push(`      - name: ${yq(n)}`,`        description: ${yq(d)}`,`        quote: true`); if(n==="%COD_CATEGORIE") L.push(`        data_tests:`,`          - not_null`,`          - accepted_values:`,`              values: [${S.st.categories.map(c=>yq(c.cod)).join(", ")}]`,`              config:`,`                severity: warn`); if(n==="%KEY_VEHICULE") L.push(`        data_tests:`,`          - relationships:`,`              to: ref('dim_vehicule')`,`              field: '"%KEY_VEHICULE"'`,`              config:`,`                severity: warn`); });
  S.st.gold.filter(t=>t.kind==="dim"&&!t.generated).forEach(t=>{ L.push(`  - name: ${t.id.toLowerCase()}`,`    description: ${yq(t.desc)}`,`    columns:`); t.columns.forEach((c,i)=>{ L.push(`      - name: ${yq(c.name)}`,`        description: ${yq(c.desc)}`,`        quote: true`); if(i===0) L.push(`        data_tests:`,`          - unique`,`          - not_null`); }); });
  return L.join("\n")+"\n";
}
function odcs(t){
  const slug=snake(S.st.adherent);
  const L=["apiVersion: v3.0.2","kind: DataContract",`id: tredunion-${slug}-${t.id.toLowerCase()}`,`name: ${t.id}`,"version: 0.1.0","status: draft","domain: tredunion","description:",`  purpose: ${yq(t.desc)}`,`  usage: ${yq("Dashboards Qlik Tredunion — "+S.st.adherent)}`,"schema:",`  - name: ${t.id}`,`    physicalName: gold_${slug}.${t.id.toLowerCase()}`,"    logicalType: object","    properties:"];
  t.columns.forEach((c,i)=>{ L.push(`      - name: ${yq(c.name)}`,`        logicalType: ${c.type==="int"?"integer":c.type==="decimal"?"number":c.type==="bool"?"boolean":c.type==="text"?"string":"date"}`,`        physicalType: ${pgType[c.type]||"text"}`,`        description: ${yq(c.desc)}`);
    if(t.kind==="dim"&&i===0) L.push("        primaryKey: true","        required: true");
    if(t.kind==="faits"&&c.name==="%COD_CATEGORIE") L.push("        required: true","        logicalTypeOptions:",`          enum: [${S.st.categories.map(x=>yq(x.cod)).join(", ")}]`);
    const src=Object.entries(c.map||{}).map(([k,v])=>`${k}: ${v}`); if(src.length) L.push(`        transformLogic: ${yq(src.join(" | "))}`); });
  if(t.kind==="faits") L.push("    transformLogic: "+yq("Union des flux : "+S.st.flux.map(f=>`${f.ds} → ${fluxLabel(f)}`).join(" ; ")));
  return L.join("\n")+"\n";
}
function qvs(){ const slug=snake(S.st.adherent); const tabs=["FAITS",...S.st.gold.filter(t=>t.kind==="dim"&&!t.generated).map(t=>t.id)];
  return `///$tab Main
// Chargement Tredunion · ${ligne(S.st.adherent)}
// Généré par l'atelier silver → gold le ${new Date().toLocaleDateString("fr-FR")}
SET ThousandSep=' ';
SET DecimalSep=',';
SET DateFormat='DD/MM/YYYY';

// TODO : nom exact de la connexion PostgreSQL au datawarehouse
LIB CONNECT TO 'WeMa_DWH';

///$tab Modèle
${tabs.map(t=>`${t}:\nLOAD *;\nSQL SELECT * FROM "gold_${slug}"."${t.toLowerCase()}";\n`).join("\n")}
///$tab Calendrier
// Îlot non relié : alimente les sélecteurs MoisVar / AnneeVar lus par vSET_M, vMaxAnneeVar…
TmpBornes:
LOAD Min("%Date") as DMin, Max("%Date") as DMax RESIDENT FAITS;
LET vDMin = Num(Peek('DMin', 0, 'TmpBornes'));
LET vDMax = Num(MonthEnd(Peek('DMax', 0, 'TmpBornes')));
DROP TABLE TmpBornes;

Calendar:
LOAD
    Date($(vDMin) + IterNo() - 1) as DateVar,
    Year($(vDMin) + IterNo() - 1) as AnneeVar,
    Month($(vDMin) + IterNo() - 1) as MoisVar
AUTOGENERATE 1 WHILE $(vDMin) + IterNo() - 1 <= $(vDMax);
`; }
function masterItemsJson(){ return JSON.stringify(CAT().list.map(m=>({qInfo:{qId:"tred-"+snake(m.name).slice(0,40)+"-"+m.id,qType:"measure"},qMeasure:{qLabel:m.name,qDef:m.expr,qGrouping:"N",qExpressions:[],qActiveExpression:0},qMetaDef:{title:m.name,description:m.issues.filter(i=>i.sev==="bad").map(i=>i.txt).join(" ; "),tags:["tredunion"]}})),null,2)+"\n"; }
function sessionMd(){
  const L=[`# Séance de modélisation — ${S.st.adherent}`,"",`Générée le ${new Date().toLocaleString("fr-FR")} depuis l'atelier silver → gold.`,"","## Sociétés",""];
  S.st.societes.forEach(s=>L.push(`- **${s.name}** (\`${s.id}\`) — ${s.source||""}`));
  S.st.datasets.forEach(d=>{ const st=dsStats(d); L.push("",`## ${d.id} · ${SOC(d.societe)?.name||""}`,"",`${d.desc||"_Description à compléter_"}`,"",`- Grain : ${d.grain||"à préciser"}`,`- ${d.rows.length} lignes analysées · ${st.doc}/${st.total} colonnes documentées`,"","| Colonne | Type | Rôle | Description | Valeurs codées |","|---|---|---|---|---|");
    d.columns.forEach(c=>L.push(`| \`${c.name}\` | ${c.type||"?"} | ${ROLES[c.role]} | ${(c.desc||"").replace(/\|/g,"/")}${c.pii?" _(donnée personnelle)_":""} | ${c.codes?Object.entries(c.codes).map(([k,v])=>`${k} = ${v}`).join(", "):""} |`));
    if(d.rules.length){ L.push("","**Règles silver**",""); d.rules.forEach(r=>L.push(`- ${r.text} — \`${r.sql}\``)); }
    if(d.cases.length){ L.push("","**Cas particuliers**",""); d.cases.forEach(c=>L.push(`- ${c.text}`)); }
    const open=d.questions.filter(q=>!q.done); if(open.length){ L.push("","**Questions ouvertes**",""); open.forEach(q=>L.push(`- [ ] ${q.text}`)); } });
  L.push("","## Relations",""); S.st.relations.forEach(r=>{ const m=matchRate(r); L.push(`- \`${r.from}\` → \`${r.to}\` — ${KINDS[r.kind]}${r.norm!=="none"?", normalisation : "+NORMS[r.norm].toLowerCase():""}${m?` — ${(m.rate*100).toFixed(1)} % rapprochés`:""}${r.note?"  \n  "+r.note:""}`); });
  const fa=buildFaits(); L.push("","## Flux vers FAITS","");
  S.st.flux.forEach(f=>{ L.push(`### ${f.ds} → ${fluxLabel(f)}`,"",f.note||"","",`- ${AGGS[f.agg]} de \`${f.valeur||"?"}\` dans \`${f.champ}\` (${f.unite}), par mois de \`${f.date||"?"}\``,`- Axes : véhicule ${f.vehicule||"—"}, chauffeur ${f.chauffeur||"—"}, site ${f.site||"—"}, client ${f.client||"—"}`,f.filtre?`- Filtre : \`${f.filtre}\``:"",`- ${(fa.stats[f.id]?.n||0)} lignes FAITS dans l'aperçu`);
    if(f.codMode==="regles"){ L.push("","| Préfixe | Code | Libellé |","|---|---|---|"); f.rules.forEach(r=>L.push(`| \`${r.prefix}\` | ${r.cod} | ${r.lib} |`)); } L.push(""); });
  if(S.st.cases.length){ L.push("## Cas particuliers transverses",""); S.st.cases.forEach(c=>L.push(`- ${c.text}`)); L.push(""); }
  const cat=CAT(), cov=COV(); const mc=measureCounts(); L.push("## Couverture du catalogue de mesures","",`${mc.ok} alimentées, ${mc.part} partielles, ${mc.none} non alimentées, ${mc.err} à corriger${mc.hors>0?`, ${mc.hors} hors périmètre`:""} sur ${cat.list.length}.`,"","| Mesure | Statut | Manque |","|---|---|---|");
  cat.list.forEach(m=>{ const c=cov.get(m.id); L.push(`| ${m.name} | ${ST_M[statutMesure(m)]} | ${(c.miss||[]).slice(0,6).join(", ")} |`); });
  const an=cat.list.filter(m=>m.issues.some(i=>i.sev==="bad")); if(an.length){ L.push("","## Anomalies du catalogue",""); an.forEach(m=>L.push(`- **${m.name}** : ${m.issues.filter(i=>i.sev==="bad").map(i=>i.txt).join(" ; ")}`)); }
  if(S.st.log.length){ L.push("","## Journal de séance",""); S.st.log.forEach(l=>L.push(`- ${new Date(l.at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})} — « ${l.said} » → ${l.resume} (${l.ops.length} modifications)`)); }
  return L.join("\n")+"\n";
}
function buildFiles(){
  const slug=snake(S.st.adherent); const F=[];
  F.push({group:"Projet dbt",path:"dbt_project.yml",body:`name: tredunion_${slug}\nversion: '0.1.0'\nprofile: wema_dwh\n\nmodel-paths: ["models"]\n\nmodels:\n  tredunion_${slug}:\n    silver:\n      +schema: silver_${slug}\n      +materialized: view\n    gold:\n      +schema: gold_${slug}\n      +materialized: table\n`});
  F.push({group:"Projet dbt",path:"models/schema.yml",body:schemaYml()});
  S.st.datasets.forEach(d=>F.push({group:"Silver",path:`models/silver/stg_${d.id}.sql`,body:silverSql(d)}));
  F.push({group:"Gold",path:"models/gold/faits.sql",body:faitsSql()});
  S.st.gold.filter(t=>t.kind==="dim"&&!t.generated).forEach(t=>F.push({group:"Gold",path:`models/gold/${t.id.toLowerCase()}.sql`,body:dimSql(t)}));
  F.push({group:"Qlik",path:"qlik/chargement.qvs",body:qvs()});
  F.push({group:"Qlik",path:"qlik/elements_principaux.json",body:masterItemsJson()});
  S.st.gold.filter(t=>!t.generated).forEach(t=>F.push({group:"Contrats ODCS",path:`contracts/${t.id.toLowerCase()}.odcs.yaml`,body:odcs(t)}));
  F.push({group:"Documentation",path:"docs/seance.md",body:sessionMd()});
  F.push({group:"Documentation",path:"fiche_seance.md",body:ficheSeanceMd()});
  return F;
}
const SHEETS_BASE = [
  { id: "accueil", title: "Accueil" },
  { id: "general", title: "Général" },
  { id: "resultat", title: "Résultat" },
  { id: "masse", title: "Masse salariale" },
  { id: "activites", title: "Activités" },
  { id: "couts", title: "Coûts d'exploitation" },
];

function mesuresDeSheet(sheet) {
  const noms = new Set();
  (sheet.objs || []).forEach(o => {
    if (o.m) noms.add(o.m);
    (o.items || []).forEach(i => noms.add(i.m));
    (o.measures || []).forEach(i => noms.add(i.m));
  });
  return [...noms];
}

function THEMES() {
  return cached("themes", () => {
    const sheetsFull = typeof SHEETS !== "undefined" ? SHEETS : [];
    return SHEETS_BASE.map(b => {
      const full = sheetsFull.find(s => s.id === b.id);
      return { id: b.id, title: b.title, mesures: full ? mesuresDeSheet(full) : [] };
    });
  });
}

function mesuresTheme(id) {
  const t = THEMES().find(t => t.id === id);
  return t ? t.mesures : [];
}
/* ───────────── CSV ───────────── */
function parseCSV(text){
  text=text.replace(/^\uFEFF/,""); const first=text.split(/\r?\n/)[0]||"";
  const delim=[";",",","\t","|"].map(d=>[d,first.split(d).length]).sort((a,b)=>b[1]-a[1])[0][0];
  const rows=[]; let row=[],f="",q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
    else if(c==='"') q=true; else if(c===delim){row.push(f);f="";} else if(c==="\n"){row.push(f.replace(/\r$/,""));rows.push(row);row=[];f=""; if(rows.length>50001) break;} else f+=c; }
  if(f!==""||row.length){row.push(f.replace(/\r$/,""));rows.push(row);}
  return rows.filter(r=>r.some(v=>v!==""));
}
