"use client";

import { useEffect, useState } from "react";
import { Link2, Unlink } from "lucide-react";

type Account = { id: string; label: string; email: string | null; linkedShops: number };

type RemoteShop = {
  id: string;
  name: string;
  countries: { code: string; name: string | null; status: string | null }[];
  linkedTo: { shopId: string; name: string } | null;
};

type Props = {
  shopId: string;
  remoteShopId: string | null;
  remoteShopName: string | null;
  /** Permission `shops:write` côté serveur ; sans elle, le bloc est masqué. */
  canWrite: boolean;
  onChanged: () => void;
};

/**
 * Rattache une boutique locale à sa boutique Jumia.
 * La liste distante est lue côté serveur ; aucun jeton n'apparaît dans le navigateur.
 */
export function JumiaShopLink({
  shopId,
  remoteShopId,
  remoteShopName,
  canWrite,
  onChanged,
}: Props) {
  const [remotes, setRemotes] = useState<RemoteShop[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(remoteShopId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const query = accountId ? `?compte=${encodeURIComponent(accountId)}` : "";
      const [shopsResponse, accountsResponse] = await Promise.all([
        fetch(`/api/jumia/shops${query}`),
        fetch("/api/jumia/accounts"),
      ]);
      const shopsPayload = (await shopsResponse.json()) as {
        ok: boolean;
        data?: { shops: RemoteShop[] };
        error?: string;
      };
      const accountsPayload = (await accountsResponse.json()) as {
        ok: boolean;
        data?: { accounts: Account[] };
        error?: string;
      };
      if (!shopsResponse.ok || !shopsPayload.ok) {
        setError(shopsPayload.error ?? "Lecture des boutiques Jumia impossible.");
        return;
      }
      setRemotes(shopsPayload.data?.shops ?? []);
      if (accountsPayload.ok && accountsPayload.data) {
        setAccounts(accountsPayload.data.accounts);
      }
    } catch {
      setError("Erreur réseau pendant la lecture des boutiques Jumia.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canWrite) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite]);

  if (!canWrite) return null;

  async function link() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/shops/${shopId}/jumia-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remoteShopId: selected,
          accountId: accountId || undefined,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Rattachement impossible.");
        return;
      }
      setNotice("Boutique rattachée à Jumia.");
      await load();
      onChanged();
    } catch {
      setError("Erreur réseau pendant le rattachement.");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/shops/${shopId}/jumia-link`, { method: "DELETE" });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Dissociation impossible.");
        return;
      }
      setSelected("");
      setNotice("Rattachement supprimé.");
      await load();
      onChanged();
    } catch {
      setError("Erreur réseau pendant la dissociation.");
    } finally {
      setBusy(false);
    }
  }

  const linked = remotes.find((shop) => shop.id === remoteShopId) ?? null;

  return (
    <section className="card mt-6 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-night">
        <Link2 className="h-4 w-4" aria-hidden="true" />
        Boutique Jumia rattachée
      </h2>

      {remoteShopId && remoteShopName ? (
        <p className="mt-3 text-sm text-success">
          Rattachée à <span className="font-medium">{remoteShopName}</span>
          <span className="text-muted"> ({remoteShopId})</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">Aucune boutique Jumia rattachée pour le moment.</p>
      )}

      {accounts.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          Aucun compte Jumia enregistré dans l&apos;application : la liste ci-dessous
          utilise le compte historique. Pour connecter une boutique qui dépend d&apos;une autre
          adresse e-mail, ajoutez ce compte dans « Comptes Jumia connectés ».
        </p>
      ) : null}

      {loading ? (
        <p className="mt-3 text-sm text-muted">Chargement des boutiques Jumia…</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="jumia-account-select" className="text-xs font-medium text-muted">
            Compte vendeur
            <select
              id="jumia-account-select"
              value={accountId}
              onChange={(event) => {
                setAccountId(event.target.value);
                void load();
              }}
              className="focusable ml-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
            >
              <option value="">
                {accounts.length === 0 ? "Compte historique" : "Choisir un compte…"}
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                  {account.email ? ` (${account.email})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="jumia-shop-select" className="sr-only">
            Boutique Jumia à rattacher
          </label>
          <select
            id="jumia-shop-select"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="focusable rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
          >
            <option value="">Choisir une boutique Jumia…</option>
            {remotes.map((shop) => {
              const countries = shop.countries.map((client) => client.code).join(", ");
              const taken = Boolean(shop.linkedTo && shop.linkedTo.shopId !== shopId);
              return (
                <option key={shop.id} value={shop.id} disabled={taken}>
                  {shop.name}
                  {countries ? ` (${countries})` : ""}
                  {taken ? ` — déjà rattachée à ${shop.linkedTo?.name}` : ""}
                </option>
              );
            })}
          </select>

          <button
            type="button"
            onClick={link}
            disabled={!selected || busy}
            className="focusable inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Rattacher
          </button>

          {linked ? (
            <button
              type="button"
              onClick={unlink}
              disabled={busy}
              className="focusable inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-danger hover:border-danger disabled:opacity-60"
            >
              <Unlink className="h-4 w-4" aria-hidden="true" />
              Dissocier
            </button>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-sm text-success">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
