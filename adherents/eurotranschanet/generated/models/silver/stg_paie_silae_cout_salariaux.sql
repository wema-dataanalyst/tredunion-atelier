-- stg_paie_silae_cout_salariaux · Euro Trans Chanet
-- Coûts salariaux Silae par salarié, export de janvier 2025 seulement
-- Grain : Un salarié par mois de paie

with src as (
    select * from {{ source('bronze_eurotranschanet', 'paie_silae_cout_salariaux') }}
)

select
    nullif(trim(src.matricule), '')::integer as matricule,  -- Matricule de paie
    nullif(trim(src.salarie), '') as salarie,  -- Nom du salarié
    to_date(nullif(trim(src.mois), ''), 'DD/MM/YYYY') as mois,  -- Mois de paie (premier jour du mois)
    nullif(trim(src.heures_theoriques), '')::numeric as heures_theoriques,  -- Heures théoriques du mois
    nullif(trim(src.heures_normales), '')::numeric as heures_normales,  -- Heures normales payées
    nullif(trim(src.heures_majorees), '')::numeric as heures_majorees,  -- Heures majorées payées
    nullif(trim(src.total_heures), '')::numeric as total_heures,  -- Total des heures payées
    nullif(trim(src.cp_pris), '')::integer as cp_pris,  -- Congés payés pris
    nullif(trim(src.rtt_recup_pris), '') as rtt_recup_pris,  -- RTT et récupérations pris
    nullif(trim(src.heures_reelles), '')::numeric as heures_reelles,  -- Heures réelles
    nullif(trim(src.brut), '')::numeric as brut,  -- Salaire brut, en €
    nullif(trim(src.charges_salariales), '')::numeric as charges_salariales,  -- Charges salariales, en €
    nullif(trim(src.charges_patronales), '')::numeric as charges_patronales,  -- Charges patronales, en €
    nullif(trim(src.charges_patronales_2), '')::numeric as charges_patronales_2,  -- Deuxième colonne « charges patronales » de Silae (valeurs de 5 à 73, sens à confirmer)
    nullif(trim(src.supplements_cout_global), '')::numeric as supplements_cout_global,  -- Suppléments au coût global, en €
    nullif(trim(src.cout_global), '')::numeric as cout_global,  -- Coût employeur total du salarié sur le mois, en €
    nullif(trim(src.cout_horaire_moyen), '')::numeric as cout_horaire_moyen,  -- Coût horaire moyen, en €/h
    nullif(trim(src.pas), '')::numeric as pas,  -- Prélèvement à la source
    nullif(trim(src.net_a_payer), '')::numeric as net_a_payer,  -- Net à payer, en €
    nullif(trim(src.forfait_jour), '') as forfait_jour,  -- Salarié au forfait jours
    to_date(nullif(trim(src.entree), ''), 'DD/MM/YYYY') as entree,  -- Date d'entrée
    nullif(trim(src.sortie), '') as sortie,  -- Date de sortie
    nullif(trim(src.emploi), '') as emploi,  -- Emploi du salarié
    nullif(trim(src.etablissement), '') as etablissement,  -- Établissement de paie
    'eurotranschanet' as societe_key
from src
