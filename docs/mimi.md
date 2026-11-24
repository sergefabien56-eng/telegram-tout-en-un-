# MIMI — Assistante IA de TOUT EN UN

- **Version** : 0.1 (Phase 0 — cadrage)
- **Date** : 22/11/2026
- **Budget IA** : **0 FCFA** (aucun appel payant automatique)
- **Statut** : Livré (Phase 2, lot 6) — en attente d'une clé IA gratuite pour répondre

---

## 1. Rôle

MIMI est l'assistante commerciale de TOUT EN UN. Elle comprend le **français** et dialogue naturellement. Elle peut :

- analyser les ventes, comparer des boutiques, analyser les marges ;
- identifier produits rentables et produits à réapprovisionner ;
- analyser les commandes et préparer des bilans ;
- rédiger descriptions, titres SEO, fiches produits (Product Creator) ;
- préparer des visuels (Studio graphique, règles strictes) ;
- proposer des améliorations commerciales.

---

## 2. Principe anti-hallucination (non négociable)

1. **Aucun accès direct à la base de données.** MIMI passe uniquement par des **outils typés**.
2. Chaque chiffre provient d'un **outil réel** (requête agrégée, calcul validé).
3. **Période, boutiques concernées, fraîcheur des données** sont toujours indiqués.
4. Donnée indisponible → **« — »** + mention « donnée indisponible », **jamais** de valeur inventée.
5. Les réponses citent leurs **sources** (ex. « d'après les commandes livrées du 01/11 au 21/11 »).
6. MIMI ne peut **écrire** que via des outils d'action validés (ex. créer un brouillon), jamais modifier directement un prix/stock sans validation humaine.

---

## 3. Architecture

```
Utilisateur (Web / Telegram)
      │  message en français
      ▼
Orchestrateur MIMI (boucle)
      │
      ├─► Fournisseur IA (Gemini / Groq / OpenRouter / local)  ← clé fournie par l'utilisateur
      │
      └─► Outils typés (function calling)
            • get_kpis(shop_ids, from, to)        → agrégats réels
            • compare_shops(shop_ids, metric)     → agrégats réels
            • product_analysis(shop_id, filter)   → agrégats réels
            • margin_analysis(shop_id, from, to)  → calculs réels
            • stock_alerts(shop_id)                → seuils réels
            • order_summary(shop_id, from, to)     → agrégats réels
            • create_product_draft(payload)        → écriture validée
            • search_images(query)                 → droits vérifiés
            • generate_image(prompt)               → studio
            • export_report(params)                → export réel
```

Chaque outil :

- vérifie les **permissions** de l'utilisateur et les **boutiques autorisées** ;
- est **typé** (entrée/sortie Zod) ;
- journalise l'appel (paramètres, tokens, résultat) dans `ai_messages` / `ai_usage` ;
- est **borné** (limites de taille, délais) pour éviter tout coût incontrôlé.

---

## 4. Fournisseurs IA (options gratuites)

| Fournisseur                  | Offre gratuite       | Limites connues                                                | Disponible en CI | Remarque                                     |
| ---------------------------- | -------------------- | -------------------------------------------------------------- | ---------------- | -------------------------------------------- |
| **Gemini API** (Google)      | Oui                  | Limites variables (≈5 RPM ; ≈20–500 req/jour selon modèle) [1] | **Oui** [2]      | Multimodal, long contexte                    |
| **Groq**                     | Oui                  | Environ 1 000 req/jour et 6 000 TPM par modèle [3]             | À vérifier       | Rapide, modèles Llama                        |
| **OpenRouter**               | Partiel              | Modèles « free » avec limites                                  | À vérifier       | Accès multi-modèles                          |
| **Local** (Ollama/llama.cpp) | Oui (logiciel libre) | Dépend du matériel                                             | Oui (si machine) | Pas de serveur 24/7 gratuit → usage ponctuel |

### 4.2 Implémenté

- Fournisseurs branchables dans `src/lib/ai/provider.ts` : **Gemini** et **Groq**, en HTTPS directe.
- Sans clé : `MIMI_UNAVAILABLE`, jamais de chiffre fabriqué.
- Journalisation de la consommation dans `ai_usage` (fournisseur, modèle, jetons, outil, latence).
- Tables `ai_conversations`, `ai_messages`, `ai_usage` (migration `0008`).
- Outils réels et typés dans `src/lib/ai/tools.ts` ; permissions vérifiées par outil.

Sources : [1](https://www.aifreeapi.com/en/posts/google-gemini-api-free-tier) [2](https://ai.google.dev/gemini-api/docs/available-regions) [3](https://tokenmix.ai/blog/gemini-api-free-tier-limits)

### 4.1 Règles de coût

- **Aucune clé payante** ; la clé (gratuite) est fournie par le propriétaire et stockée côté serveur.
- **Aucun appel automatique** vers une API payante.
- Suivi des quotas dans `ai_usage` ; alerte à 80 %.
- Si le quota est atteint ou si aucune clé n'est configurée : MIMI répond **« fonctionnalité temporairement indisponible »** — **jamais** de faux résultats.
- Le fournisseur est **branchable** (`AiProvider`), sans impact sur le métier.

---

## 5. Permissions

| Action MIMI                | Permission requise                               |
| -------------------------- | ------------------------------------------------ |
| Lire les KPIs              | `reports:read`                                   |
| Lire les finances          | `finance:read`                                   |
| Lire les produits/stocks   | `products:read` / `inventory:read`               |
| Créer un brouillon produit | `products:create`                                |
| Modifier un prix/stock     | **Action humaine uniquement** (MIMI ne fait pas) |
| Exporter                   | `reports:export`                                 |

---

## 6. Product Creator (pipeline)

1. Envoi de **photos** (par l'utilisateur).
2. **Analyse** des images (modèle multimodal).
3. **Identification** du produit.
4. En cas de doute → **demande de confirmation**.
5. Génération du **titre**.
6. **Description courte**.
7. **Description détaillée**.
8. **Catégorie** + **sous-catégorie**.
9. **Points forts**.
10. **Caractéristiques** (techniques, factuelles).
11. **Mots-clés** (SEO).
12. **SKU** proposé.
13. **Vérification des doublons** (outil réel).
14. Enregistrement en **brouillon** (`product_drafts`).
15. **Sélection de la boutique**.
16. **Validation humaine** (écran de récapitulatif).
17. **Publication** après validation (ou envoi vers Jumia selon l'API).

Règle : MIMI ne fabrique **pas** de caractéristiques ; si l'image ne permet pas de conclure, elle demande.

---

## 7. Studio graphique

- Détourage, fond blanc, amélioration, visuels publiciaux, mise en scène.
- **Interdit** : inventer des accessoires, modifier les caractéristiques réelles, masquer un défaut, créer de fausses preuves sociales.
- **Validation humaine** avant toute publication.
- Images sources : uniquement des banques **à droits vérifiés** (ex. API Unsplash/Pexels ou images fournies) ; traçabilité de la licence.

---

## 8. Limites (honnêtes)

- Quota gratuit **faible et variable** → MIMI peut être momentanément indisponible.
- Pas de mémoire infinie : l'historique est conservé (`ai_conversations`), la fenêtre de contexte est bornée.
- MIMI ne remplace **pas** un comptable : les chiffres sont des agrégats, pas des arrêtés de compte.
- Les analyses reposent sur la **fraîcheur** des synchronisations (affichée).

---

## 9. Sources

- [1] Limites Gemini API (gratuit) : https://www.aifreeapi.com/en/posts/google-gemini-api-free-tier
- [2] Régions disponibles Google AI Studio / Gemini API (Côte d'Ivoire incluse) : https://ai.google.dev/gemini-api/docs/available-regions
- [3] Comparaison Gemini / Groq / OpenRouter : https://tokenmix.ai/blog/gemini-api-free-tier-limits
