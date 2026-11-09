# Apprendre de la séance

Après la séance, fait entrer dans la mémoire commune ce que l'adhérent a confirmé ou démenti.

1. Pour chaque point de `generated/fiche_seance.md` tranché en séance, passe l'hypothèse à `valide: true` (confirmée) ou `refuse: true` (démentie).
2. `npm run check`.
3. `npm run apprendre` AVANT de corriger la spec pour une hypothèse démentie (une fois corrigée, le démenti disparaît et la mémoire ne l'apprendrait pas) : met à jour `comptes.yml` et `colonnes.yml` de la mémoire et affiche ce qui a été confirmé ou contredit.
4. Si une hypothèse est démentie, corrige maintenant la spec selon la réponse, avec une nouvelle hypothèse `valide: true`, puis relance `npm run check`.
5. Ajoute l'entrée de `spec/journal.yml` et résume en deux lignes.
