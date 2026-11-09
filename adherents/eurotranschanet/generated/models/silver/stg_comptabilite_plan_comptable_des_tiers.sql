-- stg_comptabilite_plan_comptable_des_tiers · Euro Trans Chanet
-- Description à compléter
-- Grain : à préciser

with src as (
    select * from {{ source('bronze_eurotranschanet', 'comptabilite_plan_comptable_des_tiers') }}
)

select
    nullif(trim(src.type), '') as type,
    nullif(trim(src.compte_tiers), '') as compte_tiers,
    nullif(trim(src.intitule), '') as intitule,
    nullif(trim(src.code_postal), '') as code_postal,
    nullif(trim(src.ville), '') as ville,
    'eurotranschanet' as societe_key
from src
