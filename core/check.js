/* ───────────── contrôle de la spec ───────────── */
const MOTS_SQL=new Set("and or not in is null like ilike between true false case when then else end as from date timestamp integer numeric text interval current_date extract year month day cast coalesce lower upper trim".split(" "));
function identifiantsSql(sql){ return [...new Set((String(sql||"").replace(/'(?:[^']|'')*'/g,"''").replace(/::\s*\w+/g,"").match(/\b[a-z_]\w*\b(?!\s*\()/gi)||[]).filter(x=>!MOTS_SQL.has(x.toLowerCase())))]; }
/* Renvoie des constats rattachés à un fichier de spec, pour l'agent (CLI) et pour la vue (bandeau). */
function checkSpec(){
  const out=[]; const add=(niv,fichier,msg)=>out.push({niv,fichier,msg});
  const st=S.st; const codes=new Set(st.categories.map(c=>c.cod).concat((st.propositions||[]).flatMap(p=>(p.codes||[]).map(c=>c&&c.cod))));
  const dsFile=d=>`spec/datasets/${d.id}.yml`;
  st.datasets.forEach(d=>{
    const f=dsFile(d);
    if(!SOC(d.societe)) add("erreur",f,`société « ${d.societe} » absente de spec/projet.yml`);
    if(d._fileMissing) add("erreur",f,`fichier de données introuvable : ${d.file}`);
    if(d._tronque) add("alerte",f,`aperçu limité aux ${d.rows.length} premières lignes du fichier : sommes, contrôles et FAITS de l'aperçu sont partiels (le projet dbt lit le fichier entier)`);
    (d._notInCsv||[]).forEach(c=>add("erreur",f,`colonne « ${c} » décrite dans la spec mais absente du CSV`));
    (d._notInSpec||[]).forEach(c=>add("alerte",f,`colonne « ${c} » présente dans le CSV mais pas dans la spec`));
    d.columns.forEach(c=>{
      if(c.type&&!TYPES.includes(c.type)) add("erreur",f,`${c.name} : type « ${c.type} » inconnu (${TYPES.join(", ")})`);
      if(c.role&&!ROLES[c.role]) add("erreur",f,`${c.name} : rôle « ${c.role} » inconnu (${Object.keys(ROLES).join(", ")})`);
      const p=d._prof[c.name]; if(c.role==="key"&&p&&!p.unique) add("alerte",f,`${c.name} est déclarée clé mais n'est pas unique (${p.distinct} valeurs distinctes pour ${p.n-p.nulls} non vides)`);
      if(c.type&&p&&p.n&&p.guess!==c.type&&!(c.type==="text")&&!(c.type==="decimal"&&p.guess==="int")) add("alerte",f,`${c.name} : type « ${c.type} » déclaré, « ${p.guess} » détecté dans les données`);
    });
    const sr=silverRows(d); sr.unparsed.forEach(sql=>add("info",f,`règle non interprétée dans la prévisualisation (appliquée en SQL) : ${sql}`));
    const silver=new Set(["societe_key"]), ignorees=new Set(d.columns.filter(c=>c.role==="ignore").map(c=>c.name)); d.columns.filter(c=>c.role!=="ignore").forEach(c=>{ silver.add(c.name); if(c.codes) silver.add(c.name+"_libelle"); });
    d.rules.forEach((r,i)=>identifiantsSql(r.sql).filter(x=>!silver.has(x)).forEach(x=>ignorees.has(x)?add("erreur",f,`${d.id}#regle${i+1} : règle sur une colonne ignorée : ${x}`):add("alerte",f,`${d.id}#regle${i+1} : règle sur une colonne inconnue : ${x}`)));
    d.questions.forEach(q=>{ if(!q.id) add("alerte",f,`question sans id : « ${q.text} »`); });
  });
  const idsProjet=new Set();
  (st.questions||[]).forEach(q=>{
    const f="spec/projet.yml";
    if(!q.id) return add("erreur",f,"question d'adhérent : id manquant");
    if(!String(q.text||"").trim()) add("erreur",f,`question ${q.id} : texte manquant`);
    if(idsProjet.has(q.id)) add("erreur",f,`question ${q.id} : id en double`); idsProjet.add(q.id);
  });
  const idsGroupes=new Set();
  (st.perimetre||[]).forEach(g=>{
    const f="spec/perimetre.yml";
    if(!g.id) return add("erreur",f,"groupe de périmètre : id manquant");
    if(idsGroupes.has(g.id)) add("erreur",f,`groupe ${g.id} : id en double`); idsGroupes.add(g.id);
    if(!String(g.cause||"").trim()) add("erreur",f,`groupe ${g.id} : cause manquante`);
    if(!g.hypothese) add("erreur",f,`groupe ${g.id} : hypothèse manquante`);
    (g.mesures||[]).forEach(n=>{ if(!CAT().resolve(n)) add("alerte",f,`groupe ${g.id} : mesure inconnue du catalogue « ${n} »`); });
  });
  const idsProp=new Set();
  (st.propositions||[]).forEach(p=>{ const f="spec/mesures.yml";
    if(!p.id) return add("erreur",f,"proposition de mesures : id manquant");
    if(idsProp.has(p.id)) add("erreur",f,`proposition ${p.id} : id en double`); idsProp.add(p.id);
    if(!p.hypothese) add("erreur",f,`proposition ${p.id} : hypothèse manquante`);
    erreursProposition(p,st).forEach(m=>add("erreur",f,`proposition ${p.id} : ${m}`)); });
  const libs=new Map();
  (st.categories||[]).forEach(c=>{ const f="spec/referentiel.yml"; if(c.lib===undefined||c.lib==="") return;
    if(String(c.lib).length>60) add("erreur",f,`catégorie ${c.cod} : libellé trop long (60 caractères au plus)`);
    const k=String(c.lib).trim().toLowerCase(); if(libs.has(k)) add("alerte",f,`catégories ${libs.get(k)} et ${c.cod} : même libellé « ${c.lib} »`); else libs.set(k,c.cod); });
  st.relations.forEach(r=>{
    const f="spec/relations.yml";
    if(!colIndex(r.from)) return add("erreur",f,`${r.id||"?"} : colonne inconnue ${r.from}`);
    if(!colIndex(r.to)) return add("erreur",f,`${r.id||"?"} : colonne inconnue ${r.to}`);
    if(r.kind&&!KINDS[r.kind]) add("erreur",f,`${r.id} : nature « ${r.kind} » inconnue (${Object.keys(KINDS).join(", ")})`);
    if(r.norm&&!NORMS[r.norm]) add("erreur",f,`${r.id} : normalisation « ${r.norm} » inconnue (${Object.keys(NORMS).join(", ")})`);
    const m=matchRate(r); if(m&&m.rate<.98) add(m.rate<.8?"alerte":"info",f,`${r.id} : ${(m.rate*100).toFixed(1)} % de ${r.from} retrouvés dans ${r.to}. Non retrouvées : ${m.miss.slice(0,5).map(x=>x[0]).join(", ")}`);
  });
  const fa=buildFaits();
  st.flux.forEach(fl=>{
    const f=`spec/flux/${fl.id}.yml`; const d=DS(fl.ds);
    if(!d) return add("erreur",f,`dataset « ${fl.ds} » inconnu`);
    const cols=new Set(d.columns.map(c=>c.name)); d.columns.forEach(c=>{ if(c.codes) cols.add(c.name+"_libelle"); });
    ["date","vehicule","chauffeur","client","collaborateur","codCol","libCol"].forEach(k=>{ if(fl[k]&&!cols.has(fl[k])) add("erreur",f,`${k} : colonne « ${fl[k]} » absente de ${d.id}`); });
    if(fl.site&&!/^'.*'$/.test(String(fl.site).trim())&&!cols.has(fl.site)) add("erreur",f,`site : « ${fl.site} » n'est ni une colonne de ${d.id} ni un texte entre apostrophes`);
    if(!["fixe","regles","colonne"].includes(fl.codMode)) add("erreur",f,`codMode « ${fl.codMode} » inconnu (fixe, regles, colonne)`);
    if(!CHAMPS.includes(fl.champ)) add("erreur",f,`champ « ${fl.champ} » inconnu (${CHAMPS.join(", ")})`);
    if(!AGGS[fl.agg]) add("erreur",f,`agg « ${fl.agg} » inconnue (${Object.keys(AGGS).join(", ")})`);
    if(!fl.date) add("erreur",f,"date manquante : FAITS est mensuel");
    const used=fl.codMode==="fixe"?[fl.cod]:fl.codMode==="regles"?(fl.rules||[]).map(r=>r.cod):[];
    used.filter(c=>c&&!codes.has(c)).forEach(c=>add("alerte",f,`code « ${c} » absent de spec/referentiel.yml`));
    if(fl.codMode==="regles"){ const px=(fl.rules||[]).map(r=>String(r.prefix??""));
      px.forEach((p,j)=>{ const i=px.findIndex((q,k)=>k<j&&q!==""&&p.startsWith(q)); if(i>=0) add("alerte",f,`règle ${p} jamais atteinte : la règle ${px[i]}, placée avant, prend déjà ces comptes (placez les préfixes longs en premier)`); }); }
    const s=fa.stats[fl.id]||{};
    if(s.badVal) add("erreur",f,`valeur « ${fl.valeur} » non calculable (colonne ou opération simple entre colonnes)`);
    if(s.filterWarn) add("info",f,`filtre non interprété dans la prévisualisation (appliqué en SQL) : ${fl.filtre}`);
    if(s.unclassified) add("alerte",f,`${s.unclassified} lignes sans catégorie (aucune règle ne correspond)`);
    if(s.noDate) add("alerte",f,`${s.noDate} lignes sans date lisible`);
    if(s.noVal) add("alerte",f,`${s.noVal} lignes sans valeur numérique`);
    if(!s.n&&!s.badVal) add("alerte",f,"aucune ligne FAITS produite");
  });
  st.gold.filter(t=>t.kind==="dim"&&!t.generated).forEach(t=>{
    const f=`spec/dims/${t.id}.yml`;
    t.columns.forEach(c=>Object.entries(c.map||{}).forEach(([sid,e])=>{ if(!SOC(sid)) add("erreur",f,`${c.name} : société « ${sid} » inconnue`);
      const re=/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi; let m; while((m=re.exec(e))){ const d=DS(m[1]); if(d&&!d.columns.some(x=>x.name===m[2]||x.name+"_libelle"===m[2])) add("erreur",f,`${c.name} : colonne ${m[1]}.${m[2]} inconnue`); } }));
  });
  CTRL().forEach(r=>add(r.statut==="erreur"?"erreur":r.statut==="ecart"?"alerte":"info","spec/controles.yml",`${r.id}${r.libelle&&r.libelle!==r.id?" "+r.libelle:""} : ${r.msg}`));
  const hyps=listeHypotheses(), cibles=new Set(hyps.map(h=>h.cible));
  hyps.forEach(h=>{
    if(!/^(agent|memoire:(logiciels|comptes|colonnes)\/.+)$/.test(h.source)) add("erreur",h.fichier,`${h.cible} : source « ${h.source} » invalide (agent ou memoire:<logiciels|comptes|colonnes>/<id>)`);
    else if(h.source.startsWith("memoire:")&&!entreeMemoire(h.source)) add("erreur",h.fichier,`${h.cible} : entrée de mémoire introuvable (${h.source})`);
    if(!h.preuvesListe) add("erreur",h.fichier,`${h.cible} : preuves doit être une liste`);
    if(h.valide&&h.refuse) add("erreur",h.fichier,`${h.cible} : valide et refuse ne peuvent pas être vrais ensemble`);
  });
  st.flux.forEach(fl=>(fl.rules||[]).forEach(r=>{ const e=r.hypothese&&entreeMemoire(r.hypothese.source); if(!e||!/^memoire:comptes\//.test(r.hypothese.source)) return;
    if(e.cod!==r.cod) add("erreur",`spec/flux/${fl.id}.yml`,`flux:${fl.id}#${r.prefix} : la mémoire comptes/${e.id} donne le code « ${e.cod} », la règle « ${r.cod} »`);
    if(!String(r.prefix).startsWith(String(e.id))) add("erreur",`spec/flux/${fl.id}.yml`,`flux:${fl.id}#${r.prefix} : le préfixe ne commence pas par l'id de mémoire ${e.id}`); }));
  (st.controles||[]).forEach(c=>{ if(c.porte_sur==null) return;
    if(!Array.isArray(c.porte_sur)) return add("erreur","spec/controles.yml",`${c.id||"?"} : porte_sur doit être une liste`);
    c.porte_sur.filter(t=>!cibles.has(t)).forEach(t=>add("alerte","spec/controles.yml",`${c.id||"?"} : porte_sur « ${t} » ne correspond à aucune hypothèse`)); });
  if(!Array.isArray(st.reponses)) add("erreur","spec/reponses.yml","spec/reponses.yml doit être une liste");
  else st.reponses.forEach((r,i)=>{ if(!idScalaire(r)||!String(r.reponse||"").trim()) add("alerte","spec/reponses.yml",`réponse ${idScalaire(r)?r.id:"n°"+(i+1)} : id ou reponse manquant`); });
  (st._orphelines||[]).forEach(o=>add("alerte","spec/reponses.yml",`réponse orpheline ${o.id} (${o.op||"?"} ${o.cible||""}) : ${o.msg}`));
  listeQuestions().filter(q=>q.statut==="ouverte"&&["codes","choix","exclure"].includes(q.type)).forEach(q=>{ const fo=q.formulaire;
    const e=q.type==="codes"?!colIndex(fo.cible)&&`colonne introuvable : ${fo.cible}`:q.type==="exclure"?erreurModif({op:"exclure",cible:fo.cible,sql:fo.sql},S.st,true)
      :!fo.options.length?"aucune option":fo.options.map(o=>erreurModif({op:"definir",cible:fo.cible,valeur:o.valeur},S.st,true)).find(Boolean);
    if(e) add("alerte",q.fichier,`${q.id} : formulaire inutilisable (${e})`); });
  piiFuites().forEach(x=>add("erreur",x.fichier,`${x.cible} : contient une valeur de la colonne personnelle ${x.col}`));
  dbtJinjaInterdit().forEach(p=>add("erreur",`generated/${p}`,"contiendrait du Jinja venu de la spec (seuls source() et ref() sont admis) : retirez les { } des règles, filtres, codes et libellés"));
  if(!st.catalogue.trim()) add("alerte","spec/catalogue/elements_principaux.txt","catalogue vide");
  // Thème coché sans mesure alimentée
  const besoins = S.st.besoins || { themes: [], libres: [] };
  besoins.themes.filter(t => t.choisi).forEach(t => {
    const theme = THEMES().find(x => x.id === t.id);
    if (!theme || !theme.mesures.length) return; // feuilles du dashboard absentes (serveur) : rien à juger
    const cov = COV();
    const alim = theme.mesures.some(n => {
      const m = CAT().list.find(x => x.name === n);
      return m && (cov.get(m.id)?.s === "ok" || cov.get(m.id)?.s === "part");
    });
    if (!alim) add("erreur", `theme:${t.id}`, `Thème « ${theme.title} » coché mais aucune mesure alimentée`);
  });

  // Besoin libre sans proposition
  besoins.libres.forEach(b => {
    add("alerte", "besoins", `Besoin libre « ${b.text} » sans proposition de mesure associée`);
  });
  // Proposition KPI sans flux
  (S.st.propositions || []).filter(p => p.hypothese?.source?.startsWith("kpi:") && p.hypothese?.valide).forEach(p => {
    const codes = (p.codes || []).map(c => c.cod);
    const alim = codes.some(cod => S.st.flux.some(f => f.cod === cod || (f.rules || []).some(r => r.cod === cod)));
    if (!alim) add("alerte", `proposition:${p.id}`, `Proposition « ${p.id} » créée par KPI mais aucun flux ne l'alimente`);
  });
  return out;
}
function check(){
  return checkSpec().map(e=>({...e,niveau:e.niv,message:e.fichier?`${e.fichier}: ${e.msg}`:e.msg,cible:e.fichier}));
}
function piiFuites(){ return cached("pii",()=>{
  const cellules=new Map(); S.st.datasets.forEach(d=>d.columns.forEach((c,k)=>{ if(!c.pii) d.rows.forEach(r=>{ const x=String(r[k]??"").trim().toLowerCase(); new Set([x,...x.split(/[^\p{L}\p{N}]+/u)]).forEach(w=>{ const s=cellules.get(w)||new Set(); if(s.size<5) s.add(x); cellules.set(w,s); }); }); }));
  const pub={has:w=>(cellules.get(w)?.size||0)>=5};
  const vals=[]; S.st.datasets.forEach(d=>d.columns.forEach((c,k)=>{ if(!c.pii) return; const v=new Set();
    d.rows.forEach(r=>{ const x=String(r[k]??"").trim().toLowerCase(); if(x.length>=4&&isNaN(Number(x.replace(",",".")))&&!pub.has(x)) v.add(x); });
    if(v.size) vals.push({col:`${d.id}.${c.name}`,v:[...v]}); }));
  const out=[]; if(!vals.length) return out;
  const test=(cible,fichier,t)=>{ const s=String(t||"").toLowerCase(); const mot=x=>{ let i=s.indexOf(x); while(i>=0){ if(!/[\p{L}\p{N}]/u.test(s[i-1]||"")&&!/[\p{L}\p{N}]/u.test(s[i+x.length]||"")) return true; i=s.indexOf(x,i+1); } return false; };
    if(s) vals.forEach(p=>{ if(p.v.some(mot)) out.push({cible,fichier,col:p.col}); }); };
  listeHypotheses().forEach(h=>{ [h.question,h.reponse,h.form.sql,...h.preuves,...h.form.options.map(o=>JSON.stringify(o))].forEach(t=>test(h.cible,h.fichier,t)); });
  S.st.datasets.forEach(d=>{ const f=`spec/datasets/${d.id}.yml`; d.columns.forEach(c=>test(`${d.id}.${c.name}`,f,c.desc)); d.rules.forEach((r,i)=>{ test(`${d.id}#regle${i+1}`,f,r.text); test(`${d.id}#regle${i+1}`,f,r.sql); });
 d.questions.forEach(q=>{ const c=`${d.id}#${q.id}`; test(c,f,q.text); test(c,f,q.answer); test(c,f,q.sql); (Array.isArray(q.options)?q.options:[]).forEach(o=>test(c,f,JSON.stringify(o))); });
 });
  S.st.flux.forEach(fl=>test(`flux:${fl.id}`,`spec/flux/${fl.id}.yml`,fl.filtre));
  (S.st.controles||[]).forEach(c=>test(`controle:${c.id}`,"spec/controles.yml",c.reponse));
  (Array.isArray(S.st.reponses)?S.st.reponses:[]).filter(idScalaire).forEach(r=>["question","reponse","interprete","effet","par"].map(k=>r[k]).concat(JSON.stringify(r.modifs)).forEach(t=>test(`reponse:${r.id}`,"spec/reponses.yml",t)));
  return out.filter((x,i)=>out.findIndex(y=>y.cible===x.cible&&y.col===x.col)===i);
}); }
function summary(){
  const mc=measureCounts(); const open=listeQuestions().filter(q=>q.statut==="ouverte");
  const hyp={confirme:0,haute:0,moyenne:0,basse:0}; listeHypotheses().forEach(h=>hyp[h.confiance]++);
  return {mesures:mc,questionsOuvertes:open.length,lignesFaits:buildFaits().rows.length,flux:S.st.flux.length,datasets:S.st.datasets.length,hypotheses:hyp};
}
