-- stg_comptabilite_plan_comptable · Euro Trans Chanet
-- Description à compléter
-- Grain : à préciser

with src as (
    select * from {{ source('bronze_eurotranschanet', 'comptabilite_plan_comptable') }}
)

select
    nullif(trim(src.type), '') as type,
    nullif(trim(src.numero_compte), '')::integer as numero_compte,
    nullif(trim(src.intitule), '') as intitule,
    nullif(trim(src.nature), '') as nature,
    'eurotranschanet' as societe_key
from src
