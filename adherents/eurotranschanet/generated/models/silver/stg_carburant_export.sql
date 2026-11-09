-- stg_carburant_export · Euro Trans Chanet
-- Description à compléter
-- Grain : à préciser

with src as (
    select * from {{ source('bronze_eurotranschanet', 'carburant_export') }}
)

select
    nullif(trim(src.date), '') as date,
    nullif(trim(src.materiel), '') as materiel,
    nullif(trim(src.pays), '') as pays,
    nullif(trim(src.montant_ht), '')::numeric as montant_ht,
    nullif(trim(src.quantite), '')::numeric as quantite,
    nullif(trim(src.kms_compteur), '')::integer as kms_compteur,
    nullif(trim(src.region), '') as region,
    nullif(trim(src.petrolier), '') as petrolier,
    'eurotranschanet' as societe_key
from src
