"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type ShopRow = {
  id: string;
  name: string;
  platform: string;
  externalShopId: string;
  country: string | null;
  currency: string;
  status: string;
  createdAt: string;
  role: string;
};

type MemberRow = {
  userId: string;
  role: string;
  email: string;
  fullName: string;
};

const ROLES = ["manager", "stock", "accountant", "assistant"] as const;

export default function BoutiquesPage() {
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [externalShopId, setExternalShopId] = useState("");
  const [country, setCountry] = useState("CI");
  const [currency, setCurrency] = useState("XOF");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>("assistant");

  const loadShops = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/shops");
      const payload = (await response.json()) as { ok: boolean; data?: ShopRow[]; error?: string };
      if (!response.ok || !payload.ok) {
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        setError(payload.error ?? "Chargement impossible.");
        return;
      }
      setShops(payload.data ?? []);
      setSelected((prev) => prev ?? payload.data?.[0]?.id ?? null);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function loadMembers(shopId: string) {
    if (!shopId) return;
    try {
      const response = await fetch(`/api/shops/${shopId}/members`);
      const payload = (await response.json()) as { ok: boolean; data?: MemberRow[] };
      setMembers(payload.data ?? []);
    } catch {
      setMembers([]);
    }
  }

  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  useEffect(() => {
    if (selected) void loadMembers(selected);
  }, [selected]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const response = await fetch("/api/shops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, externalShopId, country, currency, platform: "jumia" }),
    });
    const payload = (await response.json()) as { ok: boolean; error?: string; details?: string[] };
    if (!response.ok || !payload.ok) {
      setError(payload.details?.[0] ?? payload.error ?? "Création impossible.");
      return;
    }
    setNotice("Boutique créée. Tu es propriétaire.");
    setName("");
    setExternalShopId("");
    await loadShops();
  }

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/shops/${selected}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const payload = (await response.json()) as { ok: boolean; error?: string; data?: { status: string } };
    if (!response.ok || !payload.ok) {
      setError(payload.error ?? "Invitation impossible.");
      return;
    }
    setNotice(
      payload.data?.status === "added"
        ? "Membre ajouté à la boutique."
        : "Invitation enregistrée (le membre la verra à sa connexion).",
    );
    setInviteEmail("");
    await loadMembers(selected);
  }

  async function onRemove(memberUserId: string) {
    if (!selected) return;
    if (!window.confirm("Retirer ce membre de la boutique ?")) return;
    const response = await fetch(`/api/shops/${selected}/members/${memberUserId}`, { method: "DELETE" });
    const payload = (await response.json()) as { ok: boolean; error?: string };
    if (!response.ok || !payload.ok) {
      setError(payload.error ?? "Suppression impossible.");
      return;
    }
    await loadMembers(selected);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Boutiques</h1>
        <p className="mt-1 text-sm text-muted">
          Boutiques connectées et équipes. Les permissions sont appliquées côté serveur.
        </p>

        {error ? <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
        {notice ? (
          <p className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="card p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-night">Mes boutiques</h2>
            {loading ? (
              <p className="mt-3 text-sm text-muted">Chargement…</p>
            ) : shops.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Aucune boutique pour le moment. Crée la première ci-contre.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {shops.map((shop) => (
                  <li
                    key={shop.id}
                    className={`rounded-lg border p-4 ${selected === shop.id ? "border-primary" : "border-border"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(shop.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-night">{shop.name}</span>
                        <span className="badge bg-primary-50 text-primary-700">{shop.role}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {shop.platform} · ID {shop.externalShopId} · {shop.country ?? "—"} ·{" "}
                        {shop.currency}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Statut : <span className="font-medium">{shop.status}</span>
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-night">Nouvelle boutique</h2>
            <form className="mt-4 space-y-3" onSubmit={onCreate}>
              <div>
                <label className="mb-1 block text-xs font-medium text-night">Nom</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Ma boutique Jumia"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-night">
                  Identifiant boutique Jumia
                </label>
                <input
                  value={externalShopId}
                  onChange={(e) => setExternalShopId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="ex. 123456"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-night">Pays</label>
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-night">Devise</label>
                  <input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    maxLength={3}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
              >
                Créer la boutique
              </button>
            </form>
          </section>
        </div>

        {selected ? (
          <section className="card mt-6 p-5">
            <h2 className="text-sm font-semibold text-night">Équipe de la boutique</h2>
            <ul className="mt-4 divide-y divide-border">
              {members.map((member) => (
                <li key={member.userId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-night">{member.fullName}</p>
                    <p className="text-xs text-muted">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="badge bg-slate-100 text-muted">{member.role}</span>
                    {member.role !== "owner" ? (
                      <button
                        type="button"
                        onClick={() => onRemove(member.userId)}
                        className="text-xs text-danger hover:underline"
                      >
                        Retirer
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={onInvite}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder="membre@exemple.ci"
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as (typeof ROLES)[number])}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                Inviter
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}
