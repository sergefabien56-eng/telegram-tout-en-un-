"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Package, RefreshCw, Store, Unlink, UserPlus } from "lucide-react";
import { roleHasPermission } from "@/lib/roles";

type ConnectionState = {
  state: string;
  label: string;
  detail: string;
  operational: boolean;
};

type ShopRow = {
  id: string;
  name: string;
  platform: string;
  externalShopId: string;
  country: string | null;
  currency: string;
  status: string;
  remoteShopId?: string | null;
  remoteShopName?: string | null;
  createdAt: string;
  role: string;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  /** État factuel (lien, compte vendeur, données reçues). */
  connection?: ConnectionState | null;
};

type MemberRow = {
  userId: string;
  role: string;
  email: string;
  fullName: string;
};

const ROLES = ["manager", "stock", "accountant", "assistant"] as const;

/**
 * « Toutes les boutiques ».
 *
 * Une carte par boutique autorisée, avec les actions adaptées à son état :
 * rattacher un produit, relire ses commandes, consulter l'historique des
 * synchronisations, ou la déconnecter (action réversible : les données déjà
 * synchronisées sont conservées).
 */
export default function BoutiquesPage() {
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

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
    const payload = (await response.json()) as {
      ok: boolean;
      error?: string;
      data?: { status: string };
    };
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
    const response = await fetch(`/api/shops/${selected}/members/${memberUserId}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as { ok: boolean; error?: string };
    if (!response.ok || !payload.ok) {
      setError(payload.error ?? "Suppression impossible.");
      return;
    }
    await loadMembers(selected);
  }

  /**
   * Déconnexion : la boutique cesse de lire son compte Jumia, mais **les
   * données déjà synchronisées sont conservées** (elles lui appartiennent).
   * C'est l'action inverse de l'ajout, et elle est réversible.
   */
  async function onDisconnect(shop: ShopRow) {
    const confirme = window.confirm(
      `Déconnecter « ${shop.name} » de Jumia ?\n\n` +
        "La boutique ne lira plus ses commandes, produits et relevés.\n" +
        "Les données déjà synchronisées sont conservées et restent visibles.",
    );
    if (!confirme) return;
    setBusy(shop.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/shops/${shop.id}/disconnect`, { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Déconnexion impossible.");
        return;
      }
      setNotice(`« ${shop.name} » est déconnectée de Jumia. Ses données restent disponibles.`);
      await loadShops();
    } catch {
      setError("Erreur réseau pendant la déconnexion.");
    } finally {
      setBusy(null);
    }
  }

  const boutiqueSelectionnee = shops.find((shop) => shop.id === selected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Toutes les boutiques</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Chaque boutique à laquelle vous avez accès, avec son état réel et les actions disponibles.
          Les permissions sont appliquées côté serveur.
        </p>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            {notice}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/boutiques/ajouter"
          className="focusable inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
        >
          <Store className="h-4 w-4" aria-hidden="true" />
          Ajouter une boutique Jumia
        </Link>
        <Link
          href="/boutiques/synchronisations"
          className="focusable inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-night hover:bg-surface"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Historique des synchronisations
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Chargement des boutiques…</p>
      ) : shops.length === 0 ? (
        <div className="card p-5">
          <p className="text-sm text-muted">
            Aucune boutique pour le moment. Ajoutez votre compte vendeur Jumia pour en rattacher
            une.
          </p>
          <Link
            href="/boutiques/ajouter"
            className="focusable mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Ajouter une boutique Jumia
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shops.map((shop) => {
            const peutEcrire = roleHasPermission(shop.role as never, "shops:write");
            const peutVendre = roleHasPermission(shop.role as never, "products:write");
            return (
              <li
                key={shop.id}
                className={`card p-5 ${selected === shop.id ? "ring-2 ring-primary-ink" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-night">{shop.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {shop.platform} · ID {shop.externalShopId} · {shop.country ?? "—"} ·{" "}
                      {shop.currency}
                    </p>
                    {shop.remoteShopId ? (
                      <p className="mt-1 text-xs text-muted">
                        Jumia : {shop.remoteShopName ?? "—"} · identifiant distant{" "}
                        {shop.remoteShopId}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted">Non rattachée à une boutique Jumia.</p>
                    )}
                  </div>
                  <span className="badge badge-neutral shrink-0">{shop.role}</span>
                </div>

                <p className="mt-3 text-xs">
                  Connexion :{" "}
                  <span
                    className={`font-medium ${
                      shop.connection?.operational ? "text-success" : "text-danger"
                    }`}
                  >
                    {shop.connection?.label ?? "État inconnu"}
                  </span>
                </p>
                {shop.connection && !shop.connection.operational ? (
                  <p className="mt-1 text-xs text-muted">{shop.connection.detail}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted">
                  Dernière synchronisation :{" "}
                  {shop.lastSyncAt ? new Date(shop.lastSyncAt).toLocaleString("fr-FR") : "—"}
                  {shop.lastSyncStatus && shop.lastSyncStatus !== "ok"
                    ? ` · état : ${shop.lastSyncStatus}`
                    : ""}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {peutVendre ? (
                    <Link
                      href={`/boutiques/produits/nouveau?boutique=${shop.id}`}
                      className="focusable inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
                    >
                      <Package className="h-3.5 w-3.5" aria-hidden="true" />
                      Ajouter un produit
                    </Link>
                  ) : null}
                  <Link
                    href={`/commandes?boutique=${shop.id}`}
                    className="focusable inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-night hover:bg-surface"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Synchroniser cette période
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSelected(shop.id)}
                    className="focusable inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-night hover:bg-surface"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    Équipe
                  </button>
                  {peutEcrire && shop.remoteShopId ? (
                    <button
                      type="button"
                      onClick={() => void onDisconnect(shop)}
                      disabled={busy === shop.id}
                      className="focusable inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-danger hover:text-danger disabled:opacity-60"
                    >
                      <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                      {busy === shop.id ? "Déconnexion…" : "Déconnecter"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {boutiqueSelectionnee ? (
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-night">
            Équipe de « {boutiqueSelectionnee.name} »
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-night">{member.fullName}</p>
                  <p className="text-xs text-muted">{member.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="badge badge-neutral">{member.role}</span>
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
              className="focusable flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary-ink"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as (typeof ROLES)[number])}
              className="focusable rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary-ink"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="focusable rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Inviter
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
