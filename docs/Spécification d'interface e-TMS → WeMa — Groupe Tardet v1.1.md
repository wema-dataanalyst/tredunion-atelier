# Spécification d'interface e-TMS → WeMa — Groupe Tardet

Version 1.1 · Nov 11, 2026 · @Michel FLEITH

Ce document est le contrat d'interface que WeMa demande à Andsoft d'implémenter dans l'instance e-TMS de Groupe Tardet. Les sections 1 à 8 sont communes à tous les adhérents Tred Union équipés d'e-TMS ; seule la section 9 est propre à Tardet.

Les points marqués **\[À CONFIRMER Andsoft\]** dépendent du paramétrage e-TMS et sont à valider avant développement.

## 1. Objet et périmètre

L'interface transmet chaque nuit, en lecture seule, les données d'exploitation e-TMS de Groupe Tardet vers la plateforme data de WeMa (tableaux de bord Qlik Tred Union). Ces tableaux de bord sont mensuels : chiffre d'affaires et charges par activité, par filiale et par véhicule, kilomètres, consommation, entretien.

| Élément | Valeur |
| --- | --- |
| Émetteur | e-TMS Andsoft, instance Groupe Tardet |
| Récepteur | Plateforme data WeMa |
| Sens | Unidirectionnel e-TMS → WeMa, aucune écriture dans le TMS |
| Domaines couverts | A. Référentiels · B. Exploitation · C. Ventes et achats · D. Coûts du parc propre |
| Mode | Extraction complète sur une fenêtre glissante, chaque nuit |
| Fenêtre | Du 1er janvier de l'année N-2 à J-1 (référentiels : en totalité) |
| Version du document | 1.1 |

**Hors interface** : budget, masse salariale, heures payées, amortissements, assurances, taxes et résultat proviennent de la comptabilité et de la paie de l'adhérent, par un autre canal. Andsoft n'a pas à les extraire.

**Acteurs**

- WeMa : rédige et maintient cette spécification, fournit l'accès SFTP, valide les fichiers reçus.
- Andsoft : développe et planifie l'export dans l'instance e-TMS.
- Groupe Tardet : fournit le mandat écrit autorisant la transmission à WeMa.

## 2. Mode de communication

e-TMS dépose chaque nuit un lot de fichiers CSV sur le serveur SFTP de WeMa. Chaque lot remplace intégralement le précédent : les fichiers portent toujours le même nom et sont écrasés. Aucun flux entrant n'est ouvert vers l'infrastructure Andsoft.

### 2.1 Paramètres de connexion

Communs à tous les adhérents, sauf le compte, propre à chacun (section 9).

| Paramètre | Valeur |
| --- | --- |
| Protocole | SFTP (SSH-2) |
| Hôte / port | \[À FIXER WeMa\] / 22 |
| Authentification | Clé publique SSH ed25519 fournie par Andsoft, pas de mot de passe |
| Compte | tredunion\_\<CODE\_ADH> en minuscules |
| Répertoire de dépôt | /in/ |
| IP sources à autoriser | Fournies par Andsoft |
| Empreinte de la clé hôte | \[À FIXER WeMa\] SHA256:… |

### 2.2 Séquence d'un dépôt

1. À partir de 03:00 (heure de Paris), e-TMS supprime `MANIFEST.csv` de /in/.
2. e-TMS génère les fichiers du lot, un par flux (section 5). Chaque fichier est déposé avec l'extension .tmp, puis renommé en .csv une fois le transfert complet, en écrasant le fichier de la veille.
3. `MANIFEST.csv` est déposé en dernier, avant 05:30. Sa présence signale que le lot est complet.
4. À partir de 06:00, WeMa collecte /in/. Un lot sans `MANIFEST.csv`, ou dont le manifeste n'est pas du jour, n'est pas intégré : WeMa garde le lot précédent et prévient le contact technique Andsoft.
5. WeMa contrôle le nombre de lignes et les en-têtes de chaque fichier par rapport au manifeste.

### 2.3 Reprises et incidents

- Échec de dépôt : 3 nouvelles tentatives à 15 minutes d'intervalle, puis alerte côté Andsoft.
- Lot manquant un jour donné : rien à rattraper, le lot suivant contient toute la fenêtre.
- Relance manuelle : possible sur demande, en rejouant la séquence 2.2.

## 3. Format de fichier

Chaque flux est un fichier CSV, une ligne par enregistrement, avec une ligne d'en-tête dont les colonnes sont celles du dictionnaire (section 6), dans le même ordre.

| Règle | Valeur retenue |
| --- | --- |
| Encodage | UTF-8 sans BOM |
| Séparateur de champs | ; (point-virgule) |
| Délimiteur de texte | " (guillemet double), obligatoire si la valeur contient ;, " ou un saut de ligne ; un " interne est doublé ("") |
| Fin de ligne | CRLF |
| Ligne d'en-tête | Oui, une seule, noms en MAJUSCULES sans accent |
| Valeur absente | Champ vide (;;), jamais NULL, 0 ou N/A |
| Compression | Aucune |
| Découpage | Aucun. Si un fichier doit dépasser 500 Mo, Andsoft prévient WeMa avant |

### 3.1 Nommage

`<FLUX>.csv`, sans date ni numéro de lot : le nom d'un fichier identifie le flux, la date du lot est portée par le manifeste.

Exemple : ORDRES.csv

### 3.2 Manifeste de lot

`MANIFEST.csv`, au même format que les flux, une ligne par fichier du lot (16 lignes).

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `INTERFACE_VERSION` | TEXTE(10) | O | Version de cette spécification appliquée | 1.1 |
| `ADHERENT` | TEXTE(20) | O | CODE\_ADH | TARDET |
| `GENERE_LE` | DATEHEURE | O | Génération du lot | 2026-11-12T04:07:31+01:00 |
| `FENETRE_DEBUT` | DATE | O | Premier jour de la fenêtre | 2024-01-01 |
| `FENETRE_FIN` | DATE | O | Dernier jour de la fenêtre (J-1) | 2026-11-11 |
| `FLUX` | TEXTE(30) | O | Code du flux | ORDRES |
| `FICHIER` | TEXTE(50) | O | Nom du fichier | ORDRES.csv |
| `LIGNES` | ENTIER | O | Lignes de données, en-tête exclu | 41842 |

Un flux sans donnée est envoyé quand même, avec son seul en-tête et `LIGNES` = 0.

## 4. Formats de champs

Tout champ du dictionnaire porte l'un des types ci-dessous ; aucun autre format n'est admis.

| Type | Règle d'écriture | Exemple |
| --- | --- | --- |
| ID | Identifiant technique e-TMS, alphanumérique, 50 car. max, stable, jamais réutilisé | ORD2026004512 |
| TEXTE(n) | Chaîne UTF-8 de n caractères max, sans retour à la ligne, espaces de début et fin supprimés | TRANSPORTS DUPONT |
| CODE(n) | Valeur d'une codification e-TMS, n caractères max, libellé fourni dans le flux CODIFICATIONS | FRET |
| ENTIER | Chiffres uniquement, signe - autorisé, sans séparateur de milliers | 412 |
| DECIMAL(p,s) | Point décimal, s décimales exactement, sans séparateur ni symbole | 1250.50 |
| MONTANT | DECIMAL(15,2), toujours HT et en euros, signé (avoir négatif) | 1250.50 |
| DATE | ISO 8601 AAAA-MM-JJ | 2026-11-12 |
| DATEHEURE | ISO 8601 avec décalage AAAA-MM-JJThh:mm:ss±hh:mm | 2026-11-12T06:30:00+01:00 |
| BOOLEEN | 1 (vrai) ou 0 (faux) | 1 |
| PAYS | Code ISO 3166-1 alpha-2 | FR |
| CP | Code postal en texte, zéros de tête conservés, 10 car. max | 01100 |
| IMMAT | Immatriculation en majuscules, sans espace ni tiret | AB123CD |
| QTE | DECIMAL(12,3), unité indiquée par le suffixe du nom (\_KM, \_L) | 470.000 |

Unités : distances en km, volumes en litres. Dates et heures dans le fuseau Europe/Paris, décalage explicite. Un montant saisi dans une autre devise est converti en euros au taux retenu par e-TMS **\[À CONFIRMER Andsoft\]**.

## 5. Catalogue des flux

La v1.1 comporte 16 flux, tous envoyés à chaque lot, dans cet ordre de chargement. Tous sont complets : un enregistrement supprimé dans e-TMS disparaît simplement du lot suivant.

| Code flux | Domaine | Contenu | Clé unique | Périmètre |
| --- | --- | --- | --- | --- |
| `CODIFICATIONS` | A | Tables de codes et libellés | `TABLE` + `CODE` | Totalité |
| `ENTITES` | A | Sociétés juridiques | `ID_ENTITE` | Totalité |
| `AGENCES` | A | Agences et sites | `ID_AGENCE` | Totalité |
| `CLIENTS` | A | Clients donneurs d'ordre | `ID_CLIENT` | Totalité |
| `CONDUCTEURS` | A | Conducteurs salariés et intérimaires | `ID_CONDUCTEUR` | Totalité |
| `VEHICULES` | A | Matériel roulant et contrat de détention | `ID_VEHICULE` | Totalité |
| `SOUSTRAITANTS` | A | Affrétés et sous-traitants | `ID_SOUSTRAITANT` | Totalité |
| `ORDRES` | B | Ordres de transport / dossiers | `ID_ORDRE` | Fenêtre |
| `VOYAGES` | B | Voyages, dont voyages à vide, une ligne par tronçon | `ID_VOYAGE` + `NUM_TRONCON` | Fenêtre |
| `VOYAGES_ORDRES` | B | Liens voyage ↔ ordre et ventilation du CA | `ID_VOYAGE` + `ID_ORDRE` | Fenêtre |
| `RELEVES_KM` | B | Relevés de compteur kilométrique | `ID_VEHICULE` + `DATE_RELEVE` + `SOURCE` | Fenêtre |
| `VALORISATIONS` | C | Lignes de vente par ordre et par nature | `ID_LIGNE_VENTE` | Fenêtre |
| `ACHATS` | C | Achats d'affrètement et de sous-traitance | `ID_LIGNE_ACHAT` | Fenêtre |
| `CARBURANT` | D | Pleins et sorties de cuve | `ID_PLEIN` | Fenêtre |
| `PEAGES` | D | Passages de télépéage | `ID_PEAGE` | Fenêtre |
| `ENTRETIEN` | D | Interventions d'entretien et de réparation | `ID_INTERVENTION` + `NUM_LIGNE` | Fenêtre |

Fenêtre : enregistrements dont la date de référence (indiquée dans chaque flux) est entre `FENETRE_DEBUT` et `FENETRE_FIN`. Totalité : toute la table, actifs et inactifs.

Les flux du domaine D, et `RELEVES_KM`, ne sont alimentés que si l'adhérent gère ces données dans e-TMS ; sinon le fichier est envoyé avec son seul en-tête. La section 9 indique lesquels sont attendus.

## 6. Dictionnaire de données

Une ligne par colonne, dans l'ordre du fichier. O = obligatoire, N = facultatif. → indique une clé étrangère.

### 6.1 CODIFICATIONS

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `TABLE` | CODE(30) | O | Nom de la table de codes (liste ci-dessous) | TYPE\_ACTIVITE |
| `CODE` | CODE(10) | O | Code tel qu'il apparaît dans les autres flux | AFFRET |
| `LIBELLE` | TEXTE(100) | O | Libellé e-TMS | Affrètement |
| `ACTIF` | BOOLEEN | O | 0 si le code n'est plus utilisable | 1 |

Tables attendues : `TYPE_ACTIVITE`, `STATUT_ORDRE`, `TYPE_VOYAGE`, `STATUT_VOYAGE`, `SOURCE_KM`, `TYPE_VEHICULE`, `ENERGIE`, `MODE_DETENTION`, `CARROSSERIE`, `MOTIF_SORTIE`, `TYPE_CONTRAT`, `NATURE_VENTE`, `STATUT_VENTE`, `NATURE_ACHAT`, `STATUT_ACHAT`, `ORIGINE_CARBURANT`, `NATURE_ENTRETIEN`, `ORIGINE_ENTRETIEN`, `SOURCE_RELEVE`. Les codes sont ceux paramétrés chez l'adhérent ; les exemples de ce document sont indicatifs. WeMa fait le rapprochement vers son référentiel.

### 6.2 ENTITES

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_ENTITE` | ID | O | Identifiant de la société | SOC01 |
| `RAISON_SOCIALE` | TEXTE(100) | O | Raison sociale | TRANSPORTS TARDET |
| `PAYS` | PAYS | O | Pays d'immatriculation | FR |
| `ACTIF` | BOOLEEN | O | 0 si la société n'est plus utilisée | 1 |

### 6.3 AGENCES

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_AGENCE` | ID | O | Identifiant de l'agence | AG-BOURG |
| `LIBELLE_AGENCE` | TEXTE(60) | O | Nom de l'agence | BOURG-EN-BRESSE |
| `ID_ENTITE` | ID | O | Société de rattachement → ENTITES | SOC01 |
| `CP` | CP | N | Code postal | 01000 |
| `PAYS` | PAYS | O | Pays | FR |
| `ACTIF` | BOOLEEN | O | 0 si l'agence est fermée | 1 |

### 6.4 CLIENTS

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_CLIENT` | ID | O | Identifiant du client | CLI000187 |
| `CODE_CLIENT` | TEXTE(30) | O | Code affiché à l'utilisateur | DUPONT01 |
| `RAISON_SOCIALE` | TEXTE(100) | O | Raison sociale | DUPONT SA |
| `ID_ENTITE_GROUPE` | ID | N | Renseigné si le client est une société du groupe → ENTITES | SOC02 |
| `ACTIF` | BOOLEEN | O | 0 si le client est bloqué ou archivé | 1 |

### 6.5 CONDUCTEURS

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_CONDUCTEUR` | ID | O | Identifiant du conducteur | CDR0042 |
| `MATRICULE` | TEXTE(20) | N | Matricule paie, pour le rapprochement avec la paie | 000412 |
| `NOM` | TEXTE(60) | O | Nom | MARTIN |
| `PRENOM` | TEXTE(60) | O | Prénom | PAUL |
| `ID_ENTITE` | ID | O | Société employeur → ENTITES | SOC01 |
| `ID_AGENCE` | ID | O | Agence de rattachement → AGENCES | AG-BOURG |
| `TYPE_CONTRAT` | CODE(10) | O | CDI, CDD, INTERIM → CODIFICATIONS | CDI |
| `DATE_ENTREE` | DATE | N | Date d'entrée | 2022-04-04 |
| `DATE_SORTIE` | DATE | N | Date de sortie, vide si présent |  |

### 6.6 VEHICULES

Une ligne par matériel. Les champs de contrat décrivent le contrat de détention en cours, ou le dernier si le véhicule est sorti du parc.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_VEHICULE` | ID | O | Identifiant du matériel | VEH0119 |
| `CODE_PARC` | TEXTE(20) | N | Numéro interne du véhicule | T119 |
| `IMMATRICULATION` | IMMAT | O | Immatriculation | GH512KL |
| `TYPE_VEHICULE` | CODE(10) | O | TRACTEUR, PORTEUR, SEMI, REMORQUE, VUL → CODIFICATIONS | TRACTEUR |
| `MARQUE` | TEXTE(40) | N | Marque | VOLVO |
| `CARROSSERIE` | CODE(10) | N | Type de carrosserie → CODIFICATIONS | FRIGO |
| `ENERGIE` | CODE(10) | N | GAZOLE, GNC, GNL, B100, ELEC → CODIFICATIONS | B100 |
| `DATE_MISE_EN_CIRCULATION` | DATE | N | Première mise en circulation | 2023-12-15 |
| `ID_ENTITE` | ID | O | Société exploitante → ENTITES | SOC01 |
| `ID_AGENCE` | ID | O | Agence de rattachement → AGENCES | AG-BOURG |
| `TYPE_ACTIVITE` | CODE(10) | N | Activité principale du véhicule → CODIFICATIONS | PROPRE |
| `ID_CONDUCTEUR_ATTITRE` | ID | N | Conducteur attitré → CONDUCTEURS | CDR0042 |
| `DATE_ENTREE_PARC` | DATE | N | Entrée dans le parc | 2024-03-01 |
| `DATE_SORTIE_PARC` | DATE | N | Sortie du parc, vide si en service |  |
| `MOTIF_SORTIE` | CODE(10) | N | Vente, restitution, sinistre… → CODIFICATIONS |  |
| `MODE_DETENTION` | CODE(10) | N | PROPRIETE, CREDITBAIL, LOCATION → CODIFICATIONS | CREDITBAIL |
| `PROPRIETAIRE` | TEXTE(100) | N | Propriétaire du véhicule (société du groupe ou bailleur) | TRANSPORTS TARDET |
| `LOUEUR` | TEXTE(100) | N | Loueur ou organisme de crédit-bail | FRAIKIN |
| `DATE_DEBUT_CONTRAT` | DATE | N | Début du contrat de détention | 2024-03-01 |
| `DATE_FIN_CONTRAT` | DATE | N | Fin prévue du contrat | 2029-02-28 |
| `LOYER_MENSUEL_HT` | MONTANT | N | Loyer mensuel HT du contrat | 1850.00 |

### 6.7 SOUSTRAITANTS

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_SOUSTRAITANT` | ID | O | Identifiant du tiers | ST000321 |
| `RAISON_SOCIALE` | TEXTE(100) | O | Raison sociale | TRANS LYON SARL |
| `ID_ENTITE_GROUPE` | ID | N | Renseigné si le tiers est une société du groupe → ENTITES |  |
| `ACTIF` | BOOLEEN | O | 0 si le tiers n'est plus utilisé | 1 |

### 6.8 ORDRES

Date de référence pour la fenêtre : `DATE_CHARGEMENT_PREVUE`.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_ORDRE` | ID | O | Identifiant de l'ordre | ORD2026004512 |
| `NUM_ORDRE` | TEXTE(30) | O | Numéro affiché à l'utilisateur | JT-26-004512 |
| `ID_ENTITE` | ID | O | Société qui porte l'ordre → ENTITES | SOC01 |
| `ID_AGENCE` | ID | O | Agence gestionnaire → AGENCES | AG-BOURG |
| `ID_CLIENT` | ID | O | Client donneur d'ordre → CLIENTS | CLI000187 |
| `TYPE_ACTIVITE` | CODE(10) | O | PROPRE, AFFRET, LOGIST → CODIFICATIONS | PROPRE |
| `STATUT` | CODE(10) | O | Statut de l'ordre, dont ANNULE → CODIFICATIONS | LIVRE |
| `DATE_CHARGEMENT_PREVUE` | DATE | O | Date de chargement prévue | 2026-11-10 |
| `DATE_CHARGEMENT_REALISEE` | DATE | N | Date de chargement réalisée, vide tant que non chargé | 2026-11-10 |
| `DATE_LIVRAISON_REALISEE` | DATE | N | Date de livraison réalisée | 2026-11-11 |

### 6.9 VOYAGES

Une ligne par tronçon de voyage. Un voyage sans changement de véhicule moteur a un seul tronçon (`NUM_TRONCON` = 1). Les voyages sans ordre (retour à vide, positionnement) sont transmis. Date de référence pour la fenêtre : `DATE_DEBUT`.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_VOYAGE` | ID | O | Identifiant du voyage | VOY2026011873 |
| `NUM_TRONCON` | ENTIER | O | Numéro du tronçon dans le voyage, à partir de 1 | 1 |
| `ID_ENTITE` | ID | O | Société qui exécute le voyage → ENTITES | SOC01 |
| `ID_AGENCE` | ID | O | Agence qui exécute le voyage → AGENCES | AG-BOURG |
| `TYPE_VOYAGE` | CODE(10) | O | CHARGE, VIDE, POSITION → CODIFICATIONS | CHARGE |
| `TYPE_ACTIVITE` | CODE(10) | O | PROPRE, AFFRET, LOGIST → CODIFICATIONS | PROPRE |
| `STATUT` | CODE(10) | O | Planifié, réalisé, annulé → CODIFICATIONS | REALISE |
| `DATE_DEBUT` | DATE | O | Date de départ du tronçon | 2026-11-10 |
| `DATE_FIN` | DATE | N | Date de fin du tronçon | 2026-11-11 |
| `ID_CONDUCTEUR_1` | ID | N | Conducteur principal → CONDUCTEURS | CDR0042 |
| `ID_CONDUCTEUR_2` | ID | N | Second conducteur (double équipage) → CONDUCTEURS |  |
| `ID_MOTEUR` | ID | N | Tracteur ou porteur → VEHICULES | VEH0119 |
| `ID_REMORQUE` | ID | N | Remorque ou semi → VEHICULES | VEH0310 |
| `ID_SOUSTRAITANT` | ID | N | Tronçon confié à un tiers → SOUSTRAITANTS |  |
| `KM_CHARGE_KM` | QTE | N | Kilomètres en charge du tronçon | 412.000 |
| `KM_VIDE_KM` | QTE | N | Kilomètres à vide du tronçon | 58.000 |
| `KM_TOTAL_KM` | QTE | N | Kilomètres totaux du tronçon | 470.000 |
| `SOURCE_KM` | CODE(10) | N | Origine des kilomètres : calcul d'itinéraire, saisie, télématique → CODIFICATIONS | CALCUL |

### 6.10 VOYAGES_ORDRES

Une ligne par couple voyage × ordre. Un voyage qui transporte 3 ordres produit 3 lignes ; un voyage à vide n'en produit aucune.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_VOYAGE` | ID | O | Voyage → VOYAGES | VOY2026011873 |
| `ID_ORDRE` | ID | O | Ordre transporté → ORDRES | ORD2026004512 |
| `QUOTE_PART_CA` | DECIMAL(7,6) | N | Part du CA de l'ordre portée par ce voyage, telle que calculée par e-TMS ; la somme sur un ordre vaut 1 **\[À CONFIRMER Andsoft\]** | 0.500000 |

### 6.11 RELEVES_KM

Une ligne par relevé du compteur kilométrique d'un véhicule moteur. Date de référence pour la fenêtre : `DATE_RELEVE`.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_VEHICULE` | ID | O | Véhicule → VEHICULES | VEH0119 |
| `DATE_RELEVE` | DATE | O | Date du relevé | 2026-11-10 |
| `SOURCE` | CODE(10) | O | Saisie, télématique, plein, atelier → CODIFICATIONS | TELEMATIQUE |
| `KM_COMPTEUR_KM` | QTE | O | Valeur du compteur | 412580.000 |

### 6.12 VALORISATIONS

Une ligne par élément de prix d'un ordre (fret, surcharge gazole, péage refacturé, attente…), facturé ou non. Date de référence pour la fenêtre : `DATE_VALORISATION`.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_LIGNE_VENTE` | ID | O | Identifiant de la ligne | VTE2026098812 |
| `ID_ORDRE` | ID | O | Ordre valorisé → ORDRES | ORD2026004512 |
| `ID_ENTITE` | ID | O | Société qui porte la vente → ENTITES | SOC01 |
| `ID_AGENCE` | ID | O | Agence qui porte la vente → AGENCES | AG-BOURG |
| `TYPE_ACTIVITE` | CODE(10) | O | Activité de la ligne, si elle diffère de celle de l'ordre → CODIFICATIONS | PROPRE |
| `NATURE_VENTE` | CODE(10) | O | FRET, GAZOLE, PEAGE, ATTENTE, MANUT, AUTRE → CODIFICATIONS | FRET |
| `STATUT` | CODE(10) | O | Provisoire, validée, facturée → CODIFICATIONS | FACTURE |
| `MONTANT_HT` | MONTANT | O | Montant HT de la ligne, négatif pour un avoir | 850.00 |
| `DATE_VALORISATION` | DATE | O | Date de valorisation de la ligne | 2026-11-10 |
| `ID_FACTURE` | ID | N | Facture ou avoir qui porte la ligne, vide si non facturée | FAC2026007731 |
| `DATE_FACTURE` | DATE | N | Date de la facture ou de l'avoir | 2026-11-30 |

### 6.13 ACHATS

Une ligne par coût d'affrètement ou de sous-traitance, rattaché ou non à un ordre. Date de référence pour la fenêtre : `DATE_ACHAT`.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_LIGNE_ACHAT` | ID | O | Identifiant de la ligne | ACH2026004410 |
| `ID_ORDRE` | ID | N | Ordre concerné → ORDRES | ORD2026004512 |
| `ID_VOYAGE` | ID | N | Voyage concerné → VOYAGES |  |
| `ID_ENTITE` | ID | O | Société qui porte l'achat → ENTITES | SOC01 |
| `ID_AGENCE` | ID | O | Agence qui porte l'achat → AGENCES | AG-BOURG |
| `TYPE_ACTIVITE` | CODE(10) | O | Activité à laquelle le coût se rattache → CODIFICATIONS | AFFRET |
| `ID_SOUSTRAITANT` | ID | O | Fournisseur → SOUSTRAITANTS | ST000321 |
| `NATURE_ACHAT` | CODE(10) | O | Nature du coût → CODIFICATIONS | AFFRET |
| `STATUT` | CODE(10) | O | Estimé, rapproché de la facture fournisseur → CODIFICATIONS | RAPPROCHE |
| `MONTANT_HT` | MONTANT | O | Montant HT, négatif pour un avoir | 620.00 |
| `DATE_ACHAT` | DATE | O | Date de rattachement du coût | 2026-11-10 |
| `NUM_FACTURE_FOURNISSEUR` | TEXTE(30) | N | Référence de la facture fournisseur | F-2026-1188 |

### 6.14 CARBURANT

Une ligne par plein en station ou par sortie de cuve interne, tous carburants et AdBlue. Date de référence pour la fenêtre : `DATE_PLEIN`.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_PLEIN` | ID | O | Identifiant du plein | PLN2026031877 |
| `DATE_PLEIN` | DATE | O | Date du plein | 2026-11-10 |
| `ID_VEHICULE` | ID | O | Véhicule servi → VEHICULES | VEH0119 |
| `ID_CONDUCTEUR` | ID | N | Conducteur → CONDUCTEURS | CDR0042 |
| `ID_ENTITE` | ID | O | Société qui porte le coût → ENTITES | SOC01 |
| `ID_AGENCE` | ID | N | Agence → AGENCES | AG-BOURG |
| `ORIGINE` | CODE(10) | O | Cuve interne, carte carburant → CODIFICATIONS | CARTE |
| `ENERGIE` | CODE(10) | O | GAZOLE, B100, GNC, ADBLUE… → CODIFICATIONS | GAZOLE |
| `QUANTITE_L` | QTE | O | Litres servis (kg pour le GNC, à préciser dans CODIFICATIONS) | 412.350 |
| `MONTANT_HT` | MONTANT | N | Montant HT ; pour une cuve, au prix moyen d'achat | 598.12 |
| `KM_COMPTEUR_KM` | QTE | N | Compteur au moment du plein | 412580.000 |

### 6.15 PEAGES

Une ligne par passage de télépéage (coût supporté, refacturé ou non). Date de référence pour la fenêtre : `DATE_PASSAGE`.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_PEAGE` | ID | O | Identifiant du passage | PEA2026118870 |
| `DATE_PASSAGE` | DATE | O | Date du passage | 2026-11-10 |
| `ID_VEHICULE` | ID | N | Véhicule porteur du badge → VEHICULES | VEH0119 |
| `ID_VOYAGE` | ID | N | Voyage concerné, si rapproché → VOYAGES | VOY2026011873 |
| `ID_ENTITE` | ID | O | Société qui porte le coût → ENTITES | SOC01 |
| `ID_AGENCE` | ID | N | Agence → AGENCES | AG-BOURG |
| `MONTANT_HT` | MONTANT | O | Montant HT | 42.30 |

### 6.16 ENTRETIEN

Une ligne par ligne d'intervention (ordre de réparation interne ou facture de garage). Date de référence pour la fenêtre : `DATE_INTERVENTION`.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_INTERVENTION` | ID | O | Identifiant de l'intervention | OR2026001544 |
| `NUM_LIGNE` | ENTIER | O | Numéro de ligne dans l'intervention | 1 |
| `DATE_INTERVENTION` | DATE | O | Date de l'intervention | 2026-11-10 |
| `ID_VEHICULE` | ID | O | Véhicule → VEHICULES | VEH0119 |
| `ID_ENTITE` | ID | O | Société qui porte le coût → ENTITES | SOC01 |
| `ID_AGENCE` | ID | N | Agence → AGENCES | AG-BOURG |
| `NATURE` | CODE(10) | O | Entretien, pneumatiques, casse, consommables atelier, contrôle réglementaire → CODIFICATIONS | PNEU |
| `ORIGINE` | CODE(10) | O | Atelier interne, garage extérieur → CODIFICATIONS | EXTERNE |
| `FOURNISSEUR` | TEXTE(100) | N | Garage ou fournisseur, si externe | POIDS LOURDS SERVICE |
| `MONTANT_PIECES_HT` | MONTANT | N | Pièces et fournitures HT | 1240.00 |
| `MONTANT_MO_HT` | MONTANT | N | Main-d'œuvre HT | 320.00 |
| `KM_COMPTEUR_KM` | QTE | N | Compteur au moment de l'intervention | 412580.000 |

## 7. Règles de gestion

- **Extraction complète** : chaque lot contient la totalité des référentiels et tous les enregistrements dont la date de référence est dans la fenêtre. WeMa remplace ses données par celles du lot ; un enregistrement absent du lot est considéré comme supprimé.
- **Annulations** : un ordre ou un voyage annulé est transmis avec son statut d'annulation, pas supprimé.
- **Voyages** : tout voyage réalisé est transmis, y compris sans ordre (retour à vide, positionnement). Un changement de véhicule moteur en cours de voyage ouvre un nouveau tronçon. Les kilomètres sont portés par le tronçon et ne sont jamais répétés sur les liens voyage ↔ ordre.
- **Activité** : `TYPE_ACTIVITE` est renseigné au niveau le plus fin qu'e-TMS connaît (tronçon, ligne de vente, ligne d'achat). Il distingue le transport en parc propre, l'affrètement et la logistique.
- **Rattachement** : chaque ligne de vente, d'achat, de carburant, de péage et d'entretien porte sa société et, dès qu'e-TMS la connaît, son agence, même sans ordre lié.
- **Groupe** : un client ou un sous-traitant qui est une société du groupe porte `ID_ENTITE_GROUPE`, pour que WeMa puisse neutraliser les flux entre sociétés du groupe.
- **Relations** : toute clé étrangère référence un enregistrement présent dans le même lot.
- **Identifiants** : stables dans le temps et jamais réattribués à un autre objet.
- **Montants** : tous HT et en euros. Les avoirs sont en montant négatif.
- **Données absentes** : un champ ou un flux qu'e-TMS ne gère pas chez un adhérent reste vide ; Andsoft en donne la liste lors de la recette.

## 8. Sécurité, recette et versionnement

**Sécurité et RGPD**

- Transport chiffré SSH, authentification par clé uniquement, filtrage des IP sources côté WeMa.
- Ouverture du flux uniquement après réception par Andsoft du mandat écrit de l'adhérent ; fermeture sur simple demande de l'adhérent.
- Conducteurs : uniquement les champs de la section 6.5 (identifiant, matricule, nom, prénom, rattachement, contrat, dates d'entrée et de sortie). Aucune coordonnée personnelle ni géolocalisation.
- Données hébergées dans l'Union européenne.

**Recette**

1. WeMa transmet la version 1.1 de ce document.
2. Andsoft répond aux points **\[À CONFIRMER Andsoft\]** et indique les flux et champs non gérés chez Tardet.
3. Andsoft livre un lot d'exemple sur un compte SFTP de test, à partir d'une base de démonstration.
4. WeMa valide la lecture du lot et remonte les écarts par écrit.
5. Groupe Tardet en production : premier lot complet, puis 5 lots quotidiens contrôlés. WeMa rapproche le CA et les achats transmis avec la comptabilité de l'adhérent.
6. Déploiement aux adhérents suivants équipés d'e-TMS, chacun avec sa propre section 9 et son compte SFTP.

**Versionnement**

Toute évolution (champ ajouté, type modifié, nouveau flux) fait l'objet d'une nouvelle version, avec une date d'application convenue. Un ajout de colonne se fait toujours en fin de fichier ; `INTERFACE_VERSION` du manifeste indique la version appliquée.

| Version | Date | Auteur | Modification |
| --- | --- | --- | --- |
| 1.1 | 11/11/2026 | WeMa | Extraction complète glissante à noms fixes ; voyages par tronçon, voyages à vide et liens voyage ↔ ordre séparés ; statuts, activité et agence sur ventes et achats ; contrat et attributs véhicule ; flux CARBURANT, PEAGES, ENTRETIEN et RELEVES\_KM ; suppression du flux FACTURES et des champs sans usage |
| 1.0 | 11/11/2026 | WeMa | Spécification complète des flux A, B, C |
| 0.1 | 11/11/2026 | Andsoft | Exemple de structure attendue |

**Contacts**

| Rôle | Société | Nom |
| --- | --- | --- |
| Responsable de la spécification | WeMa | Michel Fleith |
| Contact technique export | Andsoft | Guillaume Albelda |
| Contact groupement | Tred Union | Olivier Perrin |

## 9. Paramètres adhérent : Groupe Tardet

Seule section à réécrire pour chaque adhérent.

| Paramètre | Valeur |
| --- | --- |
| `CODE_ADH` | TARDET |
| Compte SFTP | tredunion\_tardet |
| Sociétés couvertes (`ID_ENTITE`) | \[À FOURNIR par Tardet : raisons sociales et SIRET des sociétés du groupe\] |
| Date de démarrage | \[À FIXER\] |
| Premier lot | Complet, fenêtre du 1er janvier de l'année N-2 à J-1 |
| Mandat de transmission | \[À SIGNER par Groupe Tardet\] |
| Contacts adhérent | Vincent Tardet (dirigeant), Stéphane Verpoorten (RAF) |

**Flux du domaine D attendus** : `ENTRETIEN` (Tardet suit l'entretien de sa flotte dans e-TMS). `CARBURANT`, `PEAGES` et `RELEVES_KM` : \[À CONFIRMER Andsoft\] selon les modules utilisés par Tardet.
