# Sous-projet 3a : agent et interprétation du texte libre

Suite de `2026-11-08-plateforme-reponses-client-design.md` (section Agent serveur). 3a livre le socle de l'agent et la première tâche visible de l'adhérent : son texte libre est compris, reformulé, puis appliqué seulement s'il le valide. 3b (maquette automatique) et 3c (questions de suivi, apprentissage, fin des séances) suivront.

## Passerelle LLM

- Appel HTTP à la passerelle WeMa, API compatible OpenAI : `POST <LLM_BASE_URL>/v1/chat/completions`, en-tête `Authorization: Bearer <LLM_API_KEY>` (clé virtuelle), appel d'outils au format OpenAI.
- Configuration par l'environnement du service, jamais dans un dossier adhérent : `LLM_BASE_URL` (défaut `https://llm.wema.fr`), `LLM_API_KEY`, `LLM_MODEL` (alias du modèle côté passerelle, sans valeur par défaut). Sans `LLM_API_KEY` et `LLM_MODEL`, l'agent est désactivé : l'interface garde le comportement actuel (texte libre enregistré tel quel).
- Aucune dépendance npm nouvelle (`fetch` de Node). La clé n'apparaît jamais dans un message d'erreur, un journal ou une réponse HTTP. Délai d'un appel : 30 s.

## Parcours de l'adhérent

- Sur une question libre, ou via « Autre réponse », il écrit sa réponse et clique sur « Comprendre ». Rien n'est appliqué.
- La carte affiche « J'ai compris : … » : une phrase, puis la liste lisible des opérations (« Le statut A veut dire Annulée », « Les lignes annulées seront exclues ») et l'effet attendu (« mesures alimentées 38 → 41 »).
- Boutons : « C'est bien ça » (enregistre et applique), « Reformuler » (retour au texte), « Envoyer tel quel à WeMa » (texte seul, opération `noter`, comme aujourd'hui).
- Si l'agent ne comprend pas, il pose une question de précision (une phrase) et le texte reste modifiable.
- Agent désactivé ou en erreur : message « L'interprétation automatique n'est pas disponible, votre texte peut être envoyé tel quel à WeMa ».

## Moteur (`core/calque.js`, `tools/espace.mjs`)

- Nouvelle forme de saisie : `saisie.interpretation = {texte, comprehension, operations}`. `entreeReponse` produit alors l'entrée avec `reponse` = le texte du client, `modifs` = les opérations, `interprete` = la compréhension affichée, `origine: client`. Les opérations passent par `erreursModifs` (liste fermée `valider`, `codes`, `exclure`, `definir`, `fichier`, `noter`, aucune autre), 10 au plus ; la garde pii s'applique au texte et à la compréhension.
- `espace.previsualiser({id, saisie, par})` : comme `repondre` mais sans écrire au registre ; renvoie `{entree}` avec `effet`, ou `{erreurs}`.
- `espace.contexteAgent(id)` : question (texte, type, cible, options), dataset concerné, colonnes non personnelles avec profil (distinctes, % de vides, dix valeurs fréquentes). Les colonnes `pii: true` n'en font jamais partie.

## Agent (`server/agent/`)

- `llm.mjs` : `creerLlm({baseUrl, cle, modele, fetchImpl, delai})` → `{discuter({systeme, messages, outils}) → {message, usage}}`.
- `boucle.mjs` : boucle d'outils bornée (6 tours, 30 s au total, 20 000 jetons). Un outil hors liste, des arguments illisibles ou une opération invalide sont renvoyés au modèle comme résultat d'outil pour qu'il se corrige. Fin : `proposer` valide, `demander_precision`, ou réponse texte (traitée comme précision).
- `outils.mjs` (liés à un espace et à une question) : `lire_question()`, `profil_colonnes({dataset})` (colonnes non personnelles du dataset de la question seulement), `lire_memoire({colonne})` (entrées de `colonnes.yml` sans noms d'adhérents), `verifier_operations({operations})`, `proposer({comprehension, operations})`, `demander_precision({question})`.
- `interpreter.mjs` : `interpreter({espace, llm, id, texte}) → {comprehension, operations, effet} | {precision} | {erreurs}`. Prompt système en français (règles d'`AGENTS.md` utiles : opérations admises, aucune hypothèse cachée, aucune valeur personnelle, langage d'exploitant). Le texte du client est transmis comme donnée, jamais comme instruction système.
- Avant tout appel au modèle, le texte du client est contrôlé par `previsualiser` (taille ≤ 2000, garde pii) : un texte qui cite une donnée personnelle est refusé sans appel.

## Serveur (`server/app.mjs`)

- `POST /api/interpreter {id, texte}` (session adhérent ou admin, `Origin` vérifié, JSON). Réponses : 200 `{comprehension, operations, effet}` ou `{precision}`, 400 `{erreurs}`, 429 (limite : 10 par 10 minutes et par session ; ou interprétation déjà en cours pour cet adhérent), 503 agent non configuré, 502 passerelle en échec (« interprétation indisponible »).
- `/api/state` ajoute `vue.agent` (booléen).
- Journal `adherents/<id>/.atelier/agent.jsonl` : une ligne par appel `{date, id, tours, jetons, ms, issue}`, sans le texte du client.
- `POST /api/reponse` accepte `saisie.interpretation` (« C'est bien ça ») et la revalide entièrement.

## Vue

- `viewer/ui.js` : sur les formulaires libres et « Autre réponse », le bouton principal devient « Comprendre » quand `S.vue?.agent` ; la carte de compréhension avec ses trois boutons ; états : en cours (« Je lis votre réponse… »), précision, erreur. Mode local ou agent désactivé : inchangé.

## Tests (`node:test`, passerelle simulée par un serveur HTTP local, aucune clé)

- `llm.mjs` : requête (URL, en-tête, corps), erreur HTTP sans fuite de la clé, délai, réponse illisible.
- Boucle : outil puis `proposer` ; outil inconnu refusé ; opération invalide renvoyée puis corrigée ; plafond de tours ; plafond de jetons ; délai ; réponse texte = précision.
- Outils : `profil_colonnes` n'expose aucune colonne `pii` ni dataset étranger à la question ; `lire_memoire` sans noms d'adhérents.
- Moteur : `saisie.interpretation` valide/invalide, plus de 10 opérations, pii ; `previsualiser` n'écrit rien.
- Serveur : `/api/interpreter` (401, 400, 429, 503, 502), rien d'écrit avant « C'est bien ça », application et build après, texte à pii refusé sans appel à la passerelle.
- Vue : tests statiques et vérification à l'écran avec la passerelle simulée.

## Hors périmètre

Maquette automatique (3b). Questions de suivi, apprentissage, retrait de `/seance` (3c). Streaming des réponses. Mémorisation de conversations entre deux interprétations.
