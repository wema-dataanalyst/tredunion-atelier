# Spécification d'interface e-TMS → WeMa — Groupe Tardet

Version 1.0 · Nov 11, 2026 · @Michel FLEITH

Ce document est le contrat d'interface que WeMa demande à Andsoft d'implémenter dans l'instance e-TMS de Groupe Tardet. Les sections 1 à 8 sont communes à tous les adhérents Tred Union ; seule la section 9 est propre à Tardet.

## 1. Objet et périmètre

L'interface transmet chaque nuit, en lecture seule, les données d'exploitation e-TMS de Groupe Tardet vers la plateforme data de WeMa (tableaux de bord Qlik Tred Union).

| Élément | Valeur |
| --- | --- |
| Émetteur | e-TMS Andsoft, instance Groupe Tardet |
| Récepteur | Plateforme data WeMa |
| Sens | Unidirectionnel e-TMS → WeMa, aucune écriture dans le TMS |
| Domaines couverts (v1.0) | A. Référentiels · B. Ordres et voyages · C. Valorisation et facturation |
| Domaines hors v1.0 | D. Entretien (voir section 9) ; E à G non demandés |
| Fréquence | Quotidienne, données à J-1 |
| Historique initial | 24 mois glissants, envoyés une fois au démarrage |
| Version du document | 1.0 |

**Acteurs**

- WeMa : rédige et maintient cette spécification, fournit l'accès SFTP, valide les fichiers reçus.
- Andsoft : développe et planifie l'export dans l'instance e-TMS.
- Groupe Tardet : fournit le mandat écrit autorisant la transmission à WeMa.

## 2. Mode de communication

e-TMS dépose chaque nuit un lot de fichiers CSV sur le serveur SFTP de WeMa ; WeMa les intègre puis les supprime. Aucun flux entrant n'est ouvert vers l'infrastructure Andsoft.

### 2.1 Paramètres de connexion

Communs à tous les adhérents, sauf le compte, propre à chacun (section 9).

| Paramètre | Valeur |
| --- | --- |
| Protocole | SFTP (SSH-2) |
| Hôte / port | \[À FIXER WeMa\] / 22 |
| Authentification | Clé publique SSH ed25519 fournie par Andsoft, pas de mot de passe |
| Compte | tredunion\_\<CODE\_ADH> en minuscules |
| Répertoire de dépôt | /in/ |
| Répertoire d'erreurs | /err/ (WeMa y déplace les lots rejetés) |
| IP sources à autoriser | Fournies par Andsoft |
| Empreinte de la clé hôte | \[À FIXER WeMa\] SHA256:… |

### 2.2 Séquence d'un dépôt

1. 04:00 (heure de Paris) : e-TMS génère les fichiers du lot, un par flux (section 5).
2. Chaque fichier est déposé avec l'extension .tmp, puis renommé en .csv une fois le transfert complet. WeMa ignore les .tmp.
3. Le manifeste `MANIFEST_<CODE_ADH>_<AAAAMMJJ>_<SEQ>.json` est déposé en dernier. Sa présence signale que le lot est complet.
4. WeMa contrôle le lot (présence des 12 fichiers, nombre de lignes, empreinte SHA-256, en-têtes), l'intègre et supprime les fichiers de /in/.
5. En cas d'erreur, WeMa déplace le lot dans /err/ avec un fichier \<nom\_du\_manifeste>.error.txt décrivant le rejet, et prévient le contact technique Andsoft.
6. Données J-1 disponibles dans Qlik avant 07:00.

### 2.3 Reprises et incidents

- Échec de connexion : 3 nouvelles tentatives à 15 minutes d'intervalle, puis alerte côté Andsoft.
- Lot manquant un jour donné : le lot suivant couvre toute la période depuis le dernier lot accepté (section 7).
- Relance manuelle : possible sur demande, avec un numéro de séquence incrémenté.
- Un lot déposé n'est jamais modifié : une correction passe par un nouveau lot.

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
| Taille maximale | 500 Mo par fichier ; au-delà, découpage \_P01, \_P02… |

### 3.1 Nommage

`<FLUX>_<CODE_ADH>_<AAAAMMJJ>_<SEQ>.csv`

- FLUX : code du flux (section 5).
- CODE\_ADH : code de l'adhérent attribué par WeMa (section 9).
- AAAAMMJJ : date de génération du lot.
- SEQ : numéro de lot sur 3 chiffres dans la journée, 001 par défaut.

Exemple : ORDRES\_TARDET\_20261112\_001.csv

### 3.2 Manifeste de lot

Un fichier JSON par lot, déposé en dernier. Il liste les 12 fichiers du lot.

```json
{
  "interface_version": "1.0",
  "adherent": "TARDET",
  "lot": "20261112_001",
  "type_extraction": "INCREMENTALE",
  "periode_debut": "2026-11-11T04:00:00+01:00",
  "periode_fin": "2026-11-12T04:00:00+01:00",
  "genere_le": "2026-11-12T04:07:31+01:00",
  "fichiers": [
    { "flux": "ORDRES", "nom": "ORDRES_TARDET_20261112_001.csv",
      "lignes": 1842, "sha256": "9f86d081884c7d65…" }
  ]
}
```

- type\_extraction : INITIALE (reprise des 24 mois) ou INCREMENTALE (quotidien).
- lignes : nombre de lignes de données, en-tête exclu. Un flux sans changement est envoyé quand même, avec son seul en-tête et lignes: 0.
- sha256 : empreinte complète du fichier (64 caractères hexadécimaux minuscules).

## 4. Formats de champs

Tout champ du dictionnaire porte l'un des types ci-dessous ; aucun autre format n'est admis.

| Type | Règle d'écriture | Exemple |
| --- | --- | --- |
| ID | Identifiant technique e-TMS, alphanumérique, 50 car. max, stable, jamais réutilisé | ORD2026004512 |
| TEXTE(n) | Chaîne UTF-8 de n caractères max, sans retour à la ligne, espaces de début et fin supprimés | TRANSPORTS DUPONT |
| CODE(n) | Valeur d'une codification e-TMS, n caractères max, libellé fourni dans le flux CODIFICATIONS | FRET |
| ENTIER | Chiffres uniquement, signe - autorisé, sans séparateur de milliers | 412 |
| DECIMAL(p,s) | Point décimal, s décimales exactement, sans séparateur ni symbole | 1250.50 |
| MONTANT | DECIMAL(15,2), toujours HT, signé (avoir négatif), accompagné d'un champ DEVISE | 1250.50 |
| DEVISE | Code ISO 4217 sur 3 lettres | EUR |
| DATE | ISO 8601 AAAA-MM-JJ | 2026-11-12 |
| DATEHEURE | ISO 8601 avec décalage AAAA-MM-JJThh:mm:ss±hh:mm | 2026-11-12T06:30:00+01:00 |
| BOOLEEN | 1 (vrai) ou 0 (faux) | 1 |
| PAYS | Code ISO 3166-1 alpha-2 | FR |
| CP | Code postal en texte, zéros de tête conservés, 10 car. max | 01100 |
| SIRET | 14 chiffres sans espace ; vide pour une entité hors France | 41234567800012 |
| IMMAT | Immatriculation en majuscules, sans espace ni tiret | AB123CD |
| QTE | DECIMAL(12,3), unité indiquée par le suffixe du nom (\_KG, \_KM, \_ML, \_L) | 24000.000 |

Unités : poids en kg, distances en km, longueurs en mètres linéaires, volumes en litres. Dates et heures dans le fuseau Europe/Paris, décalage explicite.

## 5. Catalogue des flux

La v1.0 comporte 12 flux, tous envoyés à chaque lot, dans cet ordre de chargement.

| Code flux | Domaine | Contenu | Clé unique | Mode |
| --- | --- | --- | --- | --- |
| `CODIFICATIONS` | A | Tables de codes et libellés | `TABLE` + `CODE` | Complet |
| `ENTITES` | A | Sociétés juridiques | `ID_ENTITE` | Complet |
| `AGENCES` | A | Agences et sites | `ID_AGENCE` | Complet |
| `CLIENTS` | A | Clients donneurs d'ordre et payeurs | `ID_CLIENT` | Incrémental |
| `CONDUCTEURS` | A | Conducteurs salariés et intérimaires | `ID_CONDUCTEUR` | Incrémental |
| `VEHICULES` | A | Tracteurs, porteurs, semis, remorques, VUL | `ID_VEHICULE` | Incrémental |
| `SOUSTRAITANTS` | A | Affrétés et sous-traitants | `ID_SOUSTRAITANT` | Incrémental |
| `ORDRES` | B | Ordres de transport / dossiers | `ID_ORDRE` | Incrémental |
| `VOYAGES` | B | Voyages et liens voyage ↔ ordres | `ID_VOYAGE` + `ID_ORDRE` | Incrémental |
| `VALORISATIONS` | C | Lignes de vente par ordre et par nature | `ID_LIGNE_VENTE` | Incrémental |
| `ACHATS` | C | Achats d'affrètement et de sous-traitance | `ID_LIGNE_ACHAT` | Incrémental |
| `FACTURES` | C | Lignes de factures et avoirs clients | `ID_FACTURE` + `NUM_LIGNE` | Incrémental |

Complet : toute la table à chaque lot. Incrémental : seuls les enregistrements créés, modifiés ou supprimés sur la période du lot (section 7).

## 6. Dictionnaire de données

Une ligne par colonne, dans l'ordre du fichier. O = obligatoire, N = facultatif. → indique une clé étrangère.

**Champs techniques communs**, ajoutés en fin de chaque flux incrémental, dans cet ordre :

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_ENTITE` | ID | O | Société propriétaire de l'enregistrement → ENTITES | SOC01 |
| `DATE_CREATION` | DATEHEURE | O | Création dans e-TMS | 2026-11-10T14:22:05+01:00 |
| `DATE_MAJ` | DATEHEURE | O | Dernière modification ; sert au filtre incrémental | 2026-11-11T17:03:41+01:00 |
| `SUPPRIME` | BOOLEEN | O | 1 si l'enregistrement a été supprimé dans e-TMS | 0 |

Les flux complets (CODIFICATIONS, ENTITES, AGENCES) n'ont pas ces champs : ils portent `ACTIF`.

### 6.1 CODIFICATIONS

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `TABLE` | CODE(30) | O | Nom de la table de codes (liste ci-dessous) | TYPE\_ACTIVITE |
| `CODE` | CODE(10) | O | Code tel qu'il apparaît dans les autres flux | AFFRET |
| `LIBELLE` | TEXTE(100) | O | Libellé e-TMS | Affrètement |
| `ACTIF` | BOOLEEN | O | 0 si le code n'est plus utilisable | 1 |

Tables attendues : `TYPE_ACTIVITE`, `STATUT_ORDRE`, `TYPE_VEHICULE`, `ENERGIE`, `MODE_DETENTION`, `TYPE_CONTRAT`, `NATURE_VENTE`, `NATURE_ACHAT`, `SECTEUR_CLIENT`, `TYPE_FACTURE`. Les codes sont ceux paramétrés chez l'adhérent ; WeMa fait le rapprochement vers son référentiel.

### 6.2 ENTITES

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_ENTITE` | ID | O | Identifiant de la société | SOC01 |
| `RAISON_SOCIALE` | TEXTE(100) | O | Raison sociale | TRANSPORTS TARDET |
| `SIRET` | SIRET | N | SIRET du siège | 41234567800012 |
| `PAYS` | PAYS | O | Pays d'immatriculation | FR |
| `ACTIF` | BOOLEEN | O | 0 si la société n'est plus utilisée | 1 |

### 6.3 AGENCES

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_AGENCE` | ID | O | Identifiant de l'agence | AG-BOURG |
| `LIBELLE_AGENCE` | TEXTE(60) | O | Nom de l'agence | BOURG-EN-BRESSE |
| `ID_ENTITE` | ID | O | Société de rattachement → ENTITES | SOC01 |
| `SIRET` | SIRET | N | SIRET de l'établissement | 41234567800020 |
| `CP` | CP | N | Code postal | 01000 |
| `VILLE` | TEXTE(60) | N | Ville | BOURG-EN-BRESSE |
| `PAYS` | PAYS | O | Pays | FR |
| `ACTIF` | BOOLEEN | O | 0 si l'agence est fermée | 1 |

### 6.4 CLIENTS

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_CLIENT` | ID | O | Identifiant du client | CLI000187 |
| `CODE_CLIENT` | TEXTE(30) | O | Code affiché à l'utilisateur | DUPONT01 |
| `RAISON_SOCIALE` | TEXTE(100) | O | Raison sociale | DUPONT SA |
| `SIRET` | SIRET | N | SIRET | 55212345600018 |
| `CP` | CP | N | Code postal | 69007 |
| `VILLE` | TEXTE(60) | N | Ville | LYON |
| `PAYS` | PAYS | O | Pays | FR |
| `SECTEUR_CLIENT` | CODE(10) | N | Secteur d'activité → CODIFICATIONS | AGRO |
| `ID_CLIENT_PAYEUR` | ID | N | Client facturé, s'il diffère → CLIENTS | CLI000012 |
| `ACTIF` | BOOLEEN | O | 0 si le client est bloqué ou archivé | 1 |

### 6.5 CONDUCTEURS

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_CONDUCTEUR` | ID | O | Identifiant du conducteur | CDR0042 |
| `MATRICULE` | TEXTE(20) | N | Matricule paie, pour le rapprochement avec la paie | 000412 |
| `NOM` | TEXTE(60) | O | Nom | MARTIN |
| `PRENOM` | TEXTE(60) | O | Prénom | PAUL |
| `ID_AGENCE` | ID | O | Agence de rattachement → AGENCES | AG-BOURG |
| `TYPE_CONTRAT` | CODE(10) | O | CDI, CDD, INTERIM → CODIFICATIONS | CDI |
| `DATE_ENTREE` | DATE | N | Date d'entrée | 2022-04-04 |
| `DATE_SORTIE` | DATE | N | Date de sortie, vide si présent |  |

### 6.6 VEHICULES

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_VEHICULE` | ID | O | Identifiant du matériel | VEH0119 |
| `IMMATRICULATION` | IMMAT | O | Immatriculation | GH512KL |
| `TYPE_VEHICULE` | CODE(10) | O | TRACTEUR, PORTEUR, SEMI, REMORQUE, VUL → CODIFICATIONS | TRACTEUR |
| `ENERGIE` | CODE(10) | N | GAZOLE, GNC, GNL, B100, ELEC → CODIFICATIONS | B100 |
| `MODE_DETENTION` | CODE(10) | N | PROPRIETE, CREDITBAIL, LOCATION → CODIFICATIONS | CREDITBAIL |
| `ID_AGENCE` | ID | O | Agence de rattachement → AGENCES | AG-BOURG |
| `DATE_ENTREE_PARC` | DATE | N | Entrée dans le parc | 2024-03-01 |
| `DATE_SORTIE_PARC` | DATE | N | Sortie du parc, vide si en service |  |

### 6.7 SOUSTRAITANTS

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_SOUSTRAITANT` | ID | O | Identifiant du tiers | ST000321 |
| `CODE_SOUSTRAITANT` | TEXTE(30) | O | Code affiché à l'utilisateur | TRANSLYON |
| `RAISON_SOCIALE` | TEXTE(100) | O | Raison sociale | TRANS LYON SARL |
| `SIRET` | SIRET | N | SIRET | 79912345600011 |
| `PAYS` | PAYS | O | Pays | FR |
| `ACTIF` | BOOLEEN | O | 0 si le tiers n'est plus utilisé | 1 |

### 6.8 ORDRES

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_ORDRE` | ID | O | Identifiant de l'ordre | ORD2026004512 |
| `NUM_ORDRE` | TEXTE(30) | O | Numéro affiché à l'utilisateur | JT-26-004512 |
| `ID_CLIENT` | ID | O | Client donneur d'ordre → CLIENTS | CLI000187 |
| `ID_AGENCE` | ID | O | Agence gestionnaire → AGENCES | AG-BOURG |
| `TYPE_ACTIVITE` | CODE(10) | O | PROPRE, AFFRET, LOGIST → CODIFICATIONS | PROPRE |
| `STATUT` | CODE(10) | O | Statut de l'ordre, dont ANNULE → CODIFICATIONS | LIVRE |
| `DATE_CHARGEMENT` | DATE | O | Date de chargement prévue ou réalisée | 2026-11-10 |
| `DATE_LIVRAISON` | DATE | N | Date de livraison | 2026-11-11 |
| `CP_CHARGEMENT` | CP | O | Code postal de chargement | 01100 |
| `PAYS_CHARGEMENT` | PAYS | O | Pays de chargement | FR |
| `CP_LIVRAISON` | CP | O | Code postal de livraison | 69007 |
| `PAYS_LIVRAISON` | PAYS | O | Pays de livraison | FR |
| `POIDS_KG` | QTE | N | Poids total | 24000.000 |
| `NB_PALETTES` | ENTIER | N | Nombre de palettes | 33 |
| `METRES_LINEAIRES_ML` | QTE | N | Mètres linéaires | 13.600 |
| `ID_SOUSTRAITANT` | ID | N | Exécutant tiers si affrété → SOUSTRAITANTS |  |

### 6.9 VOYAGES

Une ligne par couple voyage × ordre : un voyage qui transporte 3 ordres produit 3 lignes.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_VOYAGE` | ID | O | Identifiant du voyage | VOY2026011873 |
| `ID_ORDRE` | ID | O | Ordre transporté → ORDRES | ORD2026004512 |
| `DATE_VOYAGE` | DATE | O | Date de départ | 2026-11-10 |
| `DATE_FIN_VOYAGE` | DATE | N | Date de fin | 2026-11-11 |
| `ID_AGENCE` | ID | O | Agence qui exécute le voyage → AGENCES | AG-BOURG |
| `ID_CONDUCTEUR_1` | ID | N | Conducteur principal → CONDUCTEURS | CDR0042 |
| `ID_CONDUCTEUR_2` | ID | N | Second conducteur (double équipage) → CONDUCTEURS |  |
| `ID_MOTEUR` | ID | N | Tracteur ou porteur → VEHICULES | VEH0119 |
| `ID_REMORQUE` | ID | N | Remorque ou semi → VEHICULES | VEH0310 |
| `ID_SOUSTRAITANT` | ID | N | Voyage confié à un tiers → SOUSTRAITANTS |  |
| `KM_CHARGE_KM` | QTE | N | Kilomètres en charge du voyage | 412.000 |
| `KM_VIDE_KM` | QTE | N | Kilomètres à vide du voyage | 58.000 |
| `KM_TOTAL_KM` | QTE | N | Kilomètres totaux du voyage | 470.000 |

Les kilomètres sont portés par le voyage et répétés sur chaque ligne d'ordre : WeMa ne les additionne pas ligne à ligne.

### 6.10 VALORISATIONS

Une ligne par élément de prix d'un ordre (fret, surcharge gazole, péage, attente…), facturé ou non.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_LIGNE_VENTE` | ID | O | Identifiant de la ligne | VTE2026098812 |
| `ID_ORDRE` | ID | O | Ordre valorisé → ORDRES | ORD2026004512 |
| `NATURE_VENTE` | CODE(10) | O | FRET, GAZOLE, PEAGE, ATTENTE, MANUT, AUTRE → CODIFICATIONS | FRET |
| `LIBELLE` | TEXTE(100) | N | Libellé de la ligne | Transport Bourg - Lyon |
| `QUANTITE` | DECIMAL(12,3) | N | Quantité tarifée | 1.000 |
| `UNITE` | CODE(10) | N | Unité de la quantité (FORFAIT, KM, TONNE, PALETTE…) | FORFAIT |
| `MONTANT_HT` | MONTANT | O | Montant HT de la ligne | 850.00 |
| `DEVISE` | DEVISE | O | Devise | EUR |
| `DATE_VALORISATION` | DATE | O | Date de valorisation de la ligne | 2026-11-10 |
| `ID_FACTURE` | ID | N | Facture qui porte la ligne, vide si non facturée → FACTURES |  |

### 6.11 ACHATS

Une ligne par coût d'affrètement ou de sous-traitance.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_LIGNE_ACHAT` | ID | O | Identifiant de la ligne | ACH2026004410 |
| `ID_ORDRE` | ID | N | Ordre concerné → ORDRES | ORD2026004512 |
| `ID_VOYAGE` | ID | N | Voyage concerné → VOYAGES |  |
| `ID_SOUSTRAITANT` | ID | O | Fournisseur → SOUSTRAITANTS | ST000321 |
| `NATURE_ACHAT` | CODE(10) | O | Nature du coût → CODIFICATIONS | AFFRET |
| `MONTANT_HT` | MONTANT | O | Montant HT | 620.00 |
| `DEVISE` | DEVISE | O | Devise | EUR |
| `DATE_ACHAT` | DATE | O | Date de rattachement du coût | 2026-11-10 |
| `NUM_FACTURE_FOURNISSEUR` | TEXTE(30) | N | Référence de la facture fournisseur | F-2026-1188 |

### 6.12 FACTURES

Une ligne par ligne de facture ou d'avoir client.

| Champ | Type | Oblig. | Description | Exemple |
| --- | --- | --- | --- | --- |
| `ID_FACTURE` | ID | O | Identifiant de la facture | FAC2026007731 |
| `NUM_LIGNE` | ENTIER | O | Numéro de ligne dans la facture | 1 |
| `NUM_FACTURE` | TEXTE(30) | O | Numéro légal de la facture | FA26-07731 |
| `TYPE_FACTURE` | CODE(10) | O | FACTURE ou AVOIR → CODIFICATIONS | FACTURE |
| `DATE_FACTURE` | DATE | O | Date de facture | 2026-11-30 |
| `DATE_ECHEANCE` | DATE | N | Date d'échéance | 2026-12-30 |
| `ID_CLIENT` | ID | O | Client facturé → CLIENTS | CLI000187 |
| `ID_AGENCE` | ID | N | Agence émettrice → AGENCES | AG-BOURG |
| `ID_ORDRE` | ID | N | Ordre facturé → ORDRES | ORD2026004512 |
| `NATURE_VENTE` | CODE(10) | N | Nature de la ligne → CODIFICATIONS | FRET |
| `MONTANT_HT` | MONTANT | O | Montant HT, négatif pour un avoir | 850.00 |
| `DEVISE` | DEVISE | O | Devise | EUR |

## 7. Règles de gestion

- **Extraction incrémentale** : un flux incrémental contient les enregistrements dont `DATE_MAJ` est dans \[periode\_debut ; periode\_fin\[ du manifeste. Deux lots successifs se touchent sans trou ni chevauchement.
- **Modification d'un enfant** : toute modification d'une ligne de voyage, de vente, d'achat ou de facture met à jour sa propre `DATE_MAJ`, même si l'ordre parent n'a pas changé.
- **Application côté WeMa** : chaque ligne reçue remplace intégralement l'enregistrement de même clé (upsert). Une ligne n'est jamais partielle.
- **Voyages** : quand la composition d'un voyage change, toutes ses lignes voyage × ordre sont renvoyées ; un ordre retiré du voyage est envoyé avec `SUPPRIME` = 1.
- **Suppressions** : un enregistrement supprimé dans e-TMS est envoyé une dernière fois avec `SUPPRIME` = 1. Un ordre annulé n'est pas supprimé : il porte `STATUT` = ANNULE.
- **Relations** : toute clé étrangère référence un enregistrement déjà transmis ou présent dans le même lot.
- **Identifiants** : stables dans le temps et jamais réattribués à un autre objet.
- **Montants** : tous HT. Les avoirs sont en montant négatif.
- **Reprise initiale** : un lot INITIALE unique couvre 24 mois glissants (sur `DATE_CHARGEMENT`, `DATE_VALORISATION`, `DATE_ACHAT`, `DATE_FACTURE`) pour ORDRES, VOYAGES, VALORISATIONS, ACHATS, FACTURES, et la totalité des référentiels. Il peut être découpé en fichiers \_P01, \_P02…
- **Cloisonnement** : un compte SFTP ne reçoit que les données d'un adhérent. Pour un groupe multi-sociétés, `ID_ENTITE` permet le filtrage.
- **Données absentes** : un champ qu'e-TMS ne gère pas chez un adhérent reste vide ; Andsoft en donne la liste lors de la recette.

## 8. Sécurité, recette et versionnement

**Sécurité et RGPD**

- Transport chiffré SSH, authentification par clé uniquement, filtrage des IP sources côté WeMa.
- Ouverture du flux uniquement après réception par Andsoft du mandat écrit de l'adhérent ; fermeture sur simple demande de l'adhérent.
- Conducteurs : uniquement les champs de la section 6.5. Aucune coordonnée personnelle ni géolocalisation.
- Fichiers supprimés du SFTP dès l'intégration ; données hébergées dans l'Union européenne.

**Recette**

1. WeMa transmet la version 1.0 de ce document.
2. Andsoft livre un lot d'exemple sur un compte SFTP de test, à partir d'une base de démonstration.
3. WeMa valide la lecture du lot et remonte les écarts par écrit.
4. Groupe Tardet en production : lot INITIALE, puis 5 jours de lots INCREMENTALE contrôlés.
5. Déploiement aux adhérents suivants, chacun avec sa propre section 9 et son compte SFTP.

**Versionnement**

Toute évolution (champ ajouté, type modifié, nouveau flux) fait l'objet d'une nouvelle version, avec une date d'application convenue. Un ajout de colonne se fait toujours en fin de fichier ; `interface_version` du manifeste indique la version appliquée.

| Version | Date | Auteur | Modification |
| --- | --- | --- | --- |
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
| Lot INITIALE | 24 mois glissants avant la date de démarrage |
| Mandat de transmission | \[À SIGNER par Groupe Tardet\] |
| Contacts adhérent | Vincent Tardet (dirigeant), Stéphane Verpoorten (RAF) |

**Spécificité à prévoir** : Tardet suit l'entretien de sa flotte dans e-TMS. WeMa demandera un flux `ENTRETIEN` (domaine D) dans une version 1.1. Andsoft peut-il confirmer dès maintenant que ces données sont extractibles ?
