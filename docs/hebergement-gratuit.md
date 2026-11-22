# Hébergement gratuit — étude des offres réelles

- **Version** : 0.1 (Phase 0 — cadrage)
- **Date de vérification** : 22/11/2026
- **Budget** : **0 FCFA** — aucune activation payante sans autorisation explicite
- **Avertissement** : les offres gratuites changent fréquemment. **Revérifier chaque condition au moment de l'activation.** Les montants ci-dessous sont ceux publiés à la date de vérification.

---

## 1. Méthodologie

1. Comparer les offres gratuites réelles (quotas, usage commercial, pause/inactivité, sauvegarde, export).
2. Écarter ce qui impose un usage non commercial ou une activation payante.
3. Choisir une stack primaire + une alternative, **sans dépendance propriétaire** pour le métier.
4. Prévoir le comportement en cas de quota atteint et la migration future.

---

## 2. Tableau comparatif (vérifié le 22/11/2026)

| Service | Offre gratuite | Limites clés | Usage commercial | Pause / inactivité | Sauvegarde | Export | Risque principal | Remplacement |
|---|---|---|---|---|---|---|---|---|
| **GitHub** | Free | 2 000 min Linux/mois (dépôt privé), 500 Mo stockage, 1 propriétaire | Oui | Aucune | Historique Git | Dépôt public/privé, export complet | Quota de minutes CI | GitLab, Codeberg |
| **Vercel** | Hobby 0 $ | 100 Go, 1 M invocations, 4 CPU-h/mois, cron 1×/jour | **Non** (Pro 20 $/siège requis) [1] | Aucune | — | Export du code | **Clause non-commerciale** | Netlify, Cloudflare, Render |
| **Netlify** | Free | 300 crédits/mois (≈20 deploys, ≈15 Go trafic, ≈30 GB-h calcul) [3] | **Oui** [1] | Site mis en pause si crédits épuisés | — | Export du code | Crédits partagés, 1 membre | Cloudflare, Render |
| **Cloudflare Pages/Workers** | Free | Bandwidth illimité ; Workers 100 000 req/jour, 10 ms CPU/req [2] | **Oui** | Aucune | — | Export du code | CPU 10 ms/requête (free) | Netlify, Render |
| **Render** | Free | 750 h instance/mois, 512 Mo RAM, 0,1 CPU, 5 Go bandwidth ; **sleep après 15 min** d'inactivité [4] | Oui | Sleep (cold start ≈1 min) | — | Export du code | Sleep, PostgreSQL gratuit **expire après 30 j** [4] | Cloudflare, Netlify |
| **Neon** (PostgreSQL) | Free | 1 Go stockage/projet, 100 CU-h/mois, 5 Go transfert, scale-to-zero après 5 min, 6 h PITR, 1 snapshot manuel [5] | Oui | Scale-to-zero (pas de pause) | 6 h PITR + 1 snapshot | `pg_dump`, API | Quota stockage/transfert | Supabase, PG autonome |
| **Supabase** | Free | 500 Mo BD, 5 Go + 5 Go cached egress, 50 000 MAU, 2 projets, **aucune sauvegarde** [6] | Oui | **Pause après 7 j** de faible activité [6] | Aucune | `supabase db dump` | Pause + pas de backup | Neon, PG autonome |
| **Cloudflare R2** | Free | 10 Go, 1 M opérations A, 10 M opérations B, **egress gratuit** [7] | Oui | Aucune | — | API S3 | L'ajout du plan R2 peut exiger un moyen de paiement (à vérifier) | Supabase Storage (1 Go) |
| **Telegram** | Gratuit | Bot API libre ; ≈1 msg/s par chat, 20/min par groupe, ≈30/s global [8] | Oui | Aucune | — | Historique | Limites d'envoi | — (Bot API officiel) |
| **Gemini API** (IA) | Free | Limites variables (≈5 RPM ; ≈20–500 req/jour selon modèle) [9] ; **disponible en Côte d'Ivoire** [10] | Oui | Aucune | — | — | Quota faible et variable | Groq, OpenRouter, local |

Sources : [1](https://sofast.host/vercel-vs-netlify.html) [2](https://developers.cloudflare.com/workers/platform/pricing/) [3](https://actualdatabase.com/netlify-free-plan-limits-2026/) [4](https://freetier.co/directory/products/render) [5](https://neon.com/docs/introduction/plans) [6](https://selfhost.dev/blog/supabase-pricing-explained/) [7](https://nayankyada.com/blog/cloudflare-r2-pricing-2026-free-tier-limits-egress-costs-when-to-upgrade) [8](https://www.conferbot.com/limits/telegram) [9](https://www.aifreeapi.com/en/posts/google-gemini-api-free-tier) [10](https://ai.google.dev/gemini-api/docs/available-regions)

---

## 3. Stack recommandée (budget 0, usage commercial)

### 3.1 Primaire

| Rôle | Service | Pourquoi |
|---|---|---|
| Code / CI-CD | **GitHub** | Dépôt privé gratuit, Actions 2 000 min/mois |
| Application Next.js | **Render (Free)** ou **Netlify (Free)** | Usage commercial **autorisé**, HTTPS + sous-domaine gratuit, Next.js natif (Render) |
| Base de données | **Neon (Free)** | 1 Go, pas de pause, scale-to-zero, `pg_dump` standard |
| Fichiers (factures, images) | **Cloudflare R2 (Free)** | 10 Go, egress gratuit (sinon **Supabase Storage 1 Go**) |
| Planificateur | **GitHub Actions (cron)** | Gratuit, appelle une route protégée |
| Notifications | **Telegram Bot API** | Gratuit |
| IA (MIMI) | **Gemini (Free)** si quota suffisant, sinon dégradé | Disponible en CI |

**Pourquoi pas Vercel** : Hobby est **explicitement limité à un usage personnel et non commercial** [1]. Pour un outil de gestion commerciale, ce n'est pas conforme. **Pourquoi pas Supabase comme primaire** : pause après 7 jours de faible activité et **aucune sauvegarde automatique** [6] — inacceptable pour des données financières sans surveillance.

### 3.2 Alternative « 100 % Cloudflare »

**Cloudflare Pages + Workers + R2 + Neon**. Avantages : pas de sleep, bandwidth illimité, commercial autorisé. Inconvénient : Next.js via adaptateur (OpenNext / `@cloudflare/next-on-pages`), limites CPU 10 ms/requête en Free [2], complexité légèrement supérieure. À réserver si les cold starts de Render gênent.

### 3.3 Points de vigilance immédiats

- **Render Free** : le service **s'endort après 15 min** d'inactivité (cold start ≈1 min) et son PostgreSQL gratuit **expire au bout de 30 jours** → on utilise **Neon** pour la base. [4]
- **R2** : l'ajout du plan R2 peut demander un moyen de paiement → **vérifier avant** ; sinon Supabase Storage.
- **Netlify** : 300 crédits partagés (deploys + trafic) → surveiller les deploys fréquents. [3]

---

## 4. Sauvegardes (on ne fait pas confiance aux sauvegardes hôte)

Règle : **une copie indépendante, exportable, testée.**

1. **Quotidien** : `pg_dump` (custom format) → chiffrement → dépôt **R2** (ou autre stockage indépendant).
2. **Hebdomadaire** : export **CSV** des tables métier (lisibilité + réimport simple).
3. **Mensuel** : export des fichiers (factures/images) + vérification d'intégrité (SHA-256).
4. **Rétention** : 30 jours glissants (quotidien), 12 mois (mensuel).
5. **Test de restauration** : **obligatoire** sur un environnement de test, **avant** la mise en production, puis tous les 3 mois.
6. Automatisation : **GitHub Actions** (cron) ou cron hôte — **aucun coût**.

> Aucune de ces sauvegardes ne dépend d'une fonction payante.

---

## 5. Surveillance des quotas

Tableau de bord « Administration → Santé » (données réelles) :

| Jauge | Source | Seuil d'alerte |
|---|---|---|
| Stockage base | `pg_database_size` | 80 % du quota |
| Transfert base | Métriques Neon | 80 % |
| Requêtes Workers/Pages | Métriques Cloudflare | 80 % |
| Requêtes IA | `ai_usage` | 80 % |
| Minutes CI | GitHub Actions | 80 % |
| Espace R2 | Métriques R2 | 80 % |
| Files `jobs` | `SELECT count(*) ...` | > 1 000 en attente |

En cas de seuil atteint : **alerte** + **file de tâches non urgentes mise en pause** (R5) + **jamais de dépassement silencieux**.

---

## 6. Comportement en cas de quota atteint (R5)

- **IA** : MIMI répond « quotas atteints, réessayez plus tard » (jamais de faux résultats).
- **CI** : les déploiements sont mis en file, pas de dépassement (pas de carte enregistrée).
- **Base** : supervision + archivage avant saturation ; toute écriture critique reste possible (pas de lecture seule surprise).
- **Tâches** : les synchronisations non urgentes sont différées ; les notifications critiques restent prioritaires.
- **Aucune facture** : aucun service avec carte requise n'est activé sans autorisation.

---

## 7. Coûts futurs (clairement identifiés, non activés)

| Si… | Coût indicatif (hors autorisation) |
|---|---|
| Trafic > 15–150 Go/mois | Netlify Personal 9 $/mois ou Cloudflare (illimité) |
| Besoin d'un worker permanent | Render Starter 7 $/mois ou VPS ≈ 5–10 $/mois |
| Base > 1 Go / transfert > 5 Go | Neon Launch (pay-as-you-go) |
| Sauvegarde longue durée | Espace de stockage additionnel |
| Nom de domaine | ≈ 10–15 $/an (optionnel, non requis au départ) |
| IA au-delà du quota | Gemini payant ou autre fournisseur |

**Aucun de ces coûts n'est engagé à la Phase 0.**

---

## 8. Plan de migration (sans réécriture)

1. `pg_dump` complet + export R2.
2. Déploiement sur VPS/serveur : **Docker Compose** (app + PostgreSQL).
3. **Caddy** pour HTTPS + domaine personnalisé.
4. **Worker permanent** (remplace le cron ; la table `jobs` reste identique).
5. Stockage externe + sauvegardes externalisées.
6. Vérification : import, comptes utilisateurs, historiques, jetons Jumia, continuité.

Le métier ne dépend d'aucune API propriétaire d'hébergeur (voir `architecture.md` §11).

---

## 9. Engagement de la Phase 0

- Aucune carte bancaire enregistrée.
- Aucun service payant activé.
- Aucun nom de domaine acheté.
- URL HTTPS gratuite fournie par l'hébergeur (sous-domaine).
- Toute évolution vers un service payant sera **présentée et validée** avant activation.
