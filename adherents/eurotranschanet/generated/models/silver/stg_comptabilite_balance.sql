-- stg_comptabilite_balance · Euro Trans Chanet
-- Balance des comptes Sage 100, exercice 2025 en un seul bloc (période dans le .meta.json)
-- Grain : Un compte général par ligne, cumul de l'exercice

with src as (
    select * from {{ source('bronze_eurotranschanet', 'comptabilite_balance') }}
),

silver as (
select
    nullif(trim(src.numero_compte), '')::integer as numero_compte,  -- Numéro de compte général (8 chiffres ; 1 ou 2 chiffres sur les lignes de total)
    nullif(trim(src.intitule), '') as intitule,  -- Intitulé du compte
    nullif(trim(src.mouvements_debit), '')::numeric as mouvements_debit,  -- Total des débits de l'exercice, en €
    nullif(trim(src.mouvements_credit), '')::numeric as mouvements_credit,  -- Total des crédits de l'exercice, en €
    nullif(trim(src.soldes_debit), '')::numeric as soldes_debit,  -- Solde débiteur de fin d'exercice, en €
    nullif(trim(src.soldes_credit), '')::numeric as soldes_credit,  -- Solde créditeur de fin d'exercice, en €
    'eurotranschanet' as societe_key
from src
)
select * from silver
where (numero_compte >= 10000000)  -- Exclure les lignes de total par classe et sous-classe (numéro à 1 ou 2 chiffres)
