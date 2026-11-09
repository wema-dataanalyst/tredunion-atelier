-- stg_tms_akanea_donnees_tiers · Euro Trans Chanet
-- Description à compléter
-- Grain : à préciser

with src as (
    select * from {{ source('bronze_eurotranschanet', 'tms_akanea_donnees_tiers') }}
)

select
    nullif(trim(src.type), '') as type,
    nullif(trim(src.code), '') as code,
    nullif(trim(src.nom), '') as nom,  -- Raison sociale du tiers (entreprise)
    nullif(trim(src.adresse_1), '') as adresse_1,
    nullif(trim(src.cp), '') as cp,
    nullif(trim(src.ville), '') as ville,
    nullif(trim(src.region), '') as region,
    nullif(trim(src.telephone), '') as telephone,
    nullif(trim(src.adresse_mail), '') as adresse_mail,
    nullif(trim(src.fax), '') as fax,
    nullif(trim(src.adresse_2), '') as adresse_2,
    nullif(trim(src.m_regl), '') as m_regl,
    nullif(trim(src.tarif_as), '') as tarif_as,
    nullif(trim(src.nb_exempl), '')::integer as nb_exempl,
    nullif(trim(src.statut), '') as statut,
    nullif(trim(src.n_siret), '') as n_siret,
    'eurotranschanet' as societe_key
from src
