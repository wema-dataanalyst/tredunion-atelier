# Nouveau dataset

Ajoute un export bronze de l'adhérent à la spec.

1. L'argument est le chemin du CSV (dans `data/bronze/<societe>/`). Si la société n'existe pas dans `spec/projet.yml`, demande à Michel son nom et le logiciel source, puis ajoute-la.
2. Lance `npm run profil -- <csv> --societe <id>`.
3. Ouvre le fichier créé. À partir des noms de colonnes et du profil (`npm run question` sur ses questions) :
   - propose un `role` (key, fk, measure) quand c'est évident ;
   - marque `pii: true` les noms, prénoms, numéros de carte ou de téléphone ;
   - laisse `desc` vide quand le sens n'est pas certain, et ajoute une question à la place ;
   - repère les colonnes qui ressemblent à des identifiants déjà présents dans d'autres datasets, et ajoute une question de rapprochement.
4. Lance `npm run check`, puis résume en 3 lignes :
   - ce que contient le dataset ;
   - les questions ouvertes ;
   - les catégories du dashboard qu'il pourrait alimenter.
