-- stg_carburant_table1 · Euro Trans Chanet
-- Rangé dans Carburant, mais colonnes identiques à l'export Entretien Tabletotalcout : famille « Consommation carburants » uniquement
-- Grain : Une opération de coût par ligne

with src as (
    select * from {{ source('bronze_eurotranschanet', 'carburant_table1') }}
)

select
    nullif(trim(src.date), '') as date,
    nullif(trim(src.materiel), '') as materiel,
    nullif(trim(src.famille_rub), '') as famille_rub,
    nullif(trim(src.nature_operation), '') as nature_operation,
    nullif(trim(src.cout_total), '')::numeric as cout_total,
    nullif(trim(src.cout_mo), '')::integer as cout_mo,
    nullif(trim(src.cout_mat), '')::numeric as cout_mat,
    nullif(trim(src.cout_div), '')::integer as cout_div,
    nullif(trim(src.observations), '') as observations,
    nullif(trim(src.doc), '') as doc,
    nullif(trim(src.personnel), '') as personnel,
    nullif(trim(src.operateur_fournisseur_petrolier), '') as operateur_fournisseur_petrolier,
    nullif(trim(src.kms_parcourus_peage), '')::integer as kms_parcourus_peage,
    nullif(trim(src.cnr), '') as cnr,
    'eurotranschanet' as societe_key
from src
