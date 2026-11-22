# Formules financières — TOUT EN UN BUSINESS MANAGER

- **Version** : 0.1 (Phase 0 — cadrage)
- **Date** : 22/11/2026
- **Statut** : À valider par le propriétaire (les taux Jumia doivent être reconfirmés)

> Ce document décrit les **règles de calcul**. Les **taux Jumia** cités sont des valeurs publiques de la documentation Jumia Côte d'Ivoire ; ils **doivent être revérifiés** sur `vendorhub.jumia.ci` avant mise en production. Les exemples sont **étiquetés comme hypothèses**.

---

## 1. Règles générales

| Règle | Détail |
|---|---|
| **Unités** | Montants en **entiers**. Le **FCFA (XOF) n'a pas de décime** (unité mineure ISO = 0) → on stocke des **FCFA entiers**. EUR/USD → centimes. |
| **Devise** | Chaque montant porte `currency` (ISO 4217). |
| **Conversions** | Jamais d'addition de devises différentes sans conversion explicite via `exchange_rates` (taux **daté**, conservé). |
| **Dates** | Stockage **UTC** ; affichage au fuseau configuré (défaut `Africa/Abidjan`). |
| **Arrondi** | Arrondi bancaire à l'entier le plus proche ; l'arrondi est **déterministe** et consigné. |
| **TVA** | Les commissions Jumia CI **incluent 18 % de TVA** (ainsi que les taux publiés). [1] |
| **Traçabilité** | Chaque calcul conserve ses intrants (source + date). |

---

## 2. Commission et prix Jumia (Côte d'Ivoire)

### 2.1 Formule officielle Jumia CI

Documentation officielle : [Commissions — Jumia VendorHub CI](https://vendorhub.jumia.ci/commissions/) [1]

```
Prix affiché Jumia = (Prix vendeur + Frais fixe) / (1 − Commission)
```

Exemple officiel (Fashion) : `(15 000 + 500) / (1 − 0,15) = 18 235,29 → 18 240 ou 18 300 FCFA`. [1]

### 2.2 Barème (ordre de grandeur, à reconfirmer)

Les taux varient par catégorie et **incluent la TVA**. Les valeurs publiques vont d'environ **4 % à 20 %** selon la catégorie (ex. : Mobile Phones ≈ 4 %, Laptops ≈ 7 %, Fashion ≈ 17 %, Furniture/Home ≈ 20 %). [2]

> ⚠️ Ces taux évoluent (une page « commissions 2026 » est annoncée sur VendorHub CI). **À reconfirmer avant P4.** Une table `jumia_commission_rates` (catégorie, taux, date d'effet, source) sera alimentée depuis les relevés Jumia plutôt qu'en dur.

### 2.3 Frais d'abonnement (CI)

- **5 000 FCFA** pour des ventes entre **100 000 et 1 499 999 FCFA** ;
- **20 000 FCFA** si les ventes atteignent **1 500 000 FCFA**. [1]

### 2.4 Frais de livraison

Les frais de livraison (répercutés ou non sur le vendeur) sont **à confirmer** selon le mode d'expédition (own warehouse / Jumia Express / etc.). On les enregistrera dans `order_financials.shipping_fee_minor` dès qu'ils seront connus.

---

## 3. Coût de revient et marge

### 3.1 Coût de revient unitaire

```
coût_revient = prix_achat
             + transport
             + droits_de_douane / import
             + emballage
             + autres_coûts_attribués
```

### 3.2 Marge nette par ligne

```
marge_nette = prix_net_vendeur
            − coût_revient
            − commission_jumia
            − frais_fixe
            − frais_livraison_vendeur
            − autres_frais
            − quote_part_retours
```

Où `prix_net_vendeur` est ce que le vendeur perçoit (après commission), **pas** le prix affiché.

### 3.3 Bénéfice

```
bénéfice_net = chiffre_affaires_net_vendeur
             − coûts_achats
             − dépenses
             − commissions_et_frais
             − remboursements
             − pertes_retours
```

### 3.4 Règles de consolidation

- **CA livré** = somme des commandes `delivered` (on ne mélange pas les statuts).
- **Retours** : `returns` (qty, refund) et réintégration en stock **seulement après contrôle** (`restocked = true`).
- **Rapprochement** : `finance_transactions` (Jumia) ↔ `orders` ; une transaction non rapprochée reste signalée (`matched = false`).
- **Taux de change** : toute conversion enregistre le taux du jour.

---

## 4. Exemple chiffré (HYPOTHÈSE — ne pas utiliser en production)

| Paramètre | Valeur |
|---|---|
| Prix vendeur souhaité | 15 000 FCFA |
| Frais fixe (hypothèse) | 500 FCFA |
| Commission (hypothèse, TVA incl.) | 17 % |
| Prix affiché calculé | (15 000 + 500) / (1 − 0,17) = **18 675 FCFA** |
| Coût d'achat | 12 000 FCFA |
| Frais livraison vendeur (hypothèse) | 1 000 FCFA |
| Marge nette unitaire | 15 000 − 12 000 − 1 000 = **2 000 FCFA** (avant abonnement/retours) |

Cet exemple illustre la mécanique ; **les taux réels seront repris des relevés Jumia**.

---

## 5. Ce qui reste à valider (avant P4)

- [ ] Barème des commissions **en vigueur** (et son évolution 2026) par catégorie.
- [ ] Frais fixes par catégorie.
- [ ] Frais de livraison répercutés au vendeur (selon mode d'expédition).
- [ ] Modalités de paiement Jumia (relevé, délai, devises).
- [ ] TVA : traitement exacte (les taux Jumia les incluent).
- [ ] Arrondis : règle exacte appliquée par Jumia (à observer sur les relevés réels).
- [ ] Gestion des retours : montants, délais, réintégration.

## 6. Sources

- [1] Jumia VendorHub Côte d'Ivoire — Commissions (formule, frais fixes, abonnement) : https://vendorhub.jumia.ci/commissions/
- [2] Barème indicatif par catégorie (Côte d'Ivoire) : https://pandaworldai.site/sell-on-jumia/cote-divoire
