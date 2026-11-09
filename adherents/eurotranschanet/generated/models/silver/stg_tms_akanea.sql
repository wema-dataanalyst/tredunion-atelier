-- stg_tms_akanea · Euro Trans Chanet
-- Ordres de transport 2025 exportés d'Akanea (feuille Suivi)
-- Grain : Une ligne par ordre de transport

with src as (
    select * from {{ source('bronze_eurotranschanet', 'tms_akanea') }}
)

select
    nullif(trim(src.n_ordre), '') as n_ordre,  -- Numéro d'ordre
    nullif(trim(src.code_du_client), '') as code_du_client,  -- Code client Akanea
    to_date(nullif(trim(src.date_chgt), ''), 'DD/MM/YYYY') as date_chgt,  -- Date de chargement
    nullif(trim(src.ville_chgt), '') as ville_chgt,
    to_date(nullif(trim(src.livraison), ''), 'DD/MM/YYYY') as livraison,
    nullif(trim(src.differentes_villes_de_livraison), '') as differentes_villes_de_livraison,
    nullif(trim(src.activite), '') as activite,  -- Code activité de l'ordre (TN, AN, LN, TI, AI, BE, ST)
    nullif(trim(src.article), '') as article,
    nullif(trim(src.point_de_livraison_suppl), '')::integer as point_de_livraison_suppl,
    nullif(trim(src.montant), '')::numeric as montant,  -- Montant facturé de l'ordre, en €
    nullif(trim(src.montant_b), '')::numeric as montant_b,
    nullif(trim(src.montant_taxe_de_facturation_repartie), '')::numeric as montant_taxe_de_facturation_repartie,
    nullif(trim(src.majoration_gasoil), '')::numeric as majoration_gasoil,
    nullif(trim(src.montant_total_achat), '')::numeric as montant_total_achat,  -- Montant d'achat de l'ordre, en €
    nullif(trim(src.marge_en_valeur), '')::numeric as marge_en_valeur,
    nullif(trim(src.reference), '') as reference,
    nullif(trim(src.poids), '')::numeric as poids,
    nullif(trim(src.palette), '')::numeric as palette,
    nullif(trim(src.longueur), '')::numeric as longueur,
    nullif(trim(src.n_feuille_de_route), '') as n_feuille_de_route,
    nullif(trim(src.affrete), '') as affrete,  -- Affrété (sous-traitant) de l'ordre, vide si fait par le parc
    nullif(trim(src.nom_du_chauffeur), '') as nom_du_chauffeur,
    upper(regexp_replace(nullif(trim(src.plaque_moteur), ''), '[^A-Za-z0-9]', '', 'g')) as plaque_moteur,  -- Immatriculation du tracteur
    nullif(trim(src.km_cartographique), '')::integer as km_cartographique,
    nullif(trim(src.nombre_de_chargement), '')::integer as nombre_de_chargement,
    nullif(trim(src.nombre_de_livraison), '')::integer as nombre_de_livraison,
    nullif(trim(src.surcharge), '')::integer as surcharge,
    'eurotranschanet' as societe_key
from src
