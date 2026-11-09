# Design system de l'atelier : charte WeMa 2024

Décisions (Michel, 2026-11-08) : charte WeMa 2024 telle quelle ; toute l'application ; thème clair uniquement ; couche d'alias sur les tokens, composants existants restylés ; polices servies par notre serveur ; structure A (barre latérale Marine).

## Réalisation
- `viewer/wema.css` : `@font-face` (woff2 latins dans `viewer/fonts/`), tokens `--wm-*`, alias des variables historiques (`--bg`, `--fg`, `--accent`, `--ok`, `--warn`, `--bad`, `--soc-*`…). Le thème sombre est supprimé.
- Polices : Montserrat 700/800 (titres), Nunito Sans 400/600/700 (corps), JetBrains Mono 400/500 (code). Route `/fonts/<fichier>.woff2` du serveur (liste blanche par expression régulière, cache immuable). Plus aucun appel à Google Fonts.
- `viewer/body.html` : la barre haute devient une barre latérale (`header.top`), le reste est dans `.stage`. Sous 900 px elle repasse en bandeau.
- `viewer/style.css` : bloc final « charte WeMa » (sidebar dégradé Marine → Violet, entrée active Magenta, boutons pilule, cartes à 14 px, bandeau d'effet vert, focus Magenta).
- `tools/atelier.mjs` : `viewerHtml` inclut `wema.css` ; route polices.

## Vérification
Tests inchangés (109). Contrôle à l'écran : schéma, dashboard, questions (formulaire, bandeau d'effet), largeur 1440 px et 800 px.

## Hors périmètre
Logo WeMa, favicon, page de connexion (sous-projet 2), contrôle de contraste automatisé.
