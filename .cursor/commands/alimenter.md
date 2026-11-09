# Alimenter le dashboard

Propose les flux vers FAITS qui débloquent le plus de mesures.

1. Lance `npm run couverture` : liste des catégories manquantes, classées par nombre de mesures débloquées.
2. Pour les 3 premières, cherche dans les datasets documentés une colonne qui peut les produire : nom, unité, profil.
3. Présente pour chacune :
   - le dataset et la colonne ;
   - la catégorie visée ;
   - les axes (date, véhicule, chauffeur, site) ;
   - ce qui reste à confirmer avec l'adhérent.

   Ne crée aucun flux tant que Michel n'a pas validé.
4. Après validation :
   - écris les fichiers `spec/flux/<id>.yml` (ids f1, f2… à la suite) ;
   - lance `npm run check` ;
   - ajoute l'entrée de journal ;
   - annonce les mesures alimentées avant → après.
