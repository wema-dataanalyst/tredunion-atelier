-- stg_comptabilite_balance_des_tiers · Euro Trans Chanet
-- Description à compléter
-- Grain : à préciser

with src as (
    select * from {{ source('bronze_eurotranschanet', 'comptabilite_balance_des_tiers') }}
)

select
    nullif(trim(src.numero_compte), '') as numero_compte,
    nullif(trim(src.intitule), '') as intitule,
    nullif(trim(src.mouvements_anterieurs_debit), '')::numeric as mouvements_anterieurs_debit,
    nullif(trim(src.mouvements_anterieurs_credit), '')::numeric as mouvements_anterieurs_credit,
    nullif(trim(src.mouvements_debit), '')::numeric as mouvements_debit,
    nullif(trim(src.mouvements_credit), '')::numeric as mouvements_credit,
    nullif(trim(src.soldes_cumules_debit), '')::numeric as soldes_cumules_debit,
    nullif(trim(src.soldes_cumules_credit), '')::numeric as soldes_cumules_credit,
    'eurotranschanet' as societe_key
from src
