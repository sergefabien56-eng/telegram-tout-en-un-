"use client";

import {
  Bell,
  ChevronLeft,
  LayoutDashboard,
  MoreHorizontal,
  ShieldCheck,
  Store,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { Modal } from "@/components/modal";
import { NAV_ITEMS } from "@/navigation.config";

type MiniAppShellProps = {
  user: { fullName: string; email: string };
  shops: { id: string; name: string; role: string }[];
  children: ReactNode;
};

/**
 * Coquille Mini App (spec 4.4) : en-tête compact, contenu identique à la
 * version web, navigation basse à 5 accès max + « Plus ».
 */
export function MiniAppShell({ user, shops, children }: MiniAppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [shopId, setShopId] = useState(shops[0]?.id ?? "");

  // Bouton retour natif Telegram quand il est disponible.
  useEffect(() => {
    const app = window.Telegram?.WebApp as
      | { BackButton?: { show: () => void; hide: () => void }; back?: () => void }
      | undefined;
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

  const title =
    NAV_ITEMS.find((item) => item.href === pathname)?.label ??
    (pathname.startsWith("/boutiques") ? "Boutiques" : "TOUT EN UN");

  const tabs = [
    { key: "dashboard", label: "Accueil", href: "/dashboard", icon: LayoutDashboard },
    { key: "boutiques", label: "Boutiques", href: "/boutiques", icon: Store },
    { key: "notifications", label: "Alertes", href: "/notifications", icon: Bell },
    { key: "securite", label: "Sécurité", href: "/securite", icon: ShieldCheck },
  ];

  // Sorties et réglages : rien de factice, uniquement des pages qui existent.
  const extraLinks = [
    { key: "securite", label: "Sécurité du compte", href: "/securite" },
    { key: "sante", label: "Santé du système", href: "/sante" },
    { key: "web", label: "Ouvrir la version web", href: "/version-web" },
  ];

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
        title="Plus d'actions"
        description={`${user.fullName} · ${user.email}`}
      >
        <div className="space-y-2">
          {extraLinks.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              onClick={() => setMoreOpen(false)}
              className="focusable flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm text-night hover:bg-surface"
            >
              {link.label}
              <span className="text-muted">→</span>
            </Link>
          ))}

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
