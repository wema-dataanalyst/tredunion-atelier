/* File de tâches par clé (un adhérent) : une à la fois, regroupées si elles s'accumulent. */
export function creerFile() {
  const etats = new Map(); // clé → { courant: Promise | null, encore: boolean, tache }
  return {
    declencher(cle, tache) {
      let e = etats.get(cle); if (!e) etats.set(cle, e = { courant: null, encore: false, tache: null });
      e.tache = tache;
      if (e.courant) { e.encore = true; return e.courant; }
      e.courant = (async () => {
        try {
          do { e.encore = false; const t = e.tache; await new Promise(r => setImmediate(r)); try { await t(); } catch (x) { console.error(x); } } while (e.encore);
        } finally { e.courant = null; }
      })();
      return e.courant;
    },
    attendre: cle => etats.get(cle)?.courant || Promise.resolve(),
  };
}
