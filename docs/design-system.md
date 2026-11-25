# Design System — TOUT EN UN

- **Version** : 0.1 (Phase 0 — cadrage)
- **Date** : 22/11/2026
- **Statut** : À valider
- **Maquettes** : `docs/mockups/` (login, dashboard, commandes, mini app, schéma BDD)

---

## 1. Identité visuelle

| Token | Valeur | Usage |
|---|---|---|
| `night` (bleu nuit) | `#101C39` | Sidebar, titres forts, footer |
| `primary` (bleu) | `#1765F5` | Actions principales, liens, focus |
| `white` | `#FFFFFF` | Fonds clairs, cartes |
| `surface` (gris clair) | `#F5F7FB` | Fonds de page, zones secondaires |
| `border` | `#E3E8F2` | Séparateurs, contours |
| `success` (vert) | `#16A34A` | Statuts positifs, validations |
| `warning` (orange) | `#F59E0B` | Alertes, stocks faibles |
| `danger` (rouge) | `#DC2626` | Erreurs, ruptures, annulations |
| `text` | `#0F172A` | Texte principal |
| `muted` | `#64748B` | Texte secondaire |

### 1.1 Logo (identité officielle)

Le logo « Tout en Un » est **vectoriel** : il n'existe pas de bitmap dans le code applicatif. Le pictogramme est partagé entre l'icône applicative (`src/app/icon.svg`) et le composant React (`src/components/brand-mark.tsx`), tous deux alimentés par la même source de vérité, `src/lib/brand-logo.json`, produite par `scripts/generate-brand-assets.mjs`.

| Élément | Couleur | Valeur |
|---|---|---|
| Pavé (fond arrondi, rayon 91,67 / 1024 ≈ 8,95 %) | bleu nuit | `#0d1a38` |
| Carrés clairs (4) | blanc bleuté | `#ecf2f9` |
| Carré central + bras diagonaux | turquoise | `#22bdc4` |

- **Usage** : `<Logo />` (pictogramme 36 px + signature) ou `<Logo className="h-8 w-8" withName={false} />` quand le libellé est déjà présent à côté (barre latérale, en-tête compact de la Mini App).
- **Fidélité** : le rendu généré a été comparé au fichier officiel à **0,69/255 d'écart absolu moyen par canal** (0,27 %). Le contrôle est reproductible : `node scripts/verify-brand-assets.mjs` (comparaison visuelle dans `docs/captures/29-logo-source-et-rendu.png`).
- **Thème sombre** : le pavé bleu nuit se confond avec les fonds sombres (`#11192C`). Un liseré `white/25` de 1 px, inscrit dans le pavé, le détache du fond sans altérer l'œuvre : `dark:ring-1 dark:ring-inset`.
- **Accessibilité** : le pictogramme est décoratif (`aria-hidden`) quand la signature est visible ; quand il est seul, il porte le nom accessible « Tout en Un » afin que le lien qui l'héberge reste toujours nommable (mode « rail » de la barre latérale).

### 1.2 Contraste (WCAG AA)

| Couple | Ratio | Conclusion |
|---|---|---|
| `#0F172A` sur `#FFFFFF` | > 12:1 | AAA |
| `#FFFFFF` sur `#1765F5` | ≈ 5,2:1 | AA (texte ≥ 14 px gras / 18 px) |
| `#FFFFFF` sur `#101C39` | > 13:1 | AAA |
| `#FFFFFF` sur `#16A34A` | ≈ 3,4:1 | AA grands textes seulement (badges) |
| `#64748B` sur `#FFFFFF` | ≈ 4,8:1 | AA |

> Les boutons « succès » utilisent un texte blanc sur vert **un peu plus foncé** (`#15803D`) si le ratio l'exige. À vérifier en implémentation.

---

## 2. Typographie

- **Police** : **Inter** (fallback : `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`).
- **Échelle** : 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 px.
- **Graisses** : 400 (texte), 500 (labels), 600 (titres), 700 (titres forts).
- **Hauteur de ligne** : 1,5 (texte), 1,2 (titres).
- **Interlignage et césures** adaptés au français (espaces insécables avant `:` `;` `!` `?`).

---

## 3. Composants (base)

| Composant | Variantes | Notes |
|---|---|---|
| `Button` | `primary` `secondary` `ghost` `danger` `link` | États : hover/active/focus/disabled/loading |
| `Card` | `default` `interactive` | Ombre douce, radius 12 |
| `Badge` | `success` `warning` `danger` `info` `neutral` | Statuts, jamais de fausse donnée |
| `Input` / `Select` / `Textarea` | — | Label visible, message d'erreur, `aria-describedby` |
| `Table` | tri, pagination, vide | Tri côté serveur, pagination bornée |
| `Modal` / `Drawer` | — | Focus piégé, `Esc` pour fermer |
| `Toast` | `success` `error` `info` | Auto-dismiss, `role="status"` |
| `EmptyState` | — | Message + action, **jamais de fausse donnée** |
| `Skeleton` | — | Chargement (pas de spinner partout) |
| `Tabs` / `Breadcrumb` / `Pagination` | — | Navigation clavier |
| `Chart` | barres, courbes | Libellés + unités + période + source |

### 3.1 États de données (règle R1)

| État | Affichage |
|---|---|
| Valeur inconnue | `—` (jamais `0`) |
| Chargement | Skeleton |
| Erreur | Message + action « Réessayer » |
| Aucune donnée | « Aucune donnée sur la période » |
| Fonctionnalité future | « Bientôt disponible » |
| Donnée estimée | Badge « Estimé » + source |
| Donnée officielle | Badge « Officiel » / « Document interne — non officiel » |

---

## 4. Navigation

### 4.1 Fichier unique : `navigation.config.ts`

```ts
export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: string;        // nom Lucide
  section: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
  permission?: string; // ex. "orders:read"
};

export const NAV_SECTIONS: { key: string; label: string }[] = [
  { key: "A", label: "Tableau de bord" },
  { key: "B", label: "Ventes et commandes" },
  { key: "C", label: "Boutiques et plateformes" },
  { key: "D", label: "Catalogue et stocks" },
  { key: "E", label: "Finances et comptabilité" },
  { key: "F", label: "Analyses et rapports" },
  { key: "G", label: "Automatisation et IA" },
  { key: "H", label: "Administration" },
];

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Tableau de bord", href: "/", icon: "LayoutDashboard", section: "A" },
  { key: "orders", label: "Commandes", href: "/commandes", icon: "ShoppingCart", section: "B", permission: "orders:read" },
  { key: "shops", label: "Boutiques", href: "/boutiques", icon: "Store", section: "C", permission: "shops:read" },
  { key: "products", label: "Produits", href: "/produits", icon: "Package", section: "D", permission: "products:read" },
  { key: "inventory", label: "Stocks", href: "/stocks", icon: "Boxes", section: "D", permission: "inventory:read" },
  { key: "finance", label: "Finances", href: "/finances", icon: "Wallet", section: "E", permission: "finance:read" },
  { key: "reports", label: "Rapports", href: "/rapports", icon: "BarChart3", section: "F", permission: "reports:read" },
  { key: "mimi", label: "MIMI", href: "/mimi", icon: "Sparkles", section: "G", permission: "mimi:use" },
  { key: "admin", label: "Administration", href: "/admin", icon: "Settings", section: "H", permission: "admin:read" },
];
```

Le **même** fichier alimente le menu latéral (desktop), le menu compact (mobile) et la Mini App.

### 4.2 Menu latéral (Web desktop)

- Largeur 248 px, fond `night`, textes blancs, actif surligné `primary` à 20 % d'opacité.
- Sections A–H, items filtrés par permission.
- En bas : sélecteur de boutique + profil.

### 4.3 Barre supérieure

1. Logo **TOUT EN UN**.
2. **Sélecteur de boutique** (ou « Toutes les boutiques ») — filtre **toutes** les pages côté serveur.
3. **Recherche globale**.
4. **Notifications** (cloche + compteur non lu).
5. **Actions rapides** : « Ajouter une boutique » (action réelle) ; « Nouvelle commande » porte le badge
   « Bientôt disponible » tant que le module Commandes n'est pas branché (règle R1).
6. **Profil** (rôle, déconnexion).

### 4.4 Mini App (Telegram) — implémentée

- **En-tête compact** : bouton retour, logo, titre de la page, sélecteur de boutique.
- **Contenu identique** à la version web (mêmes pages `(app)`, même base).
- **Navigation basse** : 4 accès (Accueil, Boutiques, Alertes, Sécurité) + « Plus ».
- **Feuille « Plus »** : Santé, version web, déconnexion — uniquement des pages qui existent.
- **Thème Telegram** : `themeParams` (fond, surface, texte, indice, lien/bouton) fusionnés dans nos
  jetons CSS ; le schéma clair/sombre de Telegram pilote la classe `.dark`. Les changements de thème
  en cours de session sont suivis (`themeChanged`).
- **Bouton retour natif** : `BackButton` affiché hors Accueil.
- Bascule web ↔ mini : `/version-web` pose `teu_ui=web` ; l'échange `initData` pose `teu_ui=mini`.

### 4.5 Thème clair / sombre (implémenté)

- **Deux jeux de jetons** : variables CSS dans `globals.css` (`:root` clair, `.dark` sombre),
  consommées par Tailwind via `rgb(var(--…) / <alpha-value>)` (`darkMode: "class"`).
- **Interrupteur** `ThemeToggle` (icônes Lucide soleil/lune), choix mémorisé dans
  `localStorage["teu-theme"]`, repli sur `prefers-color-scheme`.
- **Anti-flash** : `ThemeScript` (script inline dans `<head>`) applique le thème **avant** le
  premier rendu, `<html suppressHydrationWarning>`.

### 4.6 Implémentation réelle (Lot 6)

| Élément | Composant | État |
|---|---|---|
| Sidebar desktop | `components/app-shell.tsx` (`Sidebar`) | 8 sections dépliables, filtrées par permission |
| Drawer mobile | `Sidebar` (voile + translation) | < `lg` |
| Barre supérieure | `AppShell` | actions rapides, sélecteur de boutique, recherche, cloche, thème, profil |
| Actions rapides | `components/quick-actions.tsx` | menu + modale (`components/modal.tsx`) ; « Ajouter une boutique » réutilise `ShopCreateForm` |
| Sélecteur de boutique | `POST /api/shops/select` → cookie `teu_shop` | vérifié côté serveur |
| Recherche globale | `components/global-search.tsx` → `GET /api/search` | boutiques accessibles uniquement |
| Notifications | `components/notifications-bell.tsx` + page `/notifications` | historique + préférences |
| État « Bientôt disponible » | badge dans la sidebar | modules non branchés |
| Coquille Mini App | `components/mini-app-shell.tsx` | bottom nav fixe + en-tête compact |
| Thème Telegram | `components/telegram-theme.ts`, `telegram-theme-sync.tsx` | themeParams → variables CSS + classe `.dark` |
| Bascule d'interface | `app/version-web/route.ts` + cookie `teu_ui` | web ↔ Mini App |
| Entrée Mini App | `app/mini-app/page.tsx` | échange initData puis redirection |

> **Honnêteté** : les entrées marquées « Bientôt » restent visibles mais non cliquables.
> Aucune donnée fictive n'est affichée.

### 4.7 Accessibilité (mesurée, pas affirmée)

**Contrastes** — ratios mesurés sur les jetons réels de `globals.css`, vérifiés par un test
automatisé (`src/config/__tests__/contrast.test.ts`) qui relit la feuille de style à chaque
`npm test` et échoue si une paire passe sous 4.5:1 :

| Paire | Clair | Sombre |
|---|---|---|
| texte courant sur carte / surface | 16,7:1 | 16,1:1 |
| texte atténué (`muted`) sur surface | 5,1:1 | 6,6:1 |
| lien / libellé primaire | 5,0:1 | 6,0:1 |
| texte blanc sur bouton primaire | 5,0:1 | 5,4:1 |
| message de statut sur fond teinté 10 % | 6,2:1 (succès) | ≥ 7:1 |

Deux corrections ont été nécessaires : le vert « succès » et le rouge « danger » étaient trop clairs
pour du texte (2,96:1 et 4,13:1) → `#166534` et `#B91C1C`. Le gris atténué est passé de `#64748B`
(4,44:1 sur surface) à `#5B6B82` (5,06:1). En sombre, le primaire de **texte** (`--primary-ink`)
est distinct du primaire de **bouton** (`--primary`), car une seule couleur ne peut pas être lisible
à la fois sur fond sombre et sous du blanc.

**Clavier**
- Anneau de focus visible partout (`.focusable`, `--primary-ink`).
- Boîtes de dialogue : Échap, clic sur le voile, **piège à focus**, focus rendu au déclencheur.
- Menus déroulants (actions rapides, profil) : fermeture au clic extérieur **et** à Échap, focus rendu.
- Navigation basse Mini App : vrais liens avec `aria-current="page"`.

**Autres**
- `prefers-reduced-motion` respecté (globaux).
- Icônes décoratives en `aria-hidden` ; images avec `alt` ; champs avec `label`.
- Audits automatisés en CI : `@axe-core/playwright` (WCAG 2.1 A/AA) via `e2e/accessibilite.spec.ts`.

> **Limite honnête** : les tests d'accessibilité navigateur **n'ont pas pu être exécutés dans
> l'environnement de développement** (pas de navigateur). Les contrastes, eux, sont mesurés
> automatiquement à chaque `npm test`. Le job CI lance les audits axe dès qu'un navigateur est dispo.

---

## 5. Responsive

| Breakpoint | Largeur | Layout |
|---|---|---|
| `sm` | ≥ 640 px | mobile large |
| `md` | ≥ 768 px | tablette |
| `lg` | ≥ 1024 px | desktop (sidebar) |
| `xl` | ≥ 1280 px | desktop large (tableaux denses) |

- Grilles fluides, tableaux avec scroll horizontal sur petit écran.
- Touch targets ≥ 44 px sur mobile.
- Menu latéral escamotable (drawer) sous `lg`.

---

## 6. Accessibilité (WCAG AA)

- Contrastes ≥ 4,5:1 (texte), 3:1 (éléments graphiques).
- **Navigation clavier complète** : focus visible, ordre logique, raccourcis non bloquants.
- Attributs ARIA sur les composants interactifs (modales, menus, onglets, toasts).
- `prefers-reduced-motion` : désactive les animations non essentielles.
- Formulaires : labels associés, erreurs annoncées.
- Langue de l'interface : français (attribut `lang="fr"`).

---

## 7. Icônes

- **Lucide** (style linéaire, cohérent, licence libre).
- Taille par défaut 20 px (16 dans les tableaux, 24 dans la sidebar).
- Jamais d'icône seule sans libellé accessible.

---

## 8. Maquettes (Phase 0)

| Maquette | Fichier |
|---|---|
| Connexion Web | `docs/mockups/login.html` |
| Tableau de bord Web | `docs/mockups/dashboard.html` |
| Commandes | `docs/mockups/commandes.html` |
| Mini App (téléphone) | `docs/mockups/mini-app.html` |
| Schéma base de données | `docs/mockups/database.html` |

Les maquettes sont des **illustrations de présentation** (données factices de démonstration), pas l'application.
