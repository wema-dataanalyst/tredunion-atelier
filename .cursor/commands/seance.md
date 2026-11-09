# Séance avec l'adhérent

Michel est en visio avec l'adhérent et te relaie ses réponses dans le chat. Une question à la fois.

1. **Choisir le lot.** `npm run questions` : prends le lot ouvert de plus fort impact (le premier), sauf si Michel en demande un autre.
2. **Présenter une question** (`npm run question -- <dataset>#<id>` pour le profil d'une question de dataset), en 4 lignes au plus :
   - la question, pour un exploitant transport, sans jargon data ;
   - ce que montrent les données (en nombres, jamais une valeur pii) ;
   - ton hypothèse en une phrase ;
   - ce que la réponse changera dans la spec.
   Puis arrête-toi et attends la réponse.
3. **Enregistrer la réponse à sa source** :
   - question de dataset : `answer` (résumé fidèle) et `done: true` ;
   - hypothèse : `valide: true` ou `refuse: true`, et `reponse` ;
   - contrôle : `reponse` ;
   - fichier non lu, valeurs hors recette : registre seulement.
   Puis modifie la spec en conséquence (colonnes, règles, flux, contrôles). Ne supprime jamais un bloc `hypothese` démenti avant d'avoir écrit sa réponse au registre.
4. **Ajouter au registre** `spec/reponses.yml` (à la fin, sans rien effacer) :
   `id` (celui affiché par `npm run questions`), `question` (texte exact), `element`, `reponse`, `date`, `effet` (ce qui a changé dans la spec, en une ligne). Puis `npm run check` et corrige toute erreur.
5. **Doute nouveau** : une nouvelle question dans le dataset concerné (id suivant), pas de supposition.
6. **Fin du lot** : `npm run build` (s'il reste une erreur, signale-la à Michel, ne la contourne pas), une entrée dans `spec/journal.yml` pour le lot, puis l'effet en deux lignes (lignes FAITS, mesures alimentées avant → après). Propose le lot suivant.
