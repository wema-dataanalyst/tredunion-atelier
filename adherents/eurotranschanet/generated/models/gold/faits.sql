-- FAITS · table longue du modèle Qlik Tredunion
-- Une ligne = un montant pour une catégorie, un mois et les axes connus du flux.

-- Flux f1 : CA TOTAL · CA total · tms_akanea (Euro Trans Chanet)
-- Tous les ordres Akanea, rattachés au mois de chargement
select
    date_trunc('month', tms_akanea.date_chgt)::date as "%Date",
    date_trunc('month', tms_akanea.date_chgt)::date as "Date",
    extract(year from tms_akanea.date_chgt)::int as "Annee",
    extract(month from tms_akanea.date_chgt)::int as "Mois",
    'CA TOTAL' as "%COD_CATEGORIE",
    'CA total' as "LIB_Categorie",
    '€' as "TYP_UNITE",
    null::text as "FLG_CATEGORIE",
    upper(regexp_replace(tms_akanea.plaque_moteur, '[^A-Za-z0-9]', '', 'g')) as "%KEY_VEHICULE",
    null::text as "%LIB_SITE",
    null::text as "%KEY_CHAUFFEUR",
    null::text as "matricule",
    tms_akanea.code_du_client::text as "LIB_CLIENT",
    null::text as "LIB_COLLABORATEUR",
    sum(tms_akanea.montant) as "MontantReel",
    null::numeric as "BudgetNextN",
    null::numeric as "MontantLoc",
    'tms_akanea' as "Source_Faits"
from {{ ref('stg_tms_akanea') }} as tms_akanea
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14

union all

-- Flux f2 : CA AFF · CA affrètement · tms_akanea (Euro Trans Chanet)
-- Ordres d'activité AN et AI, confiés à un affrété
select
    date_trunc('month', tms_akanea.date_chgt)::date as "%Date",
    date_trunc('month', tms_akanea.date_chgt)::date as "Date",
    extract(year from tms_akanea.date_chgt)::int as "Annee",
    extract(month from tms_akanea.date_chgt)::int as "Mois",
    'CA AFF' as "%COD_CATEGORIE",
    'CA affrètement' as "LIB_Categorie",
    '€' as "TYP_UNITE",
    null::text as "FLG_CATEGORIE",
    null::text as "%KEY_VEHICULE",
    null::text as "%LIB_SITE",
    null::text as "%KEY_CHAUFFEUR",
    null::text as "matricule",
    tms_akanea.code_du_client::text as "LIB_CLIENT",
    null::text as "LIB_COLLABORATEUR",
    sum(tms_akanea.montant) as "MontantReel",
    null::numeric as "BudgetNextN",
    null::numeric as "MontantLoc",
    'tms_akanea' as "Source_Faits"
from {{ ref('stg_tms_akanea') }} as tms_akanea
where (activite in ('AN', 'AI'))
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14

union all

-- Flux f3 : CA TPS TOT · CA transport · tms_akanea (Euro Trans Chanet)
-- Ordres d'activité TN et TI, faits par le parc ; LN, BE et ST en attente (questions tms_akanea q7 à q9)
select
    date_trunc('month', tms_akanea.date_chgt)::date as "%Date",
    date_trunc('month', tms_akanea.date_chgt)::date as "Date",
    extract(year from tms_akanea.date_chgt)::int as "Annee",
    extract(month from tms_akanea.date_chgt)::int as "Mois",
    'CA TPS TOT' as "%COD_CATEGORIE",
    'CA transport' as "LIB_Categorie",
    '€' as "TYP_UNITE",
    null::text as "FLG_CATEGORIE",
    upper(regexp_replace(tms_akanea.plaque_moteur, '[^A-Za-z0-9]', '', 'g')) as "%KEY_VEHICULE",
    null::text as "%LIB_SITE",
    null::text as "%KEY_CHAUFFEUR",
    null::text as "matricule",
    tms_akanea.code_du_client::text as "LIB_CLIENT",
    null::text as "LIB_COLLABORATEUR",
    sum(tms_akanea.montant) as "MontantReel",
    null::numeric as "BudgetNextN",
    null::numeric as "MontantLoc",
    'tms_akanea' as "Source_Faits"
from {{ ref('stg_tms_akanea') }} as tms_akanea
where (activite in ('TN', 'TI'))
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14

union all

-- Flux f4 : ST AFF · Sous-traitance affrètement · tms_akanea (Euro Trans Chanet)
-- Achat aux affrétés sur les ordres AN et AI
select
    date_trunc('month', tms_akanea.date_chgt)::date as "%Date",
    date_trunc('month', tms_akanea.date_chgt)::date as "Date",
    extract(year from tms_akanea.date_chgt)::int as "Annee",
    extract(month from tms_akanea.date_chgt)::int as "Mois",
    'ST AFF' as "%COD_CATEGORIE",
    'Sous-traitance affrètement' as "LIB_Categorie",
    '€' as "TYP_UNITE",
    null::text as "FLG_CATEGORIE",
    null::text as "%KEY_VEHICULE",
    null::text as "%LIB_SITE",
    null::text as "%KEY_CHAUFFEUR",
    null::text as "matricule",
    tms_akanea.code_du_client::text as "LIB_CLIENT",
    null::text as "LIB_COLLABORATEUR",
    sum(tms_akanea.montant_total_achat) as "MontantReel",
    null::numeric as "BudgetNextN",
    null::numeric as "MontantLoc",
    'tms_akanea' as "Source_Faits"
from {{ ref('stg_tms_akanea') }} as tms_akanea
where (activite in ('AN', 'AI'))
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14

union all

-- Flux f5 : GO · Gazole · carburant_table (Euro Trans Chanet)
-- Pleins de gazole COFI, montant hors taxe
select
    date_trunc('month', carburant_table.date_heure)::date as "%Date",
    date_trunc('month', carburant_table.date_heure)::date as "Date",
    extract(year from carburant_table.date_heure)::int as "Annee",
    extract(month from carburant_table.date_heure)::int as "Mois",
    'GO' as "%COD_CATEGORIE",
    'Gazole' as "LIB_Categorie",
    '€' as "TYP_UNITE",
    null::text as "FLG_CATEGORIE",
    upper(regexp_replace(carburant_table.materiel, '[^A-Za-z0-9]', '', 'g')) as "%KEY_VEHICULE",
    null::text as "%LIB_SITE",
    null::text as "%KEY_CHAUFFEUR",
    null::text as "matricule",
    null::text as "LIB_CLIENT",
    null::text as "LIB_COLLABORATEUR",
    sum(carburant_table.montant_ht) as "MontantReel",
    null::numeric as "BudgetNextN",
    null::numeric as "MontantLoc",
    'carburant_table' as "Source_Faits"
from {{ ref('stg_carburant_table') }} as carburant_table
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14

union all

-- Flux f6 : PEAGE · Péages · entretien_tabletotalcout (Euro Trans Chanet)
-- Péages tirés de l'export de coûts par véhicule (pas d'export télépéage dans le dossier Péage)
select
    date_trunc('month', entretien_tabletotalcout.date)::date as "%Date",
    date_trunc('month', entretien_tabletotalcout.date)::date as "Date",
    extract(year from entretien_tabletotalcout.date)::int as "Annee",
    extract(month from entretien_tabletotalcout.date)::int as "Mois",
    'PEAGE' as "%COD_CATEGORIE",
    'Péages' as "LIB_Categorie",
    '€' as "TYP_UNITE",
    null::text as "FLG_CATEGORIE",
    null::text as "%KEY_VEHICULE",
    null::text as "%LIB_SITE",
    null::text as "%KEY_CHAUFFEUR",
    null::text as "matricule",
    null::text as "LIB_CLIENT",
    null::text as "LIB_COLLABORATEUR",
    sum(entretien_tabletotalcout.cout_total) as "MontantReel",
    null::numeric as "BudgetNextN",
    null::numeric as "MontantLoc",
    'entretien_tabletotalcout' as "Source_Faits"
from {{ ref('stg_entretien_tabletotalcout') }} as entretien_tabletotalcout
where (famille_rub = 'PEAGES')
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14

union all

-- Flux f7 : MASSE · Masse parc · paie_silae_cout_salariaux (Euro Trans Chanet)
-- Coût employeur des conducteurs ; janvier 2025 seulement
select
    date_trunc('month', paie_silae_cout_salariaux.mois)::date as "%Date",
    date_trunc('month', paie_silae_cout_salariaux.mois)::date as "Date",
    extract(year from paie_silae_cout_salariaux.mois)::int as "Annee",
    extract(month from paie_silae_cout_salariaux.mois)::int as "Mois",
    'MASSE' as "%COD_CATEGORIE",
    'Masse parc' as "LIB_Categorie",
    '€' as "TYP_UNITE",
    null::text as "FLG_CATEGORIE",
    null::text as "%KEY_VEHICULE",
    null::text as "%LIB_SITE",
    null::text as "%KEY_CHAUFFEUR",
    null::text as "matricule",
    null::text as "LIB_CLIENT",
    null::text as "LIB_COLLABORATEUR",
    sum(paie_silae_cout_salariaux.cout_global) as "MontantReel",
    null::numeric as "BudgetNextN",
    null::numeric as "MontantLoc",
    'paie_silae_cout_salariaux' as "Source_Faits"
from {{ ref('stg_paie_silae_cout_salariaux') }} as paie_silae_cout_salariaux
where (matricule is not null and emploi = 'Conducteur Routier')
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
