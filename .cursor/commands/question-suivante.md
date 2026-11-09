# Question suivante

Traite une question de la séance, selon la boucle d'AGENTS.md.

1. Si une question est indiquée après la commande (format `dataset#id`), prends-la. Sinon, lance `npm run questions` et `npm run couverture`, et choisis la question ouverte qui débloque le plus de mesures du dashboard. Dis en une ligne pourquoi tu la choisis.
2. Lance `npm run question -- <dataset>#<id>`.
3. Présente à Michel, en 4 lignes au plus :
   - la question formulée pour un exploitant transport ;
   - ce que montrent les données ;
   - ton hypothèse ;
   - ce que la réponse changera dans la spec.
4. Arrête-toi et attends la réponse de l'adhérent relayée par Michel.
5. À réception de la réponse :
   - mets à jour `spec/` ;
   - passe la question à `done: true` avec `answer` ;
   - ajoute la réponse à la fin du registre `spec/reponses.yml` (`id`, `question` texte exact, `element`, `reponse`, `date`, `effet`), comme à l'étape 4 de `/seance` ;
   - ajoute l'entrée de `spec/journal.yml` ;
   - lance `npm run check` et corrige les erreurs ;
   - annonce l'effet en deux lignes ;
   - propose la question suivante sans la traiter.
