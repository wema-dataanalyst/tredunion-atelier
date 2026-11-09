-- stg_tms_akanea_donnees_activites_achats · Euro Trans Chanet
-- Description à compléter
-- Grain : à préciser

with src as (
    select * from {{ source('bronze_eurotranschanet', 'tms_akanea_donnees_activites_achats') }}
)

select
    nullif(trim(src.code), '') as code,
    nullif(trim(src.libelle), '') as libelle,
    nullif(trim(src.code_tva), '')::integer as code_tva,
    nullif(trim(src.taux), '')::integer as taux,
    nullif(trim(src.n_de_compte), '')::integer as n_de_compte,
    nullif(trim(src.actif), '') as actif,
    nullif(trim(src.societes_autorisees), '') as societes_autorisees,
    'eurotranschanet' as societe_key
from src
