/**
 * Configuration de navigation — source unique pour le Web et la Mini App.
 * Voir docs/design-system.md.
 *
 * Une seule liste : chaque entrée est une rubrique appartenant à un module
 * (`NAV_SECTIONS`). Les coquilles (web + Mini App) ne font que filtrer et
 * présenter cette liste ; elles ne contiennent aucune rubrique en dur.
 *
 * - `permission` : convention `module:action`, vérifiée côté serveur. Un lien
 *   caché ne remplace jamais ce contrôle.
 * - `soon: true` : la fonction réelle n'est pas encore développée. L'entrée
 *   reste visible mais marquée « À venir », sans action possible (jamais de
 *   bouton mort ni de donnée simulée).
 * - `href` peut porter une ancre (`/page#partie`) quand la rubrique est une
 *   section d'une page existante.
 */

export type NavSection = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  /** Nom d'icône Lucide (résolu via `@/components/nav-icons`). */
  icon: string;
  section: NavSection;
  /** Permission requise (module:action). Absent = visible par défaut. */
  permission?: string;
  /** Fonction non développée : affichée avec la mention « À venir ». */
  soon?: boolean;
};

export const NAV_SECTIONS: { key: NavSection; label: string }[] = [
  { key: "A", label: "Pilotage" },
  { key: "B", label: "Ventes et commandes" },
  { key: "C", label: "Boutiques et plateformes" },
  { key: "D", label: "Catalogue et stocks" },
  { key: "E", label: "Finances et comptabilité" },
  { key: "F", label: "Analyses et rapports" },
  { key: "G", label: "Automatisation et IA" },
  { key: "H", label: "Administration" },
];

export const NAV_ITEMS: NavItem[] = [
  // --- A. Pilotage --------------------------------------------------------
  // Chaque entrée pointe vers **une page** : plus de lien vers une ancre
  // d'une page unique ( sept liens, un seul écran ).
  {
    key: "dashboard",
    label: "Tableau de bord",
    href: "/dashboard",
    icon: "LayoutDashboard",
    section: "A",
  },
  {
    key: "alerts",
    label: "Alertes",
    href: "/alertes",
    icon: "Bell",
    section: "A",
  },
  {
    key: "performances",
    label: "Performances",
    href: "/performances",
    icon: "BarChart3",
    section: "A",
    permission: "reports:read",
  },
  {
    key: "activity",
    label: "Activités",
    href: "/activites",
    icon: "Activity",
    section: "A",
  },
  {
    key: "search",
    label: "Recherche",
    href: "/recherche",
    icon: "Search",
    section: "A",
  },
  {
    key: "appearance",
    label: "Apparence",
    href: "/apparence",
    icon: "Palette",
    section: "A",
  },

  // --- B. Ventes et commandes ---------------------------------------------
  {
    key: "orders",
    label: "Toutes les commandes",
    href: "/commandes",
    icon: "ShoppingCart",
    section: "B",
    permission: "orders:read",
  },
  {
    key: "orders-action",
    label: "À traiter",
    href: "/commandes/a-traiter",
    icon: "ClipboardList",
    section: "B",
    permission: "orders:read",
  },
  {
    key: "orders-shipped",
    label: "Expédiées",
    href: "/commandes/expediees",
    icon: "Truck",
    section: "B",
    permission: "orders:read",
  },
  {
    key: "orders-returns",
    label: "Retours",
    href: "/commandes/retours",
    icon: "RotateCcw",
    section: "B",
    permission: "orders:read",
  },
  {
    key: "orders-invoices",
    label: "Factures originales",
    href: "/commandes/factures",
    icon: "FileText",
    section: "B",
    permission: "orders:read",
  },
  {
    key: "orders-customers",
    label: "Clients",
    href: "/commandes/clients",
    icon: "Users",
    section: "B",
    permission: "orders:read",
  },
  {
    key: "orders-export",
    label: "Exports",
    href: "/commandes/exports",
    icon: "Download",
    section: "B",
    permission: "orders:read",
  },

  // --- C. Boutiques et plateformes ----------------------------------------
  { key: "shops", label: "Toutes les boutiques", href: "/boutiques", icon: "Store", section: "C" },
  {
    key: "shops-add",
    label: "Ajouter une boutique",
    href: "/boutiques#ajouter",
    icon: "Plus",
    section: "C",
  },
  {
    key: "shops-accounts",
    label: "Comptes Jumia",
    href: "/boutiques#comptes-jumia",
    icon: "KeyRound",
    section: "C",
  },
  {
    key: "shops-jumia",
    label: "Connexions Jumia",
    href: "/boutiques#connexions",
    icon: "Link2",
    section: "C",
  },
  {
    key: "shops-sync",
    label: "Synchronisations",
    href: "/boutiques/synchronisations",
    icon: "RefreshCw",
    section: "C",
    permission: "shops:read",
  },
  {
    key: "shops-settings",
    label: "Réglages boutiques",
    href: "/boutiques/reglages",
    icon: "Settings",
    section: "C",
    soon: true,
  },

  // --- D. Catalogue et stocks ---------------------------------------------
  {
    key: "products",
    label: "Produits",
    href: "/produits",
    icon: "Package",
    section: "D",
    permission: "products:read",
  },
  {
    key: "catalog-categories",
    label: "Catégories",
    href: "/categories",
    icon: "Tag",
    section: "D",
    permission: "products:read",
  },
  {
    key: "catalog-prices",
    label: "Prix",
    href: "/prix",
    icon: "TrendingUp",
    section: "D",
    permission: "products:read",
  },
  {
    key: "inventory",
    label: "Stocks",
    href: "/stocks",
    icon: "Boxes",
    section: "D",
    permission: "inventory:read",
  },
  {
    key: "stock-moves",
    label: "Mouvements",
    href: "/mouvements",
    icon: "ArrowLeftRight",
    section: "D",
    permission: "inventory:read",
    soon: true,
  },
  {
    key: "warehouses",
    label: "Entrepôts",
    href: "/entrepots",
    icon: "Warehouse",
    section: "D",
    permission: "inventory:read",
    soon: true,
  },
  {
    key: "inventories",
    label: "Inventaires",
    href: "/inventaires",
    icon: "ClipboardCheck",
    section: "D",
    permission: "inventory:read",
    soon: true,
  },

  // --- E. Finances et comptabilité ----------------------------------------
  {
    key: "finance",
    label: "Vue financière",
    href: "/finances",
    icon: "Wallet",
    section: "E",
    permission: "finance:read",
  },
  {
    key: "finance-statements",
    label: "Relevés Jumia",
    href: "/finances#releves",
    icon: "FileText",
    section: "E",
    permission: "finance:read",
  },
  {
    key: "finance-expenses",
    label: "Dépenses",
    href: "/depenses",
    icon: "TrendingDown",
    section: "E",
    permission: "finance:read",
    soon: true,
  },
  {
    key: "finance-purchases",
    label: "Achats",
    href: "/achats",
    icon: "ShoppingBag",
    section: "E",
    permission: "finance:read",
    soon: true,
  },
  {
    key: "finance-reconcile",
    label: "Rapprochements",
    href: "/rapprochements",
    icon: "ScrollText",
    section: "E",
    permission: "finance:read",
    soon: true,
  },
  {
    key: "finance-export",
    label: "Exports financiers",
    href: "/finances#export-finances",
    icon: "Download",
    section: "E",
    permission: "finance:read",
  },

  // --- F. Analyses et rapports --------------------------------------------
  {
    key: "reports",
    label: "Tous les rapports",
    href: "/rapports",
    icon: "BarChart3",
    section: "F",
    permission: "reports:read",
  },
  {
    key: "reports-shop",
    label: "Par boutique",
    href: "/rapports#boutique",
    icon: "Store",
    section: "F",
    permission: "reports:read",
  },
  {
    key: "reports-product",
    label: "Par produit",
    href: "/rapports#produit",
    icon: "Package",
    section: "F",
    permission: "reports:read",
  },
  {
    key: "reports-profitability",
    label: "Rentabilité",
    href: "/rentabilite",
    icon: "TrendingUp",
    section: "F",
    permission: "finance:read",
  },
  {
    key: "reports-downloads",
    label: "Téléchargements",
    href: "/telechargements",
    icon: "Download",
    section: "F",
  },

  // --- G. Automatisation et IA -------------------------------------------
  {
    key: "mimi",
    label: "Assistante MIMI",
    href: "/mimi",
    icon: "Sparkles",
    section: "G",
    permission: "mimi:use",
  },
  {
    key: "automation-rules",
    label: "Règles",
    href: "/regles",
    icon: "ScrollText",
    section: "G",
    soon: true,
  },
  {
    key: "automation-tasks",
    label: "Tâches planifiées",
    href: "/taches",
    icon: "CalendarClock",
    section: "G",
    soon: true,
  },
  {
    key: "notifications",
    label: "Notifications",
    href: "/notifications",
    icon: "Bell",
    section: "G",
  },

  // --- H. Administration --------------------------------------------------
  {
    key: "admin-users",
    label: "Utilisateurs",
    href: "/utilisateurs",
    icon: "Users",
    section: "H",
    permission: "admin:read",
  },
  {
    key: "admin-roles",
    label: "Rôles",
    href: "/roles",
    icon: "KeyRound",
    section: "H",
  },
  {
    key: "admin-members",
    label: "Membres de la boutique",
    href: "/admin#membres",
    icon: "Users",
    section: "H",
    permission: "admin:read",
  },
  {
    key: "admin-journal",
    label: "Journal d'activité",
    href: "/admin#journal",
    icon: "ScrollText",
    section: "H",
    permission: "admin:read",
  },
  {
    key: "admin-diagnostics",
    label: "Diagnostic des boutiques",
    href: "/admin/diagnostics",
    icon: "Stethoscope",
    section: "H",
    permission: "admin:read",
  },
  {
    key: "settings",
    label: "Paramètres",
    href: "/parametres",
    icon: "Settings",
    section: "H",
    soon: true,
  },
  {
    key: "securite",
    label: "Sécurité du compte",
    href: "/securite",
    icon: "ShieldCheck",
    section: "H",
  },
  {
    key: "sante",
    label: "Système",
    href: "/sante",
    icon: "Activity",
    section: "H",
    permission: "admin:read",
  },
];

/** Retourne les éléments d'une section, filtrés par permissions. */
export function getNavItems(section: NavSection, permissions: ReadonlySet<string>): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.section === section && (!item.permission || permissions.has(item.permission)),
  );
}
