-- stg_carburant_cofi_etat_synthese_detail · Euro Trans Chanet
-- Description à compléter
-- Grain : à préciser

with src as (
    select * from {{ source('bronze_eurotranschanet', 'carburant_cofi_etat_synthese_detail') }}
)

select
    to_date(nullif(trim(src.date), ''), 'DD/MM/YYYY') as date,
    nullif(trim(src.materiel), '') as materiel,
    nullif(trim(src.famille), '') as famille,
    nullif(trim(src.nature_operation), '') as nature_operation,
    nullif(trim(src.cout_total), '')::numeric as cout_total,
    nullif(trim(src.couts_main_d_oeuvre), '') as couts_main_d_oeuvre,
    nullif(trim(src.couts_matieres), '')::numeric as couts_matieres,
    nullif(trim(src.couts_divers), '') as couts_divers,
    nullif(trim(src.observations), '') as observations,
    'eurotranschanet' as societe_key
from src
