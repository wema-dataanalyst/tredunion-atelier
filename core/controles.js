/* ───────────── contrôles croisés entre sources ───────────── */
const CTRL_TYPES=["ecart_somme","rapprochement","mensuel"];
function sommeCote(c,annee){
  const d=c&&DS(c.ds); if(!d) return {err:`dataset « ${c&&c.ds} » inconnu`};
  const val=compileVal(c.valeur,d); if(!val) return {err:`valeur « ${c.valeur} » non calculable sur ${c.ds}`};
  const pf=parseCond(c.filtre); if(c.filtre&&!pf) return {err:`filtre non interprété : ${c.filtre}`};
  let s=0,n=0;
  silverRows(d).rows.forEach(o=>{ if(pf&&!pf(o)) return;
    if(annee!=null&&c.date){ const dt=o[c.date]; if(!(dt instanceof Date)||dt.getFullYear()!==+annee) return; }
    n++; const v=val(o); if(v!=null) s+=v; });
  return {s,n};
}
function runControle(c){
  const r={id:c.id||"?",type:c.type,libelle:c.libelle||c.id||"",porte_sur:Array.isArray(c.porte_sur)?c.porte_sur:[],statut:"erreur",msg:""};
  if(!c.id){ r.msg="id manquant"; return r; }
  if(!CTRL_TYPES.includes(c.type)){ r.msg=`type « ${c.type} » inconnu (${CTRL_TYPES.join(", ")})`; return r; }
  if(c.type==="ecart_somme"){
    const a=sommeCote(c.a,c.annee), b=sommeCote(c.b,c.annee); if(a.err||b.err){ r.msg=a.err||b.err; return r; }
    if(!a.n||!b.n||(!a.s&&!b.s)){ r.msg=`aucune ligne retenue ou sommes nulles (${a.n} lignes contre ${b.n})`; return r; }
    const tol=c.tolerance??0.05, ref=Math.max(Math.abs(a.s),Math.abs(b.s));
    r.a=a.s; r.b=b.s; r.ecart=ref?Math.abs(a.s-b.s)/ref:0; r.statut=r.ecart<=tol?"ok":"ecart";
    r.msg=`${fmtN(a.s)} contre ${fmtN(b.s)}, écart ${(r.ecart*100).toFixed(1)} % (tolérance ${Math.round(tol*100)} %)`; return r;
  }
  if(c.type==="rapprochement"){
    const m=matchRate({from:c.from,to:c.to,norm:c.norm||"none"}); if(!m){ r.msg=`colonnes ${c.from} ou ${c.to} introuvables ou vides`; return r; }
    const seuil=c.seuil??0.9; r.taux=m.rate; r.statut=m.rate>=seuil?"ok":"ecart";
    r.msg=`${(m.rate*100).toFixed(1)} % de ${c.from} retrouvés dans ${c.to} (seuil ${Math.round(seuil*100)} %)`; return r;
  }
  const d=DS(c.ds); if(!d){ r.msg=`dataset « ${c.ds} » inconnu`; return r; }
  const p=d.meta||{};
  if(!c.date){ r.statut="ecart"; r.msg=`${c.ds} n'a pas de date par ligne${p.periode_du?` : un seul bloc du ${p.periode_du} au ${p.periode_au}`:""}. FAITS est mensuelle.`; return r; }
  const mois=new Set(); silverRows(d).rows.forEach(o=>{ const dt=o[c.date]; if(dt instanceof Date&&!isNaN(dt)) mois.add(dt.getFullYear()*100+dt.getMonth()+1); });
  r.mois=mois.size; r.statut=mois.size>=2?"ok":"ecart"; r.msg=`${mois.size} mois distincts dans ${c.ds}.${c.date}`; return r;
}
function CTRL(){ return cached("ctrl",()=>(S.st.controles||[]).map(runControle)); }
