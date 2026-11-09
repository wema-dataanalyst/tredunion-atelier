-- stg_tms_akanea_donnees_articles · Euro Trans Chanet
-- Description à compléter
-- Grain : à préciser

with src as (
    select * from {{ source('bronze_eurotranschanet', 'tms_akanea_donnees_articles') }}
)

select
    nullif(trim(src.code_article), '') as code_article,
    nullif(trim(src.libelle), '') as libelle,
    nullif(trim(src.activite_vente), '') as activite_vente,
    nullif(trim(src.activite_achat), '') as activite_achat,
    nullif(trim(src.societes_autorisees), '') as societes_autorisees,
    'eurotranschanet' as societe_key
from src
