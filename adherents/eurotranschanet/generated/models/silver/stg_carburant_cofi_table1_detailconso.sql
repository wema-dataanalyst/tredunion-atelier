-- stg_carburant_cofi_table1_detailconso · Euro Trans Chanet
-- Description à compléter
-- Grain : à préciser

with src as (
    select * from {{ source('bronze_eurotranschanet', 'carburant_cofi_table1_detailconso') }}
)

select
    nullif(trim(src.petrolier), '') as petrolier,
    to_date(nullif(trim(src.date), ''), 'DD/MM/YYYY') as date,
    nullif(trim(src.vehicule), '') as vehicule,
    nullif(trim(src.quantite), '')::numeric as quantite,
    nullif(trim(src.chauffeur), '') as chauffeur,
    nullif(trim(src.produit_consomme), '') as produit_consomme,
    nullif(trim(src.montant_ht), '')::numeric as montant_ht,
    nullif(trim(src.compteur), '')::integer as compteur,
    nullif(trim(src.n_bon), '')::integer as n_bon,
    'eurotranschanet' as societe_key
from src
