"use client";

import { useCallback, useState } from "react";

export type PrefRow = {
  channel: "web" | "telegram";
  type: "order" | "stock" | "finance" | "shop" | "system";
  enabled: boolean;
};

const TYPES: { key: PrefRow["type"]; label: string }[] = [
  { key: "order", label: "Commandes" },
  { key: "stock", label: "Stocks" },
  { key: "finance", label: "Finances" },
  { key: "shop", label: "Boutiques" },
  { key: "system", label: "Système" },
];

const CHANNELS: { key: PrefRow["channel"]; label: string }[] = [
  { key: "web", label: "Web" },
  { key: "telegram", label: "Telegram" },
];

/** Préférences de notification : une case par canal et par type. */
export function NotificationPrefs({ initial }: { initial: PrefRow[] }) {
  const [rows, setRows] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async (row: PrefRow) => {
    const key = `${row.channel}:${row.type}`;
    setSaving(key);
    setError(null);
    // Mise à jour optimiste.
    setRows((prev) =>
      prev.map((item) =>
        item.channel === row.channel && item.type === row.type
          ? { ...item, enabled: !item.enabled }
          : item,
      ),
    );
    try {
      const response = await fetch("/api/notifications/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: row.channel, type: row.type, enabled: !row.enabled }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setRows((prev) =>
        prev.map((item) =>
          item.channel === row.channel && item.type === row.type
            ? { ...item, enabled: row.enabled }
            : item,
        ),
      );
      setError("Enregistrement impossible. Réessaie.");
    } finally {
      setSaving(null);
    }
  }, []);

  const isEnabled = (channel: string, type: string) =>
    rows.find((row) => row.channel === channel && row.type === type)?.enabled ?? false;

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-night">Préférences</h2>
      <p className="mt-1 text-xs text-muted">
        Choisis les canaux et les types d&apos;alertes. Tout est activé par défaut.
      </p>

      {error ? <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-4 font-medium">Type</th>
              {CHANNELS.map((channel) => (
                <th key={channel.key} className="py-2 pr-4 font-medium">
                  {channel.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TYPES.map((type) => (
              <tr key={type.key} className="border-b border-border last:border-0">
                <td className="py-2.5 pr-4 text-night">{type.label}</td>
                {CHANNELS.map((channel) => {
                  const key = `${channel.key}:${type.key}`;
                  const enabled = isEnabled(channel.key, type.key);
                  return (
                    <td key={channel.key} className="py-2.5 pr-4">
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={saving === key}
                        onChange={() =>
                          toggle({ channel: channel.key, type: type.key, enabled })
                        }
                        aria-label={`${type.label} — ${channel.label}`}
                        className="h-4 w-4 accent-primary disabled:opacity-50"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
