/* ───────────── Moteur d'expressions Qlik (sous-ensemble) ───────────── */
function parseCatalogue(raw){
  const lines=String(raw).replace(/\r/g,"").split("\n"); const out=[]; let cur=null;
  lines.forEach(l=>{
    if(/^\S/.test(l)){ cur={name:l.trim(),expr:""}; out.push(cur); }
    else if(cur) cur.expr+=(cur.expr?"\n":"")+l.replace(/^ {4}/,"");
  });
  out.forEach(m=>{ m.expr=m.expr.replace(/\s+$/,""); });
  return out.filter(m=>m.name);
}
function qTokenize(src){
  src=src.replace(/\/\/[^\n]*/g,"");
  const t=[]; let i=0;
  while(i<src.length){
    const c=src[i];
    if(/\s/.test(c)){i++;continue;}
    if(c==="{"&&src[i+1]==="<"){ let j=i+2,d=0,buf="",q=false;
      while(j<src.length){ const ch=src[j]; if(ch==="'")q=!q; if(!q){ if(ch===">"&&src[j+1]==="}"&&d===0) break; if(ch==="{")d++; if(ch==="}")d--; } buf+=ch; j++; }
      if(j>=src.length) throw new Error("Ensemble {< … >} non fermé"); t.push({k:"set",v:buf}); i=j+2; continue; }
    if(c==="'"){ let j=i+1,buf=""; while(j<src.length){ if(src[j]==="'"){ if(src[j+1]==="'"){buf+="'";j+=2;continue;} break; } buf+=src[j++]; } t.push({k:"str",v:buf}); i=j+1; continue; }
    if(c==="["){ const j=src.indexOf("]",i); if(j<0) throw new Error("Crochet non fermé"); t.push({k:"brk",v:src.slice(i+1,j)}); i=j+1; continue; }
    if(c==="$"&&src[i+1]==="("){ let j=i+2,d=1; while(j<src.length&&d){ if(src[j]==="(")d++; if(src[j]===")")d--; j++; } t.push({k:"dollar",v:src.slice(i+2,j-1)}); i=j; continue; }
    if(/[0-9]/.test(c)){ const m=/^\d+(\.\d+)?/.exec(src.slice(i)); t.push({k:"num",v:+m[0]}); i+=m[0].length; continue; }
    if(/[A-Za-z_%À-ſ]/.test(c)){ const m=/^[A-Za-z_%À-ſ][\wÀ-ſ#%]*/.exec(src.slice(i)); t.push({k:"id",v:m[0]}); i+=m[0].length; continue; }
    const two=src.slice(i,i+2); if([">=","<=","<>"].includes(two)){ t.push({k:"op",v:two}); i+=2; continue; }
    if("+-*/(),><=&".includes(c)){ t.push({k:"op",v:c}); i++; continue; }
    throw new Error("Caractère inattendu « "+c+" »");
  }
  return t;
}
function qParse(src){
  const tk=qTokenize(src); let p=0;
  const peek=()=>tk[p]; const isOp=v=>tk[p]&&tk[p].k==="op"&&tk[p].v===v;
  const eat=v=>{ if(!isOp(v)) throw new Error("« "+v+" » attendu"); p++; };
  function expr(){ let a=add(); while(tk[p]&&tk[p].k==="op"&&[">","<","=",">=","<=","<>"].includes(tk[p].v)){ const op=tk[p++].v; a={t:"cmp",op,a,b:add()}; } return a; }
  function add(){ let a=mul(); while(isOp("+")||isOp("-")||isOp("&")){ const op=tk[p++].v; a={t:"bin",op,a,b:mul()}; } return a; }
  function mul(){ let a=un(); while(isOp("*")||isOp("/")){ const op=tk[p++].v; a={t:"bin",op,a,b:un()}; } return a; }
  function un(){ if(isOp("-")){ p++; return {t:"neg",a:un()}; } return prim(); }
  function prim(){
    const x=peek(); if(!x) throw new Error("Expression incomplète");
    if(x.k==="num"){p++;return {t:"num",v:x.v};}
    if(x.k==="str"){p++;return {t:"str",v:x.v};}
    if(x.k==="dollar"){p++;return {t:"dollar",v:x.v};}
    if(isOp("(")){ p++; const e=expr(); eat(")"); return e; }
    if(x.k==="brk"){ p++; return {t:"ref",v:x.v}; }
    if(x.k==="id"){ p++;
      if(isOp("(")){ p++; const fn=x.v.toLowerCase();
        if(["sum","count","avg","min","max"].includes(fn)){
          let set=null,distinct=false,total=false;
          if(peek()&&peek().k==="set") set=tk[p++].v;
          while(peek()&&peek().k==="id"&&["distinct","total"].includes(peek().v.toLowerCase())){ if(tk[p++].v.toLowerCase()==="distinct") distinct=true; else total=true; }
          const arg=expr(); eat(")"); return {t:"agg",fn,set,distinct,total,arg};
        }
        const args=[]; if(!isOp(")")){ args.push(expr()); while(isOp(",")){ p++; if(isOp(")")) break; args.push(expr()); } }
        eat(")"); return {t:"call",fn,args};
      }
      return {t:"field",v:x.v};
    }
    throw new Error("Symbole inattendu « "+x.v+" »");
  }
  const e=expr(); if(p<tk.length) throw new Error("Texte en trop : « "+tk[p].v+" »"); return e;
}
function parseSet(raw){
  const items=[]; let buf="",d=0,q=false;
  for(const ch of raw){ if(ch==="'") q=!q; if(!q){ if(ch==="{"||ch==="(")d++; if(ch==="}"||ch===")")d--; if(ch===","&&d===0){ items.push(buf); buf=""; continue; } } buf+=ch; }
  items.push(buf);
  return items.map(s=>s.trim()).filter(Boolean).map(s=>{
    let m=/^\$\(\s*([^)]+?)\s*\)$/.exec(s); if(m) return {k:"var",v:m[1]};
    m=/^\[?([^\]=\-{}]+?)\]?\s*(-=|=)\s*\{([\s\S]*)\}$/.exec(s);
    if(m){ const vals=[...m[3].matchAll(/'((?:[^']|'')*)'/g)].map(x=>x[1].replace(/''/g,"'")); return {k:"fld",f:m[1].trim(),op:m[2],vals}; }
    return {k:"bad",v:s};
  });
}
function walk(n,fn){ if(!n||typeof n!=="object") return; fn(n); ["a","b","arg"].forEach(k=>n[k]&&walk(n[k],fn)); (n.args||[]).forEach(x=>walk(x,fn)); }
function aggSig(n){ const f=n.arg&&(n.arg.v||""); const set=n.set?parseSet(n.set).filter(e=>e.k==="fld").map(e=>`${e.f}${e.op}${e.vals.slice().sort().join("|")}`).sort().join(";"):""; return `${n.fn}(${n.distinct?"distinct ":""}${f})[${set}]`; }
function branches(n){ if(n&&n.t==="call"&&n.fn==="if"&&n.args.length>=2&&n.args[0].t==="cmp"&&JSON.stringify(n.args[0]).includes("getselectedcount")){ return [n.args[1],...(n.args[2]?branches(n.args[2]):[])]; } return [n]; }

const PERIOD_VARS=["vset_m","vset_m-1","vset_n-1","vmaxannee","vmaxannee-1","vmaxanneevar","vmaxanneevar-1"];
function analyseCatalogue(list, knownCods){
  const byName=new Map(), byLow=new Map(), seen={};
  list.forEach(m=>{ seen[m.name]=(seen[m.name]||0)+1; if(!byName.has(m.name)) byName.set(m.name,m); const lo=m.name.toLowerCase(); if(!byLow.has(lo)) byLow.set(lo,m); });
  const resolve=n=>byName.get(n)||byLow.get(n.toLowerCase())||null;
  list.forEach((m,idx)=>{
    m.id=idx; m.issues=[]; m.refs=[]; m.aggs=[]; m.unsupported=[];
    try{ m.ast=qParse(m.expr); m.err=null; }catch(e){ m.ast=null; m.err=e.message; m.issues.push({sev:"bad",txt:"Expression illisible : "+e.message}); return; }
    const argNodes=new Set(); walk(m.ast,n=>{ if(n.t==="agg"&&n.arg) argNodes.add(n.arg); if(n.t==="call"&&n.fn==="getselectedcount") n.args.forEach(a=>argNodes.add(a)); });
    m.bare=[];
    walk(m.ast,n=>{
      if(argNodes.has(n)) return;
      if(n.t==="ref") m.refs.push(n.v);
      if(n.t==="agg") m.aggs.push(n);
      if(n.t==="call"&&!["if","getselectedcount","num#","num"].includes(n.fn)) m.unsupported.push(n.fn);
      if(n.t==="field") m.bare.push(n.v);
    });
    // refs inside aggregations are fields, not measures
    const aggFields=new Set(m.aggs.map(a=>a.arg&&a.arg.v)); m.refs=m.refs.filter(r=>!aggFields.has(r));
    m.composite=m.refs.length>0;
  });
  list.forEach(m=>{
    if(!m.ast) return;
    if(seen[m.name]>1) m.issues.push({sev:"bad",txt:`Nom en double (${seen[m.name]} définitions)`});
    m.bare.forEach(b=>{ if(resolve(b)) m.issues.push({sev:"bad",txt:`« ${b} » écrit sans crochets : Qlik le lit comme un champ inexistant`}); else m.unsupported.push("champ "+b+" hors agrégation"); });
    m.refs.forEach(r=>{ const t=byName.get(r); if(t) return; const lo=byLow.get(r.toLowerCase()); if(lo) m.issues.push({sev:"warn",txt:`[${r}] ne diffère de « ${lo.name} » que par la casse`}); else m.issues.push({sev:"bad",txt:`Référence introuvable : [${r}]`}); });
    const vars=[]; m.aggs.forEach(a=>a.set&&parseSet(a.set).forEach(e=>{ if(e.k==="var") vars.push(e.v.toLowerCase()); if(e.k==="bad") m.issues.push({sev:"warn",txt:"Élément d'ensemble non reconnu : "+e.v}); }));
    vars.filter(v=>!PERIOD_VARS.includes(v)).forEach(v=>m.unsupported.push("variable "+v));
    if(/N-1/i.test(m.name)&&vars.some(v=>["vmaxannee","vmaxanneevar","vset_m"].includes(v))) m.issues.push({sev:"bad",txt:"Nommée N-1, mais une branche calcule la période courante"});
    if(/M-1/i.test(m.name)&&vars.includes("vset_n-1")) m.issues.push({sev:"bad",txt:"Nommée M-1, mais calcule N-1 (vSET_N-1)"});
    walk(m.ast,n=>{ const br=branches(n); if(br.length>1){ const sigs=br.map(b=>{ const s=[]; walk(b,x=>{ if(x.t==="agg") s.push(aggSig(x)); }); return s.sort().join(" + "); }); if(new Set(sigs).size>1) m.issues.push({sev:"bad",txt:"Les branches mois / année ne filtrent pas les mêmes catégories"}); } });
    m.aggs.forEach(a=>{ if(a.fn!=="sum"||!a.set) return; parseSet(a.set).forEach(e=>{ if(e.k==="fld"&&e.f==="LIB_Categorie"&&e.vals.some(v=>/moyen/i.test(v))) m.issues.push({sev:"warn",txt:`Somme de « ${e.vals.find(v=>/moyen/i.test(v))} » : sur plusieurs mois, on additionne des moyennes`}); }); });
    m.aggs.forEach(a=>{ if(a.fn!=="sum"||!a.set) return; const els=parseSet(a.set); if(els.some(x=>x.k==="fld"&&x.f==="TYP_UNITE")) return; els.forEach(x=>{ if(x.k==="fld"&&x.f==="%COD_CATEGORIE"&&x.op==="-="){ const kept=["DISTANCE","JOUR"].filter(c=>(!knownCods||knownCods.has(c))&&!x.vals.includes(c)); if(kept.length) m.issues.push({sev:"bad",txt:`Somme « tout sauf … » : garde ${kept.join(", ")}, donc des km ou des jours s'ajoutent aux euros (filtrer TYP_UNITE={'€'})`}); } }); });
    if(knownCods){ const unk=new Set(); m.aggs.forEach(a=>a.set&&parseSet(a.set).forEach(e=>{ if(e.k==="fld"&&e.f==="%COD_CATEGORIE") e.vals.forEach(v=>{ if(!knownCods.has(v)) unk.add(v); }); })); if(unk.size) m.issues.push({sev:"warn",txt:"Code(s) absent(s) du référentiel : "+[...unk].join(", ")}); }
    if(m.unsupported.length) m.issues.push({sev:"warn",txt:"Non calculable dans l'aperçu : "+[...new Set(m.unsupported)].join(", ")});
    const dupIssue=new Set(); m.issues=m.issues.filter(i=>!dupIssue.has(i.txt)&&dupIssue.add(i.txt));
  });
  // période dominante
  list.forEach(m=>{ const s=m.expr; m.period=/BudgetNextN/.test(s)?"Budget":/vSET_M-1/i.test(s)?"M-1":/vSET_N-1|-1\)/.test(s)?"N-1":/GetSelectedCount\(MoisVar\)/i.test(s)?"Mois (sinon année)":/AnneeVar/i.test(s)?"Année":m.composite?"—":"Toute la période"; });
  return {list,resolve};
}
/* évaluation sur les lignes FAITS */
function makeEval(cat, rows, dims, sel){
  const years=rows.map(r=>r.annee); const maxAnnee=years.length?Math.max(...years):null;
  const monthsOf=a=>rows.filter(r=>r.annee===a).map(r=>r.mois);
  const curM=sel.mois||(monthsOf(sel.annee).length?Math.max(...monthsOf(sel.annee)):12);
  const shift=(a,m,k)=>{ let t=a*12+(m-1)+k; return [Math.floor(t/12),t%12+1]; };
  const periodPred=v=>{ v=v.toLowerCase();
    if(v==="vset_m") return r=>r.annee===sel.annee&&r.mois===curM;
    if(v==="vset_m-1"){ const [a,m]=shift(sel.annee,curM,-1); return r=>r.annee===a&&r.mois===m; }
    if(v==="vset_n-1") return r=>r.annee===sel.annee-1&&r.mois===curM;
    if(v==="vmaxannee") return r=>r.annee===maxAnnee;
    if(v==="vmaxannee-1") return r=>r.annee===maxAnnee-1;
    if(v==="vmaxanneevar") return r=>r.annee===sel.annee;
    if(v==="vmaxanneevar-1") return r=>r.annee===sel.annee-1;
    throw new Unsup("variable "+v); };
  const fieldOf=(r,f)=>{
    switch(f){ case "%COD_CATEGORIE": return r.cod; case "LIB_Categorie": return r.lib; case "MontantReel": return r.MontantReel; case "BudgetNextN": return r.BudgetNextN; case "MontantLoc": return r.MontantLoc;
      case "%KEY_VEHICULE": return r.veh; case "%KEY_CHAUFFEUR": return r.chauf; case "%LIB_SITE": return r.site; case "LIB_CLIENT": return r.client; case "TYP_UNITE": return r.unite; case "Annee": return r.annee; case "Mois": return r.mois; }
    const v=dims.veh.get(r.veh); if(v&&f in v) return v[f]; const c=dims.chauf.get(r.chauf); if(c&&f in c) return c[f]; return null; };
  const setCache=new Map();
  const setRows=raw=>{ if(raw==null) return rows; if(setCache.has(raw)) return setCache.get(raw);
    const preds=parseSet(raw).map(e=>{ if(e.k==="var") return periodPred(e.v); if(e.k==="fld"){ const vs=new Set(e.vals); return e.op==="="?(r=>vs.has(String(fieldOf(r,e.f)??""))):(r=>!vs.has(String(fieldOf(r,e.f)??""))); } throw new Unsup("ensemble"); });
    const out=rows.filter(r=>preds.every(p=>p(r))); setCache.set(raw,out); return out; };
  const memo=new Map(), stack=new Set();
  const num=v=>v==null||v===""?null:typeof v==="number"?v:(isNaN(parseFloat(String(v).replace(",",".")))?null:parseFloat(String(v).replace(",",".")));
  function ev(n){
    switch(n.t){
      case "num": return n.v;
      case "str": return n.v;
      case "neg": { const a=num(ev(n.a)); return a==null?null:-a; }
      case "bin": { if(n.op==="&") return String(ev(n.a)??"")+String(ev(n.b)??""); const a=num(ev(n.a)), b=num(ev(n.b)); if(a==null||b==null) return null; if(n.op==="+")return a+b; if(n.op==="-")return a-b; if(n.op==="*")return a*b; return b===0?null:a/b; }
      case "cmp": { const a=num(ev(n.a)), b=num(ev(n.b)); if(a==null||b==null) return 0; return ({">":a>b,"<":a<b,"=":a===b,">=":a>=b,"<=":a<=b,"<>":a!==b})[n.op]?1:0; }
      case "ref": { const m=cat.resolve(n.v); if(!m) throw new Unsup("référence ["+n.v+"]"); return evalMeasure(m); }
      case "dollar": throw new Unsup("$("+n.v+")");
      case "field": throw new Unsup("champ "+n.v);
      case "call": {
        if(n.fn==="if"){ const c=num(ev(n.args[0])); return c?ev(n.args[1]):(n.args[2]?ev(n.args[2]):null); }
        if(n.fn==="getselectedcount"){ const f=n.args[0]&&n.args[0].v; return f==="MoisVar"?(sel.mois?1:0):f==="AnneeVar"?1:0; }
        if(n.fn==="num#"||n.fn==="num") return num(ev(n.args[0]));
        throw new Unsup(n.fn);
      }
      case "agg": {
        const f=n.arg&&(n.arg.t==="field"||n.arg.t==="ref")?n.arg.v:null; if(!f) throw new Unsup("agrégation d'expression");
        const rs=setRows(n.set); const vals=rs.map(r=>fieldOf(r,f)).filter(v=>v!=null&&v!=="");
        if(n.fn==="count") return n.distinct?new Set(vals.map(String)).size:vals.length;
        const nv=vals.map(num).filter(v=>v!=null);
        if(n.fn==="sum") return nv.reduce((s,v)=>s+v,0);
        if(n.fn==="avg") return nv.length?nv.reduce((s,v)=>s+v,0)/nv.length:null;
        if(n.fn==="min") return nv.length?Math.min(...nv):null;
        if(n.fn==="max") return nv.length?Math.max(...nv):null;
      }
    }
    throw new Unsup(n.t);
  }
  function evalMeasure(m){
    if(memo.has(m.id)) return memo.get(m.id);
    if(!m.ast) throw new Unsup("expression illisible");
    if(stack.has(m.id)) throw new Unsup("référence circulaire");
    stack.add(m.id); try{ const v=ev(m.ast); memo.set(m.id,v); return v; } finally{ stack.delete(m.id); }
  }
  return m=>{ try{ return {v:evalMeasure(m)}; }catch(e){ if(e instanceof Unsup) return {err:e.message}; return {err:"erreur : "+e.message}; } };
}
function Unsup(msg){ this.message=msg; }
/* couverture : quelles catégories une mesure exige, et sont-elles présentes dans FAITS */
function measureNeeds(m){
  const needs=[];
  (m.aggs||[]).forEach(a=>{ const f=a.arg&&a.arg.v; const fl=a.set?parseSet(a.set).filter(e=>e.k==="fld"&&(e.f==="%COD_CATEGORIE"||e.f==="LIB_Categorie")):[]; needs.push({field:f,filters:fl}); });
  return needs;
}
function coverage(cat, rows){
  const cods=new Set(), libs=new Set(), byField={MontantReel:new Set(),BudgetNextN:new Set(),MontantLoc:new Set()};
  rows.forEach(r=>{ cods.add(r.cod); libs.add(r.lib); ["MontantReel","BudgetNextN","MontantLoc"].forEach(f=>{ if(r[f]!=null){ byField[f].add("c:"+r.cod); byField[f].add("l:"+r.lib); byField[f].add("*"); } }); });
  const res=new Map();
  const st=(m,stack=new Set())=>{
    if(res.has(m.id)) return res.get(m.id);
    if(!m.ast){ res.set(m.id,{s:"err"}); return res.get(m.id); }
    if(stack.has(m.id)) return {s:"err"}; stack.add(m.id);
    let fed=0,tot=0; const miss=new Set();
    measureNeeds(m).forEach(n=>{
      const fset=byField[n.field]||null;
      n.filters.forEach(fl=>{
        if(fl.op==="-="){ tot++; if(fset?fset.has("*"):rows.length) fed++; else miss.add("toutes sauf "+fl.vals.length); return; }
        fl.vals.forEach(v=>{ tot++; const key=(fl.f==="%COD_CATEGORIE"?"c:":"l:")+v; const ok=fset?fset.has(key):(fl.f==="%COD_CATEGORIE"?cods.has(v):libs.has(v)); if(ok) fed++; else miss.add(v); });
      });
      if(!n.filters.length){ tot++; if(fset?fset.has("*"):rows.length) fed++; else miss.add(n.field||"données"); }
    });
    let bad=false; m.refs.forEach(r=>{ const t=cat.resolve(r); if(!t){ bad=true; return; } const s=st(t,stack); if(s.s==="ok"){ tot++; fed++; } else if(s.s==="part"){ tot++; fed+=.5; (s.miss||[]).forEach(x=>miss.add(x)); } else if(s.s==="none"){ tot++; (s.miss||[]).forEach(x=>miss.add(x)); } else bad=true; });
    const s=bad?"err":tot===0?"none":fed===tot?"ok":fed>0?"part":"none";
    const out={s,miss:[...miss]}; res.set(m.id,out); return out;
  };
  cat.list.forEach(m=>st(m));
  return res;
}
if(typeof module!=="undefined") module.exports={parseCatalogue,qParse,parseSet,analyseCatalogue,makeEval,coverage,Unsup};
