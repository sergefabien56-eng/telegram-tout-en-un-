"use client";

import {
  ChevronDown,
  ChevronsDownUp,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { navIcon } from "@/components/nav-icons";
import { SpaceSearch } from "@/components/space-search";
import { Logo } from "@/components/logo";
import { NotificationsBell } from "@/components/notifications-bell";
import { QuickActions } from "@/components/quick-actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { applySidebarState, readSidebarState, type SidebarState } from "@/lib/sidebar-state";
import { activeNavItem, NAV_ITEMS, NAV_SECTIONS, type NavItem } from "@/navigation.config";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type ShellShop = { id: string; name: string; role: string };

type AppShellProps = {
  user: { fullName: string; email: string };
  shops: ShellShop[];
  permissions: string[];
  /** Boutique courante (cookie de sélection) : celle réellement affichée. */
  currentShopId?: string | null;
  children: React.ReactNode;
};

function isVisible(item: NavItem, permissions: Set<string>): boolean {
  return !item.permission || permissions.has(item.permission) || permissions.has("*");
}

const ALL_SECTIONS = NAV_SECTIONS.map((section) => section.key);

/** Sidebar : sections dépliables + entrées filtrées par permission. */
function Sidebar({
  permissions,
  open,
  onClose,
}: {
  permissions: Set<string>;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  // La section de la page courante est dépliée au premier affichage. Les
  // sous-rubriques rattachent la page à leur rubrique parente.
  const initialSection = activeNavItem(NAV_ITEMS, pathname)?.section;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    initialSection ? { [initialSection]: true } : {},
  );

  function toggle(section: string) {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  /** Ouvre ou ferme toutes les sections d'un coup (bouton unique). */
  function toggleAll() {
    const allOpen = ALL_SECTIONS.every((key) => expanded[key]);
    if (allOpen) {
      setExpanded({});
      return;
    }
    setExpanded(Object.fromEntries(ALL_SECTIONS.map((key) => [key, true])));
  }

  return (
    <>
      {/* Voile mobile */}
      <div
        className={`fixed inset-0 z-30 bg-night/40 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden="true"
        onClick={onClose}
      />

      <aside
        className={`teu-sidebar fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Navigation principale"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <Link href="/dashboard" className="focusable flex items-center gap-2" onClick={onClose}>
            <Logo className="h-8 w-8" withName={false} />
            <span className="teu-rail-hide text-sm font-semibold text-night">TOUT EN UN</span>
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleAll}
              aria-expanded={ALL_SECTIONS.every((key) => expanded[key])}
              title="Ouvrir ou fermer toutes les sections"
              className="focusable inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:text-ink"
            >
              <ChevronsDownUp
                className={`h-4 w-4 ${ALL_SECTIONS.every((key) => expanded[key]) ? "" : "rotate-180"}`}
                aria-hidden="true"
              />
              <span className="teu-rail-hide">
                {ALL_SECTIONS.every((key) => expanded[key]) ? "Tout fermer" : "Tout ouvrir"}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer le menu"
              className="focusable inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-ink lg:hidden"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-4">
            {NAV_SECTIONS.map((section) => {
              const items = NAV_ITEMS.filter(
                (item) => item.section === section.key && isVisible(item, permissions),
              );
              if (items.length === 0) return null;
              const isOpen = Boolean(expanded[section.key]);
              const sectionActive = items.some((item) => activeNavItem(items, pathname) === item);
              return (
                <li key={section.key}>
                  <button
                    type="button"
                    onClick={() => toggle(section.key)}
                    aria-expanded={isOpen}
                    className="focusable flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted hover:text-night"
                  >
                    <span className="teu-rail-hide">{section.label}</span>
                    <ChevronDown
                      className={`teu-rail-hide h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>

                  {isOpen ? (
                    <ul className="mt-1 space-y-0.5">
                      {items.map((item) => {
                        const Icon = navIcon(item.icon);
                        const active = activeNavItem(items, pathname) === item;
                        return (
                          <li key={item.key}>
                            {item.soon ? (
                              <span
                                className="teu-rail-center flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted"
                                title={`${item.label} · bientôt`}
                                aria-label={`${item.label} · bientôt`}
                              >
                                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span className="flex-1">{item.label}</span>
                                <span className="badge badge-neutral">Bientôt</span>
                              </span>
                            ) : (
                              <Link
                                href={item.href}
                                onClick={onClose}
                                title={item.label}
                                aria-current={active ? "page" : undefined}
                                className={`teu-rail-center focusable flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                                  active
                                    ? "bg-primary-50 font-medium text-primary-600"
                                    : "text-night hover:bg-surface"
                                }`}
                              >
                                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span>{item.label}</span>
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : sectionActive ? (
                    <p className="mt-1 border-l-2 border-primary-ink pl-3 text-xs text-muted">
                      {items.find((item) => item.href === pathname)?.label}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-border px-4 py-3">
          <p className="teu-rail-hide text-xs text-muted">Plan gratuit · 0 FCFA</p>
          <p className="teu-rail-hide mt-0.5 text-xs text-muted">
            Données hébergées en Côte d&apos;Ivoire.
          </p>
        </div>
      </aside>
    </>
  );
}

export function AppShell({ user, shops, permissions, currentShopId, children }: AppShellProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebar, setSidebar] = useState<SidebarState>("open");
  const [userMenu, setUserMenu] = useState(false);
  // La boutique affichée est celle choisie par le vendeur (cookie), sinon la
  // première accessible : sans cela, l'en-tête pouvait annoncer une boutique
  // et la page en montrer une autre.
  const [shopId, setShopId] = useState(currentShopId ?? shops[0]?.id ?? "");
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuTriggerRef = useRef<HTMLButtonElement>(null);

  // Le réglage est posé avant le premier rendu par `SidebarScript` ; on ne fait
  // que reprendre la main pour le bouton.
  useEffect(() => {
    setSidebar(readSidebarState());
  }, []);

  function toggleSidebar() {
    const next: SidebarState = sidebar === "rail" ? "open" : "rail";
    applySidebarState(next);
    setSidebar(next);
  }

  // Fermeture au clic extérieur ou à Échap, avec retour du focus au déclencheur.
  useEffect(() => {
    function close(restore: boolean) {
      setUserMenu(false);
      if (restore) userMenuTriggerRef.current?.focus();
    }
    function onClick(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) close(true);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && userMenu) close(true);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenu]);

  async function selectShop(value: string) {
    setShopId(value);
    await fetch("/api/shops/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: value }),
    });
    // `refresh()` relit le cookie côté serveur et re-rend la page : le
    // rechargement complet (avant) faisait perdre la position de scroll et
    // rechargait toutes les ressources.
    router.refresh();
  }

  const permissionSet = new Set(permissions);

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar permissions={permissionSet} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="teu-main">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
            className="focusable inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-ink lg:hidden"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Replier / déployer la barre latérale (bureau uniquement) */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebar === "rail" ? "Déployer le menu" : "Replier le menu"}
            title={sidebar === "rail" ? "Déployer le menu" : "Replier le menu"}
            aria-pressed={sidebar === "rail"}
            className="focusable hidden h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-ink lg:inline-flex"
          >
            {sidebar === "rail" ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          {/* Sélecteur de boutique */}
          <label className="flex items-center gap-2 text-sm text-muted">
            <span className="hidden sm:inline">Boutique</span>
            <select
              value={shopId}
              onChange={(event) => selectShop(event.target.value)}
              className="focusable max-w-[12rem] rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-night"
            >
              {shops.length === 0 ? <option value="">Aucune boutique</option> : null}
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>

          <QuickActions />

          {/* Recherche globale : un seul champ, les mêmes résultats partout */}
          <SpaceSearch variant="compact" />

          <NotificationsBell />

          <ThemeToggle />

          {/* Menu utilisateur */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              ref={userMenuTriggerRef}
              onClick={() => setUserMenu((value) => !value)}
              aria-label="Menu du compte"
              title={user.email}
              aria-expanded={userMenu}
              aria-haspopup="menu"
              className="focusable inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm text-night hover:bg-surface"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-ink">
                {user.fullName.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden sm:inline">{user.fullName.split(" ")[0]}</span>
            </button>

            {userMenu ? (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card p-2 shadow-lg"
              >
                <p className="px-2 py-1 text-xs text-muted">{user.email}</p>
                {/* POST puis redirection : sans cela le navigateur afficherait le
                    JSON de la réponse à la place de la page de connexion. */}
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await fetch("/api/auth/logout", { method: "POST" });
                    window.location.href = "/login";
                  }}
                >
                  <button
                    type="submit"
                    role="menuitem"
                    className="focusable flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-danger hover:bg-surface"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Déconnexion
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
