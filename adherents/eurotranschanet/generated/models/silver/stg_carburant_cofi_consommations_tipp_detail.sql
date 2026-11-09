-- stg_carburant_cofi_consommations_tipp_detail · Euro Trans Chanet
-- Description à compléter
-- Grain : à préciser

with src as (
    select * from {{ source('bronze_eurotranschanet', 'carburant_cofi_consommations_tipp_detail') }}
)

select
    to_date(nullif(trim(src.date), ''), 'DD/MM/YYYY') as date,
    nullif(trim(src.vehicule), '') as vehicule,
    nullif(trim(src.pays), '') as pays,
    nullif(trim(src.montant_ht), '')::numeric as montant_ht,
    nullif(trim(src.quantite), '')::numeric as quantite,
    nullif(trim(src.kms_compteur), '')::integer as kms_compteur,
    nullif(trim(src.petrolier), '')::integer as petrolier,
    'eurotranschanet' as societe_key
from src
