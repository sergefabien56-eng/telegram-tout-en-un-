"use client";

import { Bell, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * CLOCHE DES ALERTES DE COMMANDES — web et Mini App Telegram.
 *
 * **Ce que fait cette cloche.** Elle interroge périodiquement
 * `/api/order-alerts` et affiche les alertes de commandes du périmètre de
 * l'utilisateur : nouvelle commande, commande qui attend sa préparation au
 *-delà du seuil préventif, données Jumia possiblement incomplètes.
 *
 * **Ce qu'elle ne fait pas.** Elle n'envoie **rien** : ni Telegram, ni
 * e-mail, ni push. La synchronisation continue en arrière-plan quand
 * l'application est fermée ; c'est à la réouverture que les commandes
 * arrivées pendant l'absence sont présentées, comme **non vues**.
 *
 * **Rafraîchissement.** Un `setInterval` recharge la liste toutes les
 * minutes : l'alerte arrive sans rechargement manuel, tant que l'application
 * est ouverte.
 */

type Alerte = {
  id: string;
  kind: string;
  priority: "info" | "warning" | "critical";
  title: string;
  body: string;
  shopId: string;
  shopName: string;
  orderId: string | null;
  orderNumber: string | null;
  externalOrderId: string | null;
  firstDetectedAt: string;
  updatedAt: string;
  read: boolean;
  action: { kind: string; label: string; href: string };
};

const PRIORITE_STYLE: Record<Alerte["priority"], string> = {
  critical: "border-danger/40 bg-danger/5",
  warning: "border-warning/40 bg-warning/5",
  info: "border-border bg-surface",
};

const PRIORITE_TEXTE: Record<Alerte["priority"], string> = {
  critical: "text-danger",
  warning: "text-warning",
  info: "text-muted",
};

/** Intervalle de rechargement des alertes (ms). */
const INTERVALLE = 60_000;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderAlertsBell({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alerte[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async (force = false) => {
    try {
      const response = await fetch(
        force ? "/api/order-alerts?force=1" : "/api/order-alerts",
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as {
        ok: boolean;
        data?: { alerts?: Alerte[]; unread?: number };
        error?: string;
      } | null;
      if (!response.ok || !payload?.ok) {
        setErreur(payload?.error ?? "Alertes indisponibles.");
        return;
      }
      setAlerts(payload.data?.alerts ?? []);
      setUnread(payload.data?.unread ?? 0);
      setErreur(null);
    } catch {
      setErreur("Alertes indisponibles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), INTERVALLE);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  /** Marque l'alerte comme vue : la lecture est personnelle. */
  async function markRead(alert: Alerte) {
    if (alert.read) return;
    setAlerts((previous) =>
      previous.map((row) => (row.id === alert.id ? { ...row, read: true } : row)),
    );
    setUnread((previous) => Math.max(0, previous - 1));
    try {
      await fetch(`/api/order-alerts/${alert.id}/read`, { method: "POST" });
    } catch {
      // L'état local reste marqué comme lu : l'alerte est de toute façon
      // présentée à l'écran.
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={
          unread > 0 ? `Alertes de commandes (${unread} non vues)` : "Alertes de commandes"
        }
        className="focusable relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-ink"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 ? (
          <span
            data-testid="alertes-compteur"
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={
            compact
              ? "absolute right-0 mt-2 max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-lg"
              : "absolute right-0 mt-2 w-80 rounded-xl border border-border bg-card p-3 shadow-lg"
          }
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-night">Alertes de commandes</p>
            <button
              type="button"
              onClick={() => void load(true)}
              className="focusable inline-flex items-center gap-1 text-xs text-muted hover:text-night"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Actualiser
            </button>
          </div>

          {loading ? (
            <p className="mt-3 text-sm text-muted">Chargement…</p>
          ) : erreur ? (
            <p className="mt-3 text-sm text-danger">{erreur}</p>
          ) : alerts.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Aucune commande en attente d&apos;action. Les nouvelles commandes apparaissent ici
              dès qu&apos;elles sont récupérées.
            </p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className={`rounded-lg border p-2 ${PRIORITE_STYLE[alert.priority]} ${
                    alert.read ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!alert.read ? (
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-ink"
                        aria-label="Alerte non vue"
                      />
                    ) : (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-transparent" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${PRIORITE_TEXTE[alert.priority]}`}>
                        {alert.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{alert.body}</p>
                      <p className="mt-1 text-[11px] text-muted">{formatDate(alert.updatedAt)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link
                          href={alert.action.href}
                          onClick={() => void markRead(alert)}
                          className="focusable inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
                        >
                          {alert.action.label}
                        </Link>
                        {!alert.read ? (
                          <button
                            type="button"
                            onClick={() => void markRead(alert)}
                            className="focusable rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted hover:text-night"
                          >
                            Marquer comme vue
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
            <Link href="/alertes" className="focusable text-xs text-primary-ink hover:underline">
              Voir toutes les alertes
            </Link>
            {unread > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                {unread} non vue{unread > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
