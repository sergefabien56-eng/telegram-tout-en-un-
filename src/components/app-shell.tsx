"use client";

import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Wallet,
  X,
} from "lucide-react";
import { GlobalSearch } from "@/components/global-search";
import { Logo } from "@/components/logo";
import { NotificationsBell } from "@/components/notifications-bell";
import { QuickActions } from "@/components/quick-actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS, NAV_SECTIONS, type NavItem } from "@/navigation.config";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ICONS: Record<string, typeof LayoutDashboard> = {
  Activity,
  ShieldCheck,
  LayoutDashboard,
  Bell,
  ShoppingCart,
  Store,
  Package,
  Boxes,
  Wallet,
  BarChart3,
  Sparkles,
  Settings,
};

export type ShellShop = { id: string; name: string; role: string };

type AppShellProps = {
  user: { fullName: string; email: string };
  shops: ShellShop[];
  permissions: string[];
  children: React.ReactNode;
};

function isVisible(item: NavItem, permissions: Set<string>): boolean {
  return !item.permission || permissions.has(item.permission) || permissions.has("*");
}

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

  // La section de la page courante est dépliée au premier affichage.
  const initialSection = NAV_ITEMS.find((item) => item.href === pathname)?.section;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    initialSection ? { [initialSection]: true } : {},
  );

  function toggle(section: string) {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
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
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-card transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Navigation principale"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <Link href="/dashboard" className="focusable flex items-center gap-2" onClick={onClose}>
            <Logo className="h-8 w-8" />
            <span className="text-sm font-semibold text-night">TOUT EN UN</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className="focusable inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-ink lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-4">
            {NAV_SECTIONS.map((section) => {
              const items = NAV_ITEMS.filter((item) => item.section === section.key && isVisible(item, permissions));
              if (items.length === 0) return null;
              const isOpen = Boolean(expanded[section.key]);
              const sectionActive = items.some((item) => item.href === pathname);
              return (
                <li key={section.key}>
                  <button
                    type="button"
                    onClick={() => toggle(section.key)}
                    aria-expanded={isOpen}
                    className="focusable flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted hover:text-night"
                  >
                    <span>{section.label}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>

                  {isOpen ? (
                    <ul className="mt-1 space-y-0.5">
                      {items.map((item) => {
                        const Icon = ICONS[item.icon] ?? LayoutDashboard;
                        const active = item.href === pathname;
                        return (
                          <li key={item.key}>
                            {item.soon ? (
                              <span className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted">
                                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span className="flex-1">{item.label}</span>
                                <span className="badge bg-slate-100 text-muted">Bientôt</span>
                              </span>
                            ) : (
                              <Link
                                href={item.href}
                                onClick={onClose}
                                aria-current={active ? "page" : undefined}
                                className={`focusable flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                                  active
                                    ? "bg-primary-50 font-medium text-primary"
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
                    <p className="mt-1 border-l-2 border-primary pl-3 text-xs text-muted">
                      {items.find((item) => item.href === pathname)?.label}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-border px-4 py-3">
          <p className="text-xs text-muted">Plan gratuit · 0 FCFA</p>
          <p className="mt-0.5 text-xs text-muted">Données hébergées en Côte d&apos;Ivoire.</p>
        </div>
      </aside>
    </>
  );
}

export function AppShell({ user, shops, permissions, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [shopId, setShopId] = useState(shops[0]?.id ?? "");
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenu(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function selectShop(value: string) {
    setShopId(value);
    await fetch("/api/shops/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: value }),
    });
    window.location.reload();
  }

  const permissionSet = new Set(permissions);

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar permissions={permissionSet} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
            className="focusable inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-ink lg:hidden"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
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

          {/* Recherche globale (basique) */}
          <GlobalSearch />

          <NotificationsBell />

          <ThemeToggle />

          {/* Menu utilisateur */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenu((value) => !value)}
              aria-expanded={userMenu}
              aria-haspopup="menu"
              className="focusable inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm text-night hover:bg-surface"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary">
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
                <form action="/api/auth/logout" method="post">
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
