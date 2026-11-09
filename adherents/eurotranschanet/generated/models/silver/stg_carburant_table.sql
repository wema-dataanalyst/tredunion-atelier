-- stg_carburant_table · Euro Trans Chanet
-- Pleins de carburant 2025 (export COFI, mêmes lignes que COFI_Table1_DetailConso)
-- Grain : Un plein (bon) par ligne

with src as (
    select * from {{ source('bronze_eurotranschanet', 'carburant_table') }}
)

select
    nullif(trim(src.petrolier), '') as petrolier,  -- Pétrolier ou réseau de la carte
    to_date(nullif(trim(src.date_heure), ''), 'DD/MM/YYYY') as date_heure,  -- Date du plein
    nullif(trim(src.code_parc), '')::integer as code_parc,  -- Numéro de parc du véhicule
    upper(regexp_replace(nullif(trim(src.materiel), ''), '[^A-Za-z0-9]', '', 'g')) as materiel,  -- Immatriculation du véhicule
    nullif(trim(src.n_carte_import), '') as n_carte_import,
    nullif(trim(src.marque), '') as marque,
    nullif(trim(src.modele), '') as modele,
    nullif(trim(src.plein_partiel), '')::integer as plein_partiel,
    nullif(trim(src.quantite), '')::numeric as quantite,  -- Quantité livrée (litres d'après le nom de produit GO, à confirmer)
    nullif(trim(src.chauffeur), '') as chauffeur,
    nullif(trim(src.n_carte_import_2), '') as n_carte_import_2,
    nullif(trim(src.produit_consomme), '') as produit_consomme,  -- Produit (GO sur toutes les lignes)
    nullif(trim(src.montant_ht), '')::numeric as montant_ht,  -- Montant hors taxe du plein, en €
    nullif(trim(src.compteur), '')::integer as compteur,  -- Kilométrage compteur au plein
    nullif(trim(src.n_bon), '')::integer as n_bon,  -- Numéro de bon
    nullif(trim(src.reference_import), '') as reference_import,
    nullif(trim(src.agence), '') as agence,
    nullif(trim(src.site), '') as site,
    nullif(trim(src.activite), '') as activite,
    nullif(trim(src.achat), '')::integer as achat,
    nullif(trim(src.vente), '')::integer as vente,
    nullif(trim(src.compta), '')::integer as compta,
    nullif(trim(src.fichier_importe), '') as fichier_importe,
    nullif(trim(src.code_import), '') as code_import,
    nullif(trim(src.compteur_importe), '') as compteur_importe,
    nullif(trim(src.observations), '') as observations,
    nullif(trim(src.conso_theo), '')::integer as conso_theo,
    nullif(trim(src.pays), '') as pays,
    nullif(trim(src.region), '') as region,
    'eurotranschanet' as societe_key
from src
