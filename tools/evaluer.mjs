function sigFlux(flux) {
  const s = new Set();
  (flux || []).forEach(f => {
    const champ = f.champ || "MontantReel";
    if (f.codMode === "regles") (f.rules || []).forEach(r => s.add(`${f.ds}|${r.prefix}|${r.cod}|${champ}`));
    else if (f.codMode === "colonne") s.add(`${f.ds}|${f.codCol}|*|${champ}`);
    else s.add(`${f.ds}|${f.valeur}|${f.cod}|${champ}`);
  });
  return s;
}

function sigCodes(datasets) {
  const s = new Set();
  (datasets || []).forEach(d => (d.columns || []).forEach(c => Object.keys(c.codes || {}).forEach(k => s.add(`${d.id}.${c.name}.${k}`))));
  return s;
}

const egal = (a, b) => a === b;

// Deux règles de compte se valent si l'un des préfixes prolonge l'autre (7061 et 706100).
function prefixeCompatible(a, b) {
  const [da, pa, ...ra] = a.split("|"), [db, pb, ...rb] = b.split("|");
  return da === db && ra.join("|") === rb.join("|") && /^\d+$/.test(pa) && /^\d+$/.test(pb) && (pa.startsWith(pb) || pb.startsWith(pa));
}

function ecart(obtenu, attendu, pareil = egal) {
  const dans = (x, s) => [...s].some(y => pareil(x, y));
  const trouves = [...attendu].filter(x => dans(x, obtenu)).length;
  return { attendus: attendu.size, trouves, taux: attendu.size ? trouves / attendu.size : 1, manquants: [...attendu].filter(x => !dans(x, obtenu)), en_plus: [...obtenu].filter(x => !dans(x, attendu)) };
}

export function comparer(spec, corrige) {
  return { flux: ecart(sigFlux(spec.flux), sigFlux(corrige.flux), (a, b) => a === b || prefixeCompatible(a, b)), codes: ecart(sigCodes(spec.datasets), sigCodes(corrige.datasets)) };
}
