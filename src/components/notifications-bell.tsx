"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
};

/** Cloche de notifications : compteur + panneau des dernières notifications. */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications");
      const payload = (await response.json()) as { ok: boolean; data?: { notifications: NotificationRow[] } };
      if (payload.ok) setRows(payload.data?.notifications ?? []);
    } catch {
      // réseau indisponible : on affiche simplement un panneau vide
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Notifications"
        className="focusable relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-ink"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {rows.length > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-card p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-night">Notifications</p>
            <Link href="/notifications" className="text-xs text-primary-ink hover:underline">
              Réglages
            </Link>
          </div>

          {loading ? (
            <p className="mt-3 text-sm text-muted">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Aucune notification.</p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {rows.map((row) => (
                <li key={row.id} className="rounded-lg border border-border p-2">
                  <p className="text-sm font-medium text-night">{row.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{row.body}</p>
                  <p className="mt-1 text-[11px] text-muted">{new Date(row.createdAt).toLocaleString("fr-FR")}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
