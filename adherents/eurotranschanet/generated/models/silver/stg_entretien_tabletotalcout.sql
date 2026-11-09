-- stg_entretien_tabletotalcout · Euro Trans Chanet
-- Coûts par véhicule 2025 (entretien, péages, carburant, financement…)
-- Grain : Une opération de coût par ligne

with src as (
    select * from {{ source('bronze_eurotranschanet', 'entretien_tabletotalcout') }}
)

select
    to_date(nullif(trim(src.date), ''), 'DD/MM/YYYY') as date,  -- Date de l'opération
    nullif(trim(src.materiel), '') as materiel,  -- Véhicule : numéro de parc / immatriculation
    nullif(trim(src.famille_rub), '') as famille_rub,  -- Famille de coût (PEAGES, Consommation carburants, MOTEUR…)
    nullif(trim(src.nature_operation), '') as nature_operation,  -- Nature de l'opération
    nullif(trim(src.cout_total), '')::numeric as cout_total,  -- Coût total de l'opération, en €
    nullif(trim(src.cout_mo), '')::numeric as cout_mo,
    nullif(trim(src.cout_mat), '')::numeric as cout_mat,
    nullif(trim(src.cout_div), '')::numeric as cout_div,
    nullif(trim(src.observations), '') as observations,
    nullif(trim(src.doc), '') as doc,
    nullif(trim(src.personnel), '') as personnel,
    nullif(trim(src.operateur_fournisseur_petrolier), '') as operateur_fournisseur_petrolier,
    nullif(trim(src.kms_parcourus_peage), '')::integer as kms_parcourus_peage,
    nullif(trim(src.cnr), '') as cnr,
    'eurotranschanet' as societe_key
from src
