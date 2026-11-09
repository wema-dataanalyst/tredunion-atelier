# Fiche de séance — Euro Trans Chanet

8 points à valider avec l'adhérent, du plus impactant au moins impactant.

## 1. Le montant Akanea d'un ordre est-il hors taxe, et le mois de chargement est-il le bon mois de CA ?

- Confiance moyenne · `spec/flux/f1.yml` · `flux:f1`
- Mesures concernées (12) : % Charges Vs CA Réel, % Evol CA, % Masse Vs CA Réel, CA Réel, CA Réel Année, CA Réel M…
- Preuve : 10 596 ordres, tous chargés en 2025, de 737 à 1 049 par mois ; aucun montant vide
- contrôle c1 (ok) : 5 856 270 contre 5 854 856, écart 0.0 % (tolérance 5 %)

## 2. La masse salariale « parc » est-elle le coût employeur des seuls conducteurs ?

- Confiance basse · sources en désaccord · `spec/flux/f7.yml` · `flux:f7`
- Mesures concernées (11) : % Intérim Vs Réel, % Masse Vs CA Réel, Charges, Charges réelles, Cout ADM Parc / moteur, Masse réel…
- Preuve : Seul mois présent : janvier 2025, 25 conducteurs sur 28 salariés ; 3 lignes de total sans matricule écartées
- contrôle c3 (ecart) : 125 164 contre 1 220 699, écart 89.7 % (tolérance 5 %)

## 3. Les codes AN et AI sont-ils l'affrètement national et international ?

- Confiance moyenne · `spec/flux/f2.yml` · `flux:f2`
- Mesures concernées (9) : CA Affrètement, CA Affrètement année, CA Affrètement M-1, CA Affrètement N-1, Cout ADM Parc / moteur, Marge affrètement…
- Preuve : 2 211 ordres AN ou AI ; les 2 225 ordres avec affrété sont exactement ceux sans véhicule
- contrôle c1a (ok) : 1 439 779 contre 1 431 330, écart 0.6 % (tolérance 5 %)

## 4. Les codes TN et TI sont-ils le transport national et international fait par vos camions ?

- Confiance moyenne · `spec/flux/f3.yml` · `flux:f3`
- Mesures concernées (9) : CA parc, CA parc Année, CA parc M-1, CA parc N-1, Cout ADM Parc / moteur, Marge parc propre…
- Preuve : 7 843 ordres TN ou TI ; TI proche des comptes Export (7061 et 70691), TN des comptes Route (7060 et 70690)
- contrôle c1b (ok) : 3 650 282 contre 3 706 706, écart 1.5 % (tolérance 5 %)

## 5. Les péages de l'outil de parc sont-ils complets et hors taxe ? D'où viennent les 53 k€ de plus au compte Autoroutes ?

- Confiance basse · sources en désaccord · `spec/flux/f6.yml` · `flux:f6`
- Mesures concernées (7) : Charges, Charges réelles, Cout ADM Parc / moteur, Nb Véhicules, Nb Véhicules Année, Peage…
- Preuve : 13 030 lignes PEAGES réparties sur les 12 mois de 2025 ; pas d'export télépéage dans le dossier Péage
- contrôle c6 (ecart) : 170 767 contre 223 795, écart 23.7 % (tolérance 5 %)

## 6. Le montant d'achat Akanea d'un ordre affrété est-il le prix payé à l'affrété, hors taxe ?

- Confiance moyenne · `spec/flux/f4.yml` · `flux:f4`
- Mesures concernées (6) : Charges affrètement, Charges réelles, Cout ADM Parc / moteur, Marge affrètement, Nb Véhicules, Nb Véhicules Année
- Preuve : Sur TN l'achat (3 583 570 €) dépasse le CA (3 543 715 €) : non utilisé, seul l'affrètement est pris
- contrôle c1c (ok) : 1 041 386 contre 1 032 677, écart 0.8 % (tolérance 5 %)

## 7. Tous vos pleins passent-ils par ces cartes (DKV, Leclerc, Super U) ? L'écart de 27 k€ avec la compta vient-il d'autres achats de gazole ?

- Confiance moyenne · `spec/flux/f5.yml` · `flux:f5`
- Mesures concernées (5) : Charges, Charges réelles, Cout ADM Parc / moteur, Nb Véhicules, Nb Véhicules Année
- Preuve : 1 832 pleins 2025, tous GO, 799 486 L ; 38 des 41 véhicules retrouvés dans Akanea (92,7 %)
- contrôle c2 (ok) : 1 059 076 contre 1 085 726, écart 2.5 % (tolérance 5 %)

## 8. Dans la balance, les lignes « ** » sont-elles bien des sous-totaux à ne pas additionner ?

- Confiance moyenne · `spec/datasets/comptabilite_balance.yml` · `comptabilite_balance#regle1`
- Mesures concernées (0) : aucune pour l'instant
- Preuve : 37 lignes de total à 1 ou 2 chiffres (36 intitulées « ** ») ; sans cette règle les comptes 70 comptent deux fois : 12,13 M€ au lieu de 6,06 M€ au crédit
- contrôle c1 (ok) : 5 856 270 contre 5 854 856, écart 0.0 % (tolérance 5 %)

## Contrôles en écart

- c3 Coût global Silae contre comptes 641 à 645 (seuls 641 et 645 existent) : 125 164 contre 1 220 699, écart 89.7 % (tolérance 5 %)
- c5 Balance Sage sans date par ligne : comptabilite_balance n'a pas de date par ligne : un seul bloc du 2025-01-01 au 2025-12-31. FAITS est mensuelle.
- c6 Péages de l'outil de parc contre compte 62511000 Autoroutes : 170 767 contre 223 795, écart 23.7 % (tolérance 5 %)
