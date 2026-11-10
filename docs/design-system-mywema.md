# Design system MyWeMa (extrait du portail en ligne)

Source : inspection live de `https://mywema-portal-preview.treezer.app/` (module planning `wema-preview.treezer.app`), le 2026-11-10. Extraction via le CSS compilé (Next.js + Tailwind CSS v4, tokens `@theme`) et les styles calculés des composants clés (boutons, badges, bandeau d'alerte, sidebar).

Objectif : référence pour aligner la charte `viewer/wema.css` de l'atelier (et toute page qui la consomme) sur le produit MyWeMa réel, plutôt que sur une charte graphique approximative.

## Typographie

- Police unique observée partout (corps, boutons, nav, titres) : **Poppins**, fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.
- Poids utilisés : `400` (texte courant), `500` (boutons, libellés), `600` (badges, onglets actifs, nav), `700` (emphase forte).
- Échelle (tokens Tailwind du site) :

| Token | Taille | Line-height |
|---|---|---|
| `text-xs` | 0.75rem (12px) | 1/0.75 |
| `text-sm` | 0.875rem (14px) | 1.25/0.875 |
| `text-base` | 1rem (16px) | 1.5 |
| `text-lg` | 1.125rem (18px) | 1.75/1.125 |
| `text-2xl` | 1.5rem (24px) | 2/1.5 |
| `text-3xl` | 1.875rem (30px) | 2.25/1.875 |

L'UI réelle descend jusqu'à `11–12.5px` sur les boutons/onglets (densité élevée, planning).

## Espacement, rayons, transitions

- Unité d'espacement : `0.25rem` (grille 4px standard).
- Rayons : `sm 4px · md 6px · lg 8px · xl 12px · 2xl 16px`, + `rounded-full` pour les badges pill.
- Transition par défaut : `150ms`, easing `cubic-bezier(.4,0,.2,1)` (+ `ease-out` dédié aux apparitions).

## Couleurs de marque

| Nom | Valeur | Usage observé |
|---|---|---|
| `navy` | `#223260` | Boutons actifs (Semaine/Calendrier), liens actifs |
| `navy-900` | `#18244a` | Dégradé sidebar (point de départ) |
| `violet` | `#59358b` | Dégradé sidebar (milieu) |
| `magenta` | `#e5007d` | Accent principal |
| `magenta-50` | `#fde9f3` | Fond badge (ex. « cette semaine »), texte ≈ `#bb0068` |
| `blue` | `#4a94d1` | Accent secondaire / info |
| `blue-50` | `#eaf3fb` | Fond léger bleu |

Dégradé signature de la sidebar (mesuré en live) :
```css
background: linear-gradient(168deg, #223260, #45286e 62%, #6b2f82);
```

## Neutres / surfaces

| Nom | Valeur | Usage |
|---|---|---|
| `app-bg` | `#f4f7fd` | Fond général de page |
| `surface-2` | `#f8faff` | Fond carte secondaire |
| `border-soft` | `#e3e8f2` | Bordures légères, cases vides |
| `border-strong` | `#cbd5e8` | Bordures marquées, pointillés (zones « ajouter ») |
| `text-main` | `#1b2437` | Texte principal (pas la navy de marque) |
| `text-soft` | `#4a5570` | Texte secondaire |
| `muted` | `#8a93a8` | Texte discret |

## Couleurs sémantiques (statuts)

| Statut | Base | Fond clair | Texte sur fond clair (mesuré) |
|---|---|---|---|
| succès (`ok`) | `#2e9e4f` | `#e9f7ee` (+ `#d3efdc`) | — |
| avertissement (`warn`) | `#ef7d00` | `#fff3e3` | `#6f3900` (bandeau « journée à valider ») |
| critique (`crit`) | `#c81e1e` | `#fdeaea` | — |

## Composants observés

- **Bouton segmenté actif** (Jour/Semaine/Mois…) : fond `navy`, texte blanc, `padding 6px 14px`, `radius 6px`, `11.5px/500`. Inactif : transparent, texte `text-soft`.
- **Lien de nav actif** (sidebar) : fond blanc à 10 % d'opacité sur le dégradé, texte blanc, `padding 10px 20px`.
- **Badge pill** (« cette semaine ») : fond `magenta-50`, texte magenta foncé, `radius full`, `padding 4px 10px`, `11px/600`.
- **Bandeau d'alerte** : `border-left 4px` coloré (`warn`), bordure fine `warn/40%`, fond `warn-50`, `radius 12px`, `padding 16px 12px`.
- **Case vide / zone « ajouter »** : bordure pointillée `border-strong` (ou transparente au repos, visible au survol), `radius 12px`.

## Notes techniques

- Stack source : Next.js + Tailwind CSS v4 (tokens définis via `@theme`, exposés en `--color-*`/`--text-*`/`--radius-*`, consommés directement en classes utilitaires : `bg-warn/40`, `border-l-warn`, etc.).
- Pas de `@font-face` propre détecté sur le site (Poppins probablement chargé via Google Fonts/Next font) : dans l'atelier, on la self-host comme les autres polices (`viewer/fonts/poppins-latin-{400,500,600,700}-normal.woff2`), conformément à la règle « pas d'appel Google Fonts en prod ».

## Application dans l'atelier

Appliqué à `viewer/wema.css` (tokens `--wm-*`) le 2026-11-10 : police Poppins (remplace Montserrat/Nunito Sans), couleurs de marque et sémantiques recalées sur les valeurs ci-dessus, `--fg`/`--muted` recâblés sur `text-main`/`muted` du produit réel au lieu de la navy de marque. La structure (sidebar dégradée, cartes arrondies, boutons pilule) décidée dans `docs/superpowers/specs/2026-11-08-design-system-wema-design.md` était déjà conforme et n'a pas changé.
