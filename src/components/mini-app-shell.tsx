"use client";

import {
  Bell,
  ChevronDown,
  ChevronLeft,
  LayoutDashboard,
  MoreHorizontal,
  ShieldCheck,
  Store,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { basePath, navIcon } from "@/components/nav-icons";
import { Modal } from "@/components/modal";
import { NAV_ITEMS, NAV_SECTIONS } from "@/navigation.config";

type MiniAppShellProps = {
  user: { fullName: string; email: string };
  shops: { id: string; name: string; role: string }[];
  /** Permissions calculées côté serveur : le « Plus » n'affiche que du réel. */
  permissions: string[];
  /** Boutique courante (cookie de sélection) : celle réellement affichée. */
  currentShopId?: string | null;
  children: ReactNode;
};

/** Icône de rubrique résolue depuis la table partagée. */
function NavIcon({ name }: { name: string }) {
  const Icon = navIcon(name);
  return <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

/**
 * Coquille Mini App (spec 4.4) : en-tête compact, contenu identique à la
 * version web, navigation basse à 5 accès max + « Plus ».
 */
export function MiniAppShell({
  user,
  shops,
  permissions,
  currentShopId,
  children,
}: MiniAppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [shopId, setShopId] = useState(currentShopId ?? shops[0]?.id ?? "");

  // Bouton retour natif Telegram quand il est disponible.
  useEffect(() => {
    const app = window.Telegram?.WebApp as
      { BackButton?: { show: () => void; hide: () => void }; back?: () => void } | undefined;
    if (!app) return;
    if (pathname === "/dashboard") app.BackButton?.hide();
    else app.BackButton?.show();
    return () => app.BackButton?.hide();
  }, [pathname]);

  async function selectShop(value: string) {
    setShopId(value);
    await fetch("/api/shops/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: value }),
    });
    router.refresh();
  }

  // Titre de la page courante (la rubrique exacte si elle est dans la config).
  const title =
    NAV_ITEMS.find((item) => item.href === pathname)?.label ??
    NAV_ITEMS.filter((item) => basePath(item.href) === pathname).sort(
      (a, b) => b.href.length - a.href.length,
    )[0]?.label ??
    (pathname.startsWith("/boutiques") ? "Boutiques" : "TOUT EN UN");

  const tabs = [
    { key: "dashboard", label: "Accueil", href: "/dashboard", icon: LayoutDashboard },
    { key: "boutiques", label: "Boutiques", href: "/boutiques", icon: Store },
    { key: "alerts", label: "Alertes", href: "/alertes", icon: Bell },
    { key: "securite", label: "Sécurité", href: "/securite", icon: ShieldCheck },
  ];

  // Modules et rubriques : la liste de `navigation.config.ts`, filtrée par les
  // permissions réelles. Rien n'est déclaré ici.
  const allowed = useMemo(() => new Set(permissions), [permissions]);
  const modules = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        key: section.key,
        label: section.label,
        items: NAV_ITEMS.filter(
          (item) =>
            item.section === section.key &&
            (!item.permission || allowed.has(item.permission) || allowed.has("*")),
        ),
      })).filter((module) => module.items.length > 0),
    [allowed],
  );
  const moduleKeys = modules.map((module) => module.key);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const entry of modules) {
      if (entry.items.some((item) => basePath(item.href) === pathname)) {
        initial[entry.key] = true;
      }
    }
    return initial;
  });

  function toggleModule(key: string) {
    setOpenModules((previous) => ({ ...previous, [key]: !previous[key] }));
  }

  /** Tout ouvrir / tout fermer : un seul geste pour tout le menu. */
  function toggleAll() {
    const allOpen = moduleKeys.every((key) => openModules[key]);
    setOpenModules(allOpen ? {} : Object.fromEntries(moduleKeys.map((key) => [key, true])));
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {/* En-tête compact */}
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Retour"
            className="focusable inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-ink"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <Logo className="h-6 w-6" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-night">{title}</span>
          {shops.length > 0 ? (
            <select
              value={shopId}
              onChange={(event) => selectShop(event.target.value)}
              aria-label="Boutique active"
              className="focusable max-w-[8rem] rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-night"
            >
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-3 pb-24 pt-4">{children}</main>

      {/* Navigation basse : 4 accès + « Plus » */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <li key={tab.key}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`focusable flex flex-col items-center gap-1 py-2.5 text-[11px] ${
                    active ? "text-primary-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {tab.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className="focusable flex w-full flex-col items-center gap-1 py-2.5 text-[11px] text-muted hover:text-ink"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              Plus
            </button>
          </li>
        </ul>
      </nav>

      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Menu"
        description={`${user.fullName} · ${user.email}`}
      >
        <div className="space-y-3">
          {/* Tout ouvrir / tout fermer : utilisable au clavier (boutons natifs). */}
          <button
            type="button"
            onClick={toggleAll}
            className="focusable w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-night hover:bg-surface"
          >
            {moduleKeys.every((key) => openModules[key]) ? "Tout fermer" : "Tout ouvrir"}
          </button>

          <nav aria-label="Modules et rubriques" className="space-y-1.5">
            {modules.map((module) => {
              const isOpen = Boolean(openModules[module.key]);
              return (
                <div key={module.key} className="overflow-hidden rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => toggleModule(module.key)}
                    aria-expanded={isOpen}
                    aria-controls={`module-${module.key}`}
                    className="focusable flex w-full items-center justify-between gap-2 bg-card px-3 py-2.5 text-left text-sm font-semibold text-night hover:bg-surface"
                  >
                    <span className="min-w-0 truncate">{module.label}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>

                  {isOpen ? (
                    <ul
                      id={`module-${module.key}`}
                      className="space-y-0.5 border-t border-border p-1.5"
                    >
                      {module.items.map((item) => (
                        <li key={item.key}>
                          {item.soon ? (
                            <span
                              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted"
                              title="Fonction pas encore disponible"
                            >
                              <NavIcon name={item.icon} />
                              <span className="min-w-0 flex-1 truncate">{item.label}</span>
                              <span className="badge badge-neutral shrink-0">À venir</span>
                            </span>
                          ) : (
                            <Link
                              href={item.href}
                              onClick={() => setMoreOpen(false)}
                              aria-current={basePath(item.href) === pathname ? "page" : undefined}
                              className={`focusable flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                                basePath(item.href) === pathname
                                  ? "bg-primary-50 font-medium text-primary-600"
                                  : "text-night hover:bg-surface"
                              }`}
                            >
                              <NavIcon name={item.icon} />
                              <span className="min-w-0 truncate">{item.label}</span>
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <a
            href="/version-web"
            className="focusable flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm text-night hover:bg-surface"
          >
            Ouvrir la version web
            <span className="text-muted">→</span>
          </a>

          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="focusable flex w-full items-center justify-between rounded-lg border border-danger px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger/10"
            >
              Déconnexion
            </button>
          </form>

          <p className="pt-1 text-center text-[11px] text-muted">
            Données partagées avec la version web.
          </p>
        </div>
      </Modal>
    </div>
  );
}
