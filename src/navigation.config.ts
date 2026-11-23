/**
 * Configuration de navigation — source unique pour le Web et la Mini App.
 * Voir docs/design-system.md.
 *
 * Les `permission` suivent la convention `module:action`. Les éléments sont
 * filtrés côté serveur ; le front ne fait qu'appliquer le résultat.
 */

export type NavSection = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  /** Nom d'icône Lucide (résolu côté UI). */
  icon: string;
  section: NavSection;
  /** Permission requise (module:action). Absent = visible par défaut. */
  permission?: string;
  /** Affiché mais désactivé avec la mention « Bientôt disponible ». */
  soon?: boolean;
};

export const NAV_SECTIONS: { key: NavSection; label: string }[] = [
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
  { key: "dashboard", label: "Tableau de bord", href: "/dashboard", icon: "LayoutDashboard", section: "A" },
  { key: "notifications", label: "Notifications", href: "/notifications", icon: "Bell", section: "A" },
  { key: "orders", label: "Commandes", href: "/commandes", icon: "ShoppingCart", section: "B", permission: "orders:read", soon: true },
  { key: "shops", label: "Boutiques", href: "/boutiques", icon: "Store", section: "C" },
  { key: "products", label: "Produits", href: "/produits", icon: "Package", section: "D", permission: "products:read", soon: true },
  { key: "inventory", label: "Stocks", href: "/stocks", icon: "Boxes", section: "D", permission: "inventory:read", soon: true },
  { key: "finance", label: "Finances", href: "/finances", icon: "Wallet", section: "E", permission: "finance:read", soon: true },
  { key: "reports", label: "Rapports", href: "/rapports", icon: "BarChart3", section: "F", permission: "reports:read", soon: true },
  { key: "mimi", label: "MIMI", href: "/mimi", icon: "Sparkles", section: "G", permission: "mimi:use", soon: true },
  { key: "sante", label: "Santé", href: "/sante", icon: "Activity", section: "H", permission: "admin:read" },
  { key: "admin", label: "Administration", href: "/admin", icon: "Settings", section: "H", permission: "admin:read", soon: true },
];

/** Retourne les éléments d'une section, filtrés par permissions. */
export function getNavItems(section: NavSection, permissions: ReadonlySet<string>): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      item.section === section &&
      (!item.permission || permissions.has(item.permission)),
  );
}
