# Séance de modélisation — Euro Trans Chanet

Générée le 08/11/2026 15:47:47 depuis l'atelier silver → gold.

## Sociétés

- **Euro Trans Chanet** (`eurotranschanet`) — Akanea, Sage 100, COFI, Silae

## carburant_cofi_consommations_tipp_detail · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 1179 lignes analysées · 0/7 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `date` | date | Attribut |  |  |
| `vehicule` | text | Attribut |  |  |
| `pays` | text | Attribut |  |  |
| `montant_ht` | decimal | Attribut |  |  |
| `quantite` | decimal | Attribut |  |  |
| `kms_compteur` | int | Attribut |  |  |
| `petrolier` | int | Attribut |  |  |

**Questions ouvertes**

- [ ] date : date en texte DD/MM/YYYY. Date réelle ou prévue ?
- [ ] pays : valeurs FRANCE. Que signifie chacune ? Faut-il en exclure ?
- [ ] petrolier : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?

## carburant_cofi_etat_synthese_detail · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 1556 lignes analysées · 0/9 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `date` | date | Attribut |  |  |
| `materiel` | text | Attribut |  |  |
| `famille` | text | Attribut |  |  |
| `nature_operation` | text | Attribut |  |  |
| `cout_total` | decimal | Attribut |  |  |
| `couts_main_d_oeuvre` | text | Attribut |  |  |
| `couts_matieres` | decimal | Attribut |  |  |
| `couts_divers` | text | Attribut |  |  |
| `observations` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] date : date en texte DD/MM/YYYY. Date réelle ou prévue ?
- [ ] famille : valeurs Consommation carburants. Que signifie chacune ? Faut-il en exclure ?
- [ ] nature_operation : valeurs Consommations. Que signifie chacune ? Faut-il en exclure ?
- [ ] couts_main_d_oeuvre : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] couts_divers : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] observations : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?

## carburant_cofi_table1_detailconso · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 1833 lignes analysées · 0/9 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `petrolier` | text | Attribut |  |  |
| `date` | date | Attribut |  |  |
| `vehicule` | text | Attribut |  |  |
| `quantite` | decimal | Attribut |  |  |
| `chauffeur` | text | Attribut |  _(donnée personnelle)_ |  |
| `produit_consomme` | text | Attribut |  |  |
| `montant_ht` | decimal | Attribut |  |  |
| `compteur` | int | Attribut |  |  |
| `n_bon` | int | Attribut |  |  |

**Questions ouvertes**

- [ ] petrolier : valeurs LECLERC, SUPER U, DKV, XX CB LECLERC. Que signifie chacune ? Faut-il en exclure ?
- [ ] date : date en texte DD/MM/YYYY. Date réelle ou prévue ?
- [ ] chauffeur : 9 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] produit_consomme : valeurs GO. Que signifie chacune ? Faut-il en exclure ?

## carburant_export · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 1179 lignes analysées · 0/8 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `date` | text | Attribut |  |  |
| `materiel` | text | Attribut |  |  |
| `pays` | text | Attribut |  |  |
| `montant_ht` | decimal | Attribut |  |  |
| `quantite` | decimal | Attribut |  |  |
| `kms_compteur` | int | Attribut |  |  |
| `region` | text | Attribut |  |  |
| `petrolier` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] pays : valeurs FRANCE. Que signifie chacune ? Faut-il en exclure ?
- [ ] petrolier : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?

## carburant_table · Euro Trans Chanet

Pleins de carburant 2025 (export COFI, mêmes lignes que COFI_Table1_DetailConso)

- Grain : Un plein (bon) par ligne
- 1832 lignes analysées · 9/29 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `petrolier` | text | Attribut | Pétrolier ou réseau de la carte |  |
| `date_heure` | date | Attribut | Date du plein |  |
| `code_parc` | int | Attribut | Numéro de parc du véhicule |  |
| `materiel` | text | Référence vers un autre dataset | Immatriculation du véhicule |  |
| `n_carte_import` | text | Attribut |  _(donnée personnelle)_ |  |
| `marque` | text | Attribut |  |  |
| `modele` | text | Attribut |  |  |
| `plein_partiel` | int | Attribut |  |  |
| `quantite` | decimal | Mesure | Quantité livrée (litres d'après le nom de produit GO, à confirmer) |  |
| `chauffeur` | text | Attribut |  _(donnée personnelle)_ |  |
| `n_carte_import_2` | text | Attribut |  _(donnée personnelle)_ |  |
| `produit_consomme` | text | Attribut | Produit (GO sur toutes les lignes) |  |
| `montant_ht` | decimal | Mesure | Montant hors taxe du plein, en € |  |
| `compteur` | int | Attribut | Kilométrage compteur au plein |  |
| `n_bon` | int | Clé (identifiant) | Numéro de bon |  |
| `reference_import` | text | Attribut |  |  |
| `agence` | text | Attribut |  |  |
| `site` | text | Attribut |  |  |
| `activite` | text | Attribut |  |  |
| `achat` | int | Attribut |  |  |
| `vente` | int | Attribut |  |  |
| `compta` | int | Attribut |  |  |
| `fichier_importe` | text | Attribut |  |  |
| `code_import` | text | Attribut |  |  |
| `compteur_importe` | text | Attribut |  |  |
| `observations` | text | Attribut |  |  |
| `conso_theo` | int | Attribut |  |  |
| `pays` | text | Attribut |  |  |
| `region` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] petrolier : valeurs LECLERC, SUPER U, DKV, XX CB LECLERC. Que signifie chacune ? Faut-il en exclure ?
- [ ] date_heure : date en texte DD/MM/YYYY. Date réelle ou prévue ?
- [ ] n_carte_import : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] marque : valeurs RENAULT, VOLVO, MERCEDES BENZ, VOLKSWAGEN, PEUGEOT. Que signifie chacune ? Faut-il en exclure ?
- [ ] marque : 2 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] modele : valeurs RENAULT T, RENAULT, T, FH, MERCEDES. Que signifie chacune ? Faut-il en exclure ?
- [ ] Carburant/Table.xlsx et COFI_Table1_DetailConso.xlsx ont les mêmes 1 832 pleins (1 059 076 € HT, 799 486 L). Est-ce le même export en double ?

## carburant_table1 · Euro Trans Chanet

Rangé dans Carburant, mais colonnes identiques à l'export Entretien Tabletotalcout : famille « Consommation carburants » uniquement

- Grain : Une opération de coût par ligne
- 1557 lignes analysées · 0/14 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `date` | text | Attribut |  |  |
| `materiel` | text | Attribut |  |  |
| `famille_rub` | text | Attribut |  |  |
| `nature_operation` | text | Attribut |  |  |
| `cout_total` | decimal | Attribut |  |  |
| `cout_mo` | int | Attribut |  |  |
| `cout_mat` | decimal | Attribut |  |  |
| `cout_div` | int | Attribut |  |  |
| `observations` | text | Attribut |  |  |
| `doc` | text | Attribut |  |  |
| `personnel` | text | Attribut |  _(donnée personnelle)_ |  |
| `operateur_fournisseur_petrolier` | text | Attribut |  |  |
| `kms_parcourus_peage` | int | Attribut |  |  |
| `cnr` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] famille_rub : valeurs Consommation carburants. Que signifie chacune ? Faut-il en exclure ?
- [ ] nature_operation : valeurs Consommations. Que signifie chacune ? Faut-il en exclure ?
- [ ] cout_mo : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] cout_div : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] observations : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] doc : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] Carburant/Table1.xlsx a exactement les colonnes de l'export Entretien (Tabletotalcout) et 1 555 de ses 1 557 lignes s'y retrouvent (même date, véhicule, coût). Est-ce un export d'entretien rangé dans Carburant ?

## carburant_table3 · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 1421 lignes analysées · 0/15 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `vehicule` | text | Attribut |  |  |
| `date` | date | Attribut |  |  |
| `unite` | text | Attribut |  |  |
| `produit_conso` | text | Attribut |  |  |
| `qte_soute` | text | Attribut |  |  |
| `qte_route` | decimal | Attribut |  |  |
| `compteur` | int | Attribut |  |  |
| `u_cptr` | text | Attribut |  |  |
| `kms_parc` | int | Attribut |  |  |
| `consom` | decimal | Attribut |  |  |
| `cumul_kms` | int | Attribut |  |  |
| `cumul_qte` | decimal | Attribut |  |  |
| `cumul_conso` | decimal | Attribut |  |  |
| `chauffeur` | text | Attribut |  _(donnée personnelle)_ |  |
| `petrolier` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] date : date en texte DD/MM/YYYY. Date réelle ou prévue ?
- [ ] unite : valeurs L. Que signifie chacune ? Faut-il en exclure ?
- [ ] produit_conso : valeurs GO. Que signifie chacune ? Faut-il en exclure ?
- [ ] qte_soute : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] u_cptr : valeurs KM, -1. Que signifie chacune ? Faut-il en exclure ?
- [ ] u_cptr : 3 % de valeurs vides. Normal ? Que faire de ces lignes ?

## comptabilite_balance · Euro Trans Chanet

Balance des comptes Sage 100, exercice 2025 en un seul bloc (période dans le .meta.json)

- Grain : Un compte général par ligne, cumul de l'exercice
- 351 lignes analysées · 6/6 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `numero_compte` | int | Clé (identifiant) | Numéro de compte général (8 chiffres ; 1 ou 2 chiffres sur les lignes de total) |  |
| `intitule` | text | Attribut | Intitulé du compte |  |
| `mouvements_debit` | decimal | Mesure | Total des débits de l'exercice, en € |  |
| `mouvements_credit` | decimal | Mesure | Total des crédits de l'exercice, en € |  |
| `soldes_debit` | decimal | Mesure | Solde débiteur de fin d'exercice, en € |  |
| `soldes_credit` | decimal | Mesure | Solde créditeur de fin d'exercice, en € |  |

**Règles silver**

- Exclure les lignes de total par classe et sous-classe (numéro à 1 ou 2 chiffres) — `numero_compte >= 10000000`

**Cas particuliers**

- Bloc annuel du 2025-01-01 au 2025-12-31 sans date par ligne : sert aux contrôles, n'alimente pas FAITS (pas de répartition par douze).

**Questions ouvertes**

- [ ] intitule : majuscules et minuscules mélangées. Même référence ?
- [ ] mouvements_debit : 11 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] mouvements_credit : 36 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] soldes_debit : 41 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] soldes_credit : 72 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] La balance couvre toute l'année 2025 d'un bloc. Pouvez-vous l'exporter mois par mois (ou le grand livre) pour alimenter le dashboard mensuel ?

## comptabilite_balance_des_tiers · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 1262 lignes analysées · 0/8 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `numero_compte` | text | Attribut |  |  |
| `intitule` | text | Attribut |  |  |
| `mouvements_anterieurs_debit` | decimal | Attribut |  |  |
| `mouvements_anterieurs_credit` | decimal | Attribut |  |  |
| `mouvements_debit` | decimal | Attribut |  |  |
| `mouvements_credit` | decimal | Attribut |  |  |
| `soldes_cumules_debit` | decimal | Attribut |  |  |
| `soldes_cumules_credit` | decimal | Attribut |  |  |

**Questions ouvertes**

- [ ] mouvements_anterieurs_debit : 72 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] mouvements_anterieurs_credit : 85 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] mouvements_debit : 18 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] mouvements_credit : 9 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] soldes_cumules_debit : 83 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] soldes_cumules_credit : 86 % de valeurs vides. Normal ? Que faire de ces lignes ?

## comptabilite_plan_comptable · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 745 lignes analysées · 0/4 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `type` | text | Attribut |  |  |
| `numero_compte` | int | Attribut |  |  |
| `intitule` | text | Attribut |  |  |
| `nature` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] type : valeurs Détail, Total. Que signifie chacune ? Faut-il en exclure ?
- [ ] intitule : majuscules et minuscules mélangées. Même référence ?

## comptabilite_plan_comptable_des_tiers · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 8027 lignes analysées · 0/5 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `type` | text | Attribut |  |  |
| `compte_tiers` | text | Attribut |  |  |
| `intitule` | text | Attribut |  |  |
| `code_postal` | text | Attribut |  |  |
| `ville` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] type : valeurs Client, Fournisseur, Salarié, Autre. Que signifie chacune ? Faut-il en exclure ?
- [ ] ville : majuscules et minuscules mélangées. Même référence ?

## entretien_tabletotalcout · Euro Trans Chanet

Coûts par véhicule 2025 (entretien, péages, carburant, financement…)

- Grain : Une opération de coût par ligne
- 15172 lignes analysées · 5/14 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `date` | date | Attribut | Date de l'opération |  |
| `materiel` | text | Attribut | Véhicule : numéro de parc / immatriculation |  |
| `famille_rub` | text | Attribut | Famille de coût (PEAGES, Consommation carburants, MOTEUR…) |  |
| `nature_operation` | text | Attribut | Nature de l'opération |  |
| `cout_total` | decimal | Mesure | Coût total de l'opération, en € |  |
| `cout_mo` | decimal | Attribut |  |  |
| `cout_mat` | decimal | Attribut |  |  |
| `cout_div` | decimal | Attribut |  |  |
| `observations` | text | Attribut |  |  |
| `doc` | text | Attribut |  |  |
| `personnel` | text | Attribut |  _(donnée personnelle)_ |  |
| `operateur_fournisseur_petrolier` | text | Attribut |  |  |
| `kms_parcourus_peage` | int | Attribut |  |  |
| `cnr` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] cout_mo : 99 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] cout_mat : 88 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] cout_div : 12 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] observations : 48 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] doc : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] personnel : 5 % de valeurs vides. Normal ? Que faire de ces lignes ?

## paie_silae_cout_salariaux · Euro Trans Chanet

Coûts salariaux Silae par salarié, export de janvier 2025 seulement

- Grain : Un salarié par mois de paie
- 31 lignes analysées · 24/24 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `matricule` | int | Clé (identifiant) | Matricule de paie |  |
| `salarie` | text | Attribut | Nom du salarié _(donnée personnelle)_ |  |
| `mois` | date | Attribut | Mois de paie (premier jour du mois) |  |
| `heures_theoriques` | decimal | Mesure | Heures théoriques du mois |  |
| `heures_normales` | decimal | Mesure | Heures normales payées |  |
| `heures_majorees` | decimal | Mesure | Heures majorées payées |  |
| `total_heures` | decimal | Mesure | Total des heures payées |  |
| `cp_pris` | int | Attribut | Congés payés pris |  |
| `rtt_recup_pris` | text | Attribut | RTT et récupérations pris |  |
| `heures_reelles` | decimal | Mesure | Heures réelles |  |
| `brut` | decimal | Mesure | Salaire brut, en € |  |
| `charges_salariales` | decimal | Mesure | Charges salariales, en € |  |
| `charges_patronales` | decimal | Mesure | Charges patronales, en € |  |
| `charges_patronales_2` | decimal | Attribut | Deuxième colonne « charges patronales » de Silae (valeurs de 5 à 73, sens à confirmer) |  |
| `supplements_cout_global` | decimal | Mesure | Suppléments au coût global, en € |  |
| `cout_global` | decimal | Mesure | Coût employeur total du salarié sur le mois, en € |  |
| `cout_horaire_moyen` | decimal | Attribut | Coût horaire moyen, en €/h |  |
| `pas` | decimal | Attribut | Prélèvement à la source |  |
| `net_a_payer` | decimal | Attribut | Net à payer, en € |  |
| `forfait_jour` | text | Attribut | Salarié au forfait jours |  |
| `entree` | date | Attribut | Date d'entrée |  |
| `sortie` | text | Attribut | Date de sortie |  |
| `emploi` | text | Attribut | Emploi du salarié |  |
| `etablissement` | text | Attribut | Établissement de paie |  |

**Cas particuliers**

- 3 lignes de total sans matricule ni mois en bas de l'export (leur cout_global égale la somme des 28 salariés) : écartées par les filtres des flux et des contrôles.

**Questions ouvertes**

- [ ] mois : date en texte DD/MM/YYYY. Date réelle ou prévue ?
- [ ] heures_majorees : 16 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] L'export Silae ne contient que janvier 2025 (28 salariés). Pouvez-vous envoyer les douze mois ?
- [ ] Avez-vous des intérimaires (compte 621 : 59 420 € en 2025) ? Leurs heures et leur coût sont-ils suivis quelque part ?

## tms_akanea · Euro Trans Chanet

Ordres de transport 2025 exportés d'Akanea (feuille Suivi)

- Grain : Une ligne par ordre de transport
- 10596 lignes analysées · 8/27 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `n_ordre` | text | Clé (identifiant) | Numéro d'ordre |  |
| `code_du_client` | text | Attribut | Code client Akanea |  |
| `date_chgt` | date | Attribut | Date de chargement |  |
| `ville_chgt` | text | Attribut |  |  |
| `livraison` | date | Attribut |  |  |
| `differentes_villes_de_livraison` | text | Attribut |  |  |
| `activite` | text | Attribut | Code activité de l'ordre (TN, AN, LN, TI, AI, BE, ST) |  |
| `article` | text | Attribut |  |  |
| `point_de_livraison_suppl` | int | Attribut |  |  |
| `montant` | decimal | Mesure | Montant facturé de l'ordre, en € |  |
| `montant_b` | decimal | Attribut |  |  |
| `montant_taxe_de_facturation_repartie` | decimal | Attribut |  |  |
| `majoration_gasoil` | decimal | Attribut |  |  |
| `montant_total_achat` | decimal | Mesure | Montant d'achat de l'ordre, en € |  |
| `marge_en_valeur` | decimal | Attribut |  |  |
| `reference` | text | Attribut |  |  |
| `poids` | decimal | Attribut |  |  |
| `palette` | decimal | Attribut |  |  |
| `longueur` | decimal | Attribut |  |  |
| `n_feuille_de_route` | text | Attribut |  |  |
| `affrete` | text | Attribut | Affrété (sous-traitant) de l'ordre, vide si fait par le parc |  |
| `nom_du_chauffeur` | text | Attribut |  _(donnée personnelle)_ |  |
| `plaque_moteur` | text | Référence vers un autre dataset | Immatriculation du tracteur |  |
| `km_cartographique` | int | Attribut |  |  |
| `nombre_de_chargement` | int | Attribut |  |  |
| `nombre_de_livraison` | int | Attribut |  |  |
| `surcharge` | int | Attribut |  |  |

**Cas particuliers**

- Les 2 225 ordres sans plaque_moteur sont exactement ceux qui ont un affrété : l'affrètement n'a pas de véhicule du parc.

**Questions ouvertes**

- [ ] date_chgt : date en texte DD/MM/YYYY. Date réelle ou prévue ?
- [ ] livraison : date en texte DD/MM/YYYY. Date réelle ou prévue ?
- [ ] reference : 6 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] n_feuille_de_route : 10 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] Les ordres LN (763 576 €, 536 ordres) : est-ce de la location de véhicules avec chauffeur ? Dans quel CA les ranger (transport, logistique, autre) ?
- [ ] CA transport : faut-il le compter dans « CA TPS » ou « CA TPS TOT » ? Quelle différence faites-vous entre les deux ?
- [ ] Les ordres BE (5) et ST (1) : benne et stockage ? La balance porte 33 030 € en benne et 7 059 € en stockage, Akanea seulement 2 634 €.

## tms_akanea_donnees_activites_achats · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 4 lignes analysées · 0/7 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `code` | text | Attribut |  |  |
| `libelle` | text | Attribut |  |  |
| `code_tva` | int | Attribut |  |  |
| `taux` | int | Attribut |  |  |
| `n_de_compte` | int | Attribut |  |  |
| `actif` | text | Attribut |  |  |
| `societes_autorisees` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] actif : valeurs true. Que signifie chacune ? Faut-il en exclure ?
- [ ] societes_autorisees : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?

## tms_akanea_donnees_activites_ventes · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 33 lignes analysées · 0/7 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `code_activite` | text | Attribut |  |  |
| `libelle` | text | Attribut |  |  |
| `code_tva` | int | Attribut |  |  |
| `taux` | decimal | Attribut |  |  |
| `n_de_compte` | int | Attribut |  |  |
| `actif` | text | Attribut |  |  |
| `societes_autorisees` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] n_de_compte : 3 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] actif : valeurs true. Que signifie chacune ? Faut-il en exclure ?
- [ ] societes_autorisees : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?

## tms_akanea_donnees_articles · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 95 lignes analysées · 0/5 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `code_article` | text | Attribut |  |  |
| `libelle` | text | Attribut |  |  |
| `activite_vente` | text | Attribut |  |  |
| `activite_achat` | text | Attribut |  |  |
| `societes_autorisees` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] activite_vente : 68 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] activite_achat : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] societes_autorisees : 100 % de valeurs vides. Normal ? Que faire de ces lignes ?

## tms_akanea_donnees_tiers · Euro Trans Chanet

_Description à compléter_

- Grain : à préciser
- 8507 lignes analysées · 1/16 colonnes documentées

| Colonne | Type | Rôle | Description | Valeurs codées |
|---|---|---|---|---|
| `type` | text | Attribut |  |  |
| `code` | text | Attribut |  |  |
| `nom` | text | Attribut | Raison sociale du tiers (entreprise) |  |
| `adresse_1` | text | Attribut |  _(donnée personnelle)_ |  |
| `cp` | text | Attribut |  |  |
| `ville` | text | Attribut |  |  |
| `region` | text | Attribut |  |  |
| `telephone` | text | Attribut |  _(donnée personnelle)_ |  |
| `adresse_mail` | text | Attribut |  _(donnée personnelle)_ |  |
| `fax` | text | Attribut |  _(donnée personnelle)_ |  |
| `adresse_2` | text | Attribut |  _(donnée personnelle)_ |  |
| `m_regl` | text | Attribut |  |  |
| `tarif_as` | text | Attribut |  |  |
| `nb_exempl` | int | Attribut |  |  |
| `statut` | text | Attribut |  |  |
| `n_siret` | text | Attribut |  |  |

**Questions ouvertes**

- [ ] type : valeurs CA, DI, CL, AF, CD, CE. Que signifie chacune ? Faut-il en exclure ?
- [ ] adresse_1 : majuscules et minuscules mélangées. Même référence ?
- [ ] telephone : 26 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] adresse_mail : 68 % de valeurs vides. Normal ? Que faire de ces lignes ?
- [ ] adresse_mail : majuscules et minuscules mélangées. Même référence ?
- [ ] fax : 45 % de valeurs vides. Normal ? Que faire de ces lignes ?

## Relations

- `carburant_table.materiel` → `tms_akanea.plaque_moteur` — Correspondance via table, normalisation : lettres et chiffres seulement, majuscules — 92.7 % rapprochés  
  Immatriculations des pleins retrouvées sur les ordres Akanea ; les véhicules sans ordre (porteurs, VL) n'y sont pas

## Flux vers FAITS

### tms_akanea → CA TOTAL · CA total

Tous les ordres Akanea, rattachés au mois de chargement

- Somme de `montant` dans `MontantReel` (€), par mois de `date_chgt`
- Axes : véhicule plaque_moteur, chauffeur —, site —, client code_du_client

- 5291 lignes FAITS dans l'aperçu

### tms_akanea → CA AFF · CA affrètement

Ordres d'activité AN et AI, confiés à un affrété

- Somme de `montant` dans `MontantReel` (€), par mois de `date_chgt`
- Axes : véhicule —, chauffeur —, site —, client code_du_client
- Filtre : `activite in ('AN', 'AI')`
- 539 lignes FAITS dans l'aperçu

### tms_akanea → CA TPS TOT · CA transport

Ordres d'activité TN et TI, faits par le parc ; LN, BE et ST en attente (questions tms_akanea q7 à q9)

- Somme de `montant` dans `MontantReel` (€), par mois de `date_chgt`
- Axes : véhicule plaque_moteur, chauffeur —, site —, client code_du_client
- Filtre : `activite in ('TN', 'TI')`
- 4696 lignes FAITS dans l'aperçu

### tms_akanea → ST AFF · Sous-traitance affrètement

Achat aux affrétés sur les ordres AN et AI

- Somme de `montant_total_achat` dans `MontantReel` (€), par mois de `date_chgt`
- Axes : véhicule —, chauffeur —, site —, client code_du_client
- Filtre : `activite in ('AN', 'AI')`
- 539 lignes FAITS dans l'aperçu

### carburant_table → GO · Gazole

Pleins de gazole COFI, montant hors taxe

- Somme de `montant_ht` dans `MontantReel` (€), par mois de `date_heure`
- Axes : véhicule materiel, chauffeur —, site —, client —

- 367 lignes FAITS dans l'aperçu

### entretien_tabletotalcout → PEAGE · Péages

Péages tirés de l'export de coûts par véhicule (pas d'export télépéage dans le dossier Péage)

- Somme de `cout_total` dans `MontantReel` (€), par mois de `date`
- Axes : véhicule —, chauffeur —, site —, client —
- Filtre : `famille_rub = 'PEAGES'`
- 12 lignes FAITS dans l'aperçu

### paie_silae_cout_salariaux → MASSE · Masse parc

Coût employeur des conducteurs ; janvier 2025 seulement

- Somme de `cout_global` dans `MontantReel` (€), par mois de `mois`
- Axes : véhicule —, chauffeur —, site —, client —
- Filtre : `matricule is not null and emploi = 'Conducteur Routier'`
- 1 lignes FAITS dans l'aperçu

## Couverture du catalogue de mesures

26 alimentées, 6 partielles, 57 non alimentées, 4 à corriger sur 93.

| Mesure | Statut | Manque |
|---|---|---|
| % Charges Vs CA Réel | Alimentée |  |
| % Evol CA | Alimentée |  |
| % Intérim Vs Réel | Partielle | Dont Intérim |
| % Masse Vs CA Réel | Alimentée |  |
| Budget | Non alimentée | CA TOTAL |
| Budget affrètement | Non alimentée | CA AFF |
| Budget logistique | Non alimentée | CA LOG |
| Budget parc | Non alimentée | CA TPS |
| Budget résultat | Non alimentée | Résultat Net filiale, CH EXEP, PR EXEP |
| CA / Heure travaillée Année | Non alimentée | CA TPS, Nbre Heure effectif/payée, Nbre Heure Interim |
| CA Affrètement | Alimentée |  |
| CA Affrètement année | Alimentée |  |
| CA Affrètement M-1 | Alimentée |  |
| CA Affrètement N-1 | Alimentée |  |
| CA Budget / Heure travaillée Année | Non alimentée | Masse parc, CA TPS, Nbre Heure effectif/payée, Nbre Heure Interim |
| CA Logistique | Non alimentée | CA LOG |
| CA Logistique Année | Non alimentée | CA LOG |
| CA Logistique M-1 | Non alimentée | CA LOG |
| CA Logistique N-1 | Non alimentée | CA LOG |
| CA parc | Alimentée |  |
| CA parc Année | Alimentée |  |
| CA parc M-1 | Alimentée |  |
| CA parc N-1 | Alimentée |  |
| CA Réel | Alimentée |  |
| CA Réel Année | Alimentée |  |
| CA Réel M | Partielle | PR EXEP, CH EXEP |
| CA Réel M-1 | Alimentée |  |
| CA Réel N-1 | Alimentée |  |
| Charges | Partielle | FOUR, LOC, ENTR, AMORT, ASS, TEL |
| Charges affrètement | Alimentée |  |
| Charges logistiques | Non alimentée | ST LOG |
| Charges réelles | Alimentée |  |
| Charges VS KM | Non alimentée | Km, Nbre de kms parcourus |
| Consommation | Non alimentée | Moyenne Conso/Tr |
| Consommation année | Non alimentée | Moyenne Conso/Tr |
| Cout ADM parc | Non alimentée | COUT ADM PARC, Masse Adm, Crédit Bail Tracteur, Crédit Bail Remorque, Assurance engins, Assurance camions |
| Cout ADM Parc / moteur | À corriger |  |
| Coût Loyer par véhicule SR | Non alimentée | MontantLoc |
| Coût Loyer par véhicule SR Année | Non alimentée | MontantLoc |
| Coût Loyer par véhicule TR | Non alimentée | MontantLoc |
| Coût Loyer par véhicule TR Année | Non alimentée | MontantLoc |
| Ecart Budget VS Réel | Partielle | CA TOTAL |
| Ecart Budget vs résultat réel | Non alimentée | Résultat Net filiale, CH EXEP, PR EXEP |
| Entretien | Non alimentée | Entretien + Pneumatique + Casse, Consomables Mécano, Entretien Camion, Pneumatique |
| Entretien Année | Non alimentée | Entretien + Pneumatique + Casse, Consomables Mécano, Entretien Camion, Pneumatique |
| Frais Parc propre | Non alimentée | Frais de Parc Propre |
| Frais parc propre Année | Non alimentée | Frais de Parc Propre |
| Frais sous traitance | Non alimentée | ST TPS |
| Frais sous traitance année | Non alimentée | ST TPS |
| KM Réel | Non alimentée | Km, Nbre de kms parcourus |
| KM Réel année | Non alimentée | Km, Nbre de kms parcourus |
| Location Logidis | Non alimentée | Location véhicule |
| Location matériel roulant | Non alimentée | Matériel Roulant |
| Location matériel roulant année | Non alimentée | Matériel Roulant |
| Marge affrètement | Alimentée |  |
| Marge affrètement année | À corriger |  |
| Marge logistique | À corriger | CA LOG |
| Marge parc propre | Partielle | Frais de Parc Propre, ST TPS |
| Marge parc propre année | Partielle | Frais de Parc Propre, ST TPS |
| Masse Budget Intérim Réel | Non alimentée | Dont Intérim |
| Masse Budget Intérim Réel année | Non alimentée | Dont Intérim |
| Marge budget réel | Non alimentée | Masse parc |
| Masse chargeur | Non alimentée | Masse chargeur |
| Masse intérim Réel | Non alimentée | Dont Intérim |
| Masse intérim Réel année | Non alimentée | Dont Intérim |
| Masse réel | Alimentée |  |
| Masse réel année | Alimentée |  |
| Masse réel intermin M-1 | Non alimentée | Dont Intérim |
| Masse réel intermin N-1 | Non alimentée | Dont Intérim |
| Masse réel M-1 | Alimentée |  |
| Masse réel N-1 | Alimentée |  |
| Nbre Heure Budget Réel | Non alimentée | Nbre Heure effectif/payée, Nbre Heure Interim |
| Nbre Heure Réel | Non alimentée | Nbre Heure effectif/payée, Nbre Heure Interim |
| Nbre Heure Réel année | Non alimentée | Nbre Heure effectif/payée, Nbre Heure Interim |
| Nbre Heure Réel M-1 | Non alimentée | Nbre Heure effectif/payée, Nbre Heure Interim |
| Nbre Heure Réel N-1 | Non alimentée | Nbre Heure effectif/payée, Nbre Heure Interim |
| NB SR | Non alimentée | Location véhicule |
| NB SR Logidis | Non alimentée | Location véhicule |
| NB TR | Non alimentée | Location véhicule |
| NR Tr Logidis | Non alimentée | Location véhicule |
| Nb Véhicules | Alimentée |  |
| Nb Véhicules Année | Alimentée |  |
| Peage | Alimentée |  |
| Péage année | Alimentée |  |
| Prix carburant année | Non alimentée | Prix Moyen du Litre |
| Ratio logidis | Non alimentée |  |
| Résultat Avec Exceptionnel Réel | Non alimentée | Résultat Net filiale, CH EXEP, PR EXEP |
| Résultat réel M-1 | Non alimentée | Résultat Net filiale, CH EXEP, PR EXEP |
| Résultat réel M-1 | Non alimentée | Résultat Net filiale, CH EXEP, PR EXEP |
| Résultat sans exceptionnel réel | Non alimentée | Résultat Net filiale |
| Taxe à l'essieu Logidis | Non alimentée | Taxe à l essieu |
| Total cout fixe | À corriger | Matériel Roulant |
| Total exceptionnel | Non alimentée | PR EXEP, CH EXEP |

## Anomalies du catalogue

- **% Charges Vs CA Réel** : « Charges » écrit sans crochets : Qlik le lit comme un champ inexistant
- **CA Budget / Heure travaillée Année** : Les branches mois / année ne filtrent pas les mêmes catégories
- **Charges réelles** : Somme « tout sauf … » : garde DISTANCE, JOUR, donc des km ou des jours s'ajoutent aux euros (filtrer TYP_UNITE={'€'})
- **Charges VS KM** : « Charges » écrit sans crochets : Qlik le lit comme un champ inexistant
- **Cout ADM Parc / moteur** : Référence introuvable : [Coût ADM Parc]
- **Marge affrètement année** : Référence introuvable : [Charges Affrètement Année]
- **Marge logistique** : Référence introuvable : [Charges Logistique]
- **Masse réel intermin M-1** : Nommée M-1, mais calcule N-1 (vSET_N-1)
- **Nbre Heure Réel N-1** : Nommée N-1, mais une branche calcule la période courante
- **Résultat réel M-1** : Nom en double (2 définitions)
- **Résultat réel M-1** : Nom en double (2 définitions) ; Nommée M-1, mais calcule N-1 (vSET_N-1)
- **Total cout fixe** : Référence introuvable : [Coût ADM Parc]

## Journal de séance

- 22:25 — « bascule adhérent » → Exemple Kessler remplacé par Euro Trans Chanet. Dix-huit exports SFTP convertis en CSV et profilés. Noms, chauffeurs, cartes, téléphones et adresses marqués comme données personnelles. (2 modifications)
- 23:30 — « migration normalisation » → Excel Euro Trans Chanet déplacés dans data/raw, CSV régénérés par npm run normaliser (recettes Sage de la mémoire), datasets reprofilés, données personnelles remarquées. (1 modifications)
- 00:15 — « maquette Euro Trans Chanet » → Maquette d'avant-séance sans l'adhérent. Sept flux tirés d'Akanea (CA TOTAL, CA AFF, CA TPS TOT, ST AFF), du carburant COFI (GO), des péages de l'outil de parc (PEAGE) et de la paie Silae (MASSE · Masse parc). Mesures alimentées 0 → 26 (6 partielles), FAITS 0 → 11 445 lignes. Hypothèses : 2 basses (f6 péages, f7 masse parc), 6 moyennes (f1 à f5, règle des sous-totaux de la balance), 0 haute (mémoire comptes et colonnes vide). Contrôles en écart : c3 paie Silae contre 641 et 645 (janvier seul, 89,7 %), c5 balance sans date par ligne, c6 péages contre Autoroutes (23,7 %). L'écart Akanea 5,86 M€ contre comptes 70 12,13 M€ venait des lignes de sous-total de la balance comptées deux fois : après exclusion, écart 0,02 %. Carburant/Table1 laissé en question (export d'entretien rangé dans Carburant ?). Taux Kessler (maquette à l'aveugle, mémoire vide, npm run evaluer) : flux 14/14, décodages 6/6, 43 mesures et 826 lignes FAITS contre 38 et 716 au corrigé ; préfixes de compte plus précis que le corrigé (706100 pour 7061), comptés comme retrouvés. Limites : exemples d'AGENTS.md tirés de Kessler (test pas tout à fait à l'aveugle), trajets sans véhicule, DIM_SITE vide. (9 modifications)
- 09:30 — « questions de séance » → Liste unique des questions (npm run questions, onglet Questions), registre spec/reponses.yml, procédure /seance. (3 modifications)
- 09:50 — « tms_akanea_donnees_tiers.nom donnée personnelle ? » → Michel : les noms de tiers sont des raisons sociales d'entreprises, colonne nom non personnelle. Débloque les questions f5 et carburant qui citent des marques de cartes carburant. (1 modifications)
