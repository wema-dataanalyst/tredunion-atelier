-- stg_carburant_table3 · Euro Trans Chanet
-- Description à compléter
-- Grain : à préciser

with src as (
    select * from {{ source('bronze_eurotranschanet', 'carburant_table3') }}
)

select
    nullif(trim(src.vehicule), '') as vehicule,
    to_date(nullif(trim(src.date), ''), 'DD/MM/YYYY') as date,
    nullif(trim(src.unite), '') as unite,
    nullif(trim(src.produit_conso), '') as produit_conso,
    nullif(trim(src.qte_soute), '') as qte_soute,
    nullif(trim(src.qte_route), '')::numeric as qte_route,
    nullif(trim(src.compteur), '')::integer as compteur,
    nullif(trim(src.u_cptr), '') as u_cptr,
    nullif(trim(src.kms_parc), '')::integer as kms_parc,
    nullif(trim(src.consom), '')::numeric as consom,
    nullif(trim(src.cumul_kms), '')::integer as cumul_kms,
    nullif(trim(src.cumul_qte), '')::numeric as cumul_qte,
    nullif(trim(src.cumul_conso), '')::numeric as cumul_conso,
    nullif(trim(src.chauffeur), '') as chauffeur,
    nullif(trim(src.petrolier), '') as petrolier,
    'eurotranschanet' as societe_key
from src
