"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, PlusCircle, RefreshCw, Trash2 } from "lucide-react";

type RemoteShop = {
  id: string;
  name: string;
  countries: { code: string; name: string | null; status: string | null }[];
  linkedTo: { shopId: string; name: string } | null;
};

type Account = {
  id: string;
  label: string;
  email: string | null;
  clientId: string;
  status: string;
  lastTokenAt: string | null;
  linkedShops: number;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const EMPTY_FORM = { label: "", email: "", clientId: "", refreshToken: "" };

/**
 * Comptes vendeur Jumia enregistrés dans l'application.
 *
 * Chaque compte est un « e-mail Jumia » avec ses propres identifiants ; on peut
 * en ajouter, en tester et en supprimer sans aucune intervention en base.
 * Les refresh tokens ne quittent jamais le navigateur et ne sont jamais renvoyés
 * par le serveur (ils sont stockés chiffrés AES-256-GCM).
 */
export function JumiaAccounts({ onChanged }: { onChanged?: () => void } = {}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [remoteByAccount, setRemoteByAccount] = useState<Record<string, RemoteShop[]>>({});
  const [attaching, setAttaching] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/jumia/accounts");
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { accounts: Account[] };
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        setStatus({ kind: "error", message: payload.error ?? "Lecture impossible." });
        return;
      }
      const loaded = payload.data?.accounts ?? [];
      setAccounts(loaded);
      // Boutiques accessibles sur chaque compte : elles seront proposées au
      // rattachement en un clic.
      const entries = await Promise.all(
        loaded.map(async (account) => {
          try {
            const response = await fetch(`/api/jumia/shops?compte=${encodeURIComponent(account.id)}`);
            const body = (await response.json()) as {
              ok?: boolean;
              data?: { shops: RemoteShop[] };
            };
            return [account.id, body.ok ? (body.data?.shops ?? []) : []] as const;
          } catch {
            return [account.id, []] as const;
          }
        }),
      );
      setRemoteByAccount(Object.fromEntries(entries));
      setStatus({ kind: "idle" });
    } catch {
      setStatus({ kind: "error", message: "Erreur réseau pendant la lecture des comptes." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "loading" });
    try {
      const response = await fetch("/api/jumia/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setStatus({ kind: "error", message: payload.error ?? "Ajout du compte impossible." });
        return;
      }
      setStatus({ kind: "success", message: "Compte Jumia ajouté et vérifié." });
      setForm(EMPTY_FORM);
      await load();
    } catch {
      setStatus({ kind: "error", message: "Erreur réseau pendant l'ajout du compte." });
    }
  }

  async function test(accountId: string) {
    setTestingId(accountId);
    setTestResult((prev) => ({ ...prev, [accountId]: "" }));
    try {
      const response = await fetch(`/api/jumia/accounts/${accountId}/test`, { method: "POST" });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { shops: number; names: string[] };
        error?: string;
      };
      setTestResult((prev) => ({
        ...prev,
        [accountId]:
          payload.ok && payload.data
            ? `${payload.data.shops} boutique(s) : ${payload.data.names.join(", ") || "aucune"}`
            : (payload.error ?? "Test impossible."),
      }));
    } catch {
      setTestResult((prev) => ({ ...prev, [accountId]: "Erreur réseau pendant le test." }));
    } finally {
      setTestingId(null);
    }
  }

  async function attach(accountId: string, remoteShopId: string) {
    setAttaching(`${accountId}:${remoteShopId}`);
    setAttachError(null);
    setStatus({ kind: "idle" });
    try {
      const response = await fetch(`/api/jumia/accounts/${accountId}/shops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remoteShopId }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setAttachError(payload.error ?? "Rattachement impossible.");
        return;
      }
      setStatus({
        kind: "success",
        message: "Boutique créée et rattachée. Elle apparaît dans « Toutes les boutiques ».",
      });
      await load();
      // La page doit immédiatement montrer la nouvelle boutique (sans rechargement).
      onChanged?.();
    } catch {
      setAttachError("Erreur réseau pendant le rattachement.");
    } finally {
      setAttaching(null);
    }
  }

  async function remove(accountId: string) {
    if (
      !window.confirm(
        "Supprimer ce compte Jumia ? Les boutiques qui lui sont rattachées perdront leur connexion.",
      )
    ) {
      return;
    }
    setStatus({ kind: "loading" });
    try {
      const response = await fetch(`/api/jumia/accounts/${accountId}`, { method: "DELETE" });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setStatus({ kind: "error", message: payload.error ?? "Suppression impossible." });
        return;
      }
      setStatus({ kind: "success", message: "Compte Jumia supprimé." });
      await load();
    } catch {
      setStatus({ kind: "error", message: "Erreur réseau pendant la suppression." });
    }
  }

  return (
    <section id="comptes-jumia" className="card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-night">
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        Comptes Jumia connectés
      </h2>
      <p className="mt-2 text-sm text-muted">
        Pour chaque boutique listée ci-dessous, « Créer et rattacher » enregistre la boutique
        dans l&apos;application et la connecte automatiquement.
      </p>
      <p className="mt-2 text-sm text-muted">
        Un compte vendeur Jumia regroupe une ou plusieurs boutiques. Ajoutez ici
        chaque adresse e-mail qui gère vos boutiques : chacune aura ses propres
        commandes, stocks et finances. Aucun identifiant n&apos;est affiché.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-muted">Chargement des comptes…</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {accounts.length === 0 ? (
            <li className="py-3 text-sm text-muted">
              Aucun compte enregistré pour le moment.
            </li>
          ) : (
            accounts.map((account) => (
              <li key={account.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-night">{account.label}</p>
                    <p className="text-xs text-muted">
                      {account.email ?? "adresse non précisée"} · {account.linkedShops} boutique(s)
                      rattachée(s)
                    </p>
                    {testResult[account.id] ? (
                      <p className="mt-1 text-xs text-muted">{testResult[account.id]}</p>
                    ) : null}

                    {/* Boutiques accessibles sur ce compte : rattachement en un clic. */}
                    <ul className="mt-2 space-y-1">
                      {(remoteByAccount[account.id] ?? []).map((shop) => {
                        const taken = Boolean(shop.linkedTo);
                        const busy = attaching === `${account.id}:${shop.id}`;
                        return (
                          <li
                            key={shop.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                          >
                            <span className="text-xs text-night">
                              {shop.name}
                              <span className="text-muted">
                                {" "}
                                · {shop.countries.map((c) => c.code).join(", ") || "pays non précisé"}
                                {taken && shop.linkedTo ? ` · rattachée à ${shop.linkedTo.name}` : ""}
                              </span>
                            </span>
                            {taken ? (
                              <span className="badge badge-success">Rattachée</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => attach(account.id, shop.id)}
                                disabled={busy}
                                className="focusable rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-60"
                              >
                                {busy ? "Rattachement…" : "Créer et rattacher"}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => test(account.id)}
                      disabled={testingId === account.id}
                      className="focusable inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-night hover:border-primary disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${testingId === account.id ? "animate-spin" : ""}`}
                        aria-hidden="true"
                      />
                      Tester
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(account.id)}
                      className="focusable inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger hover:border-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Supprimer
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      )}

      <form onSubmit={add} className="mt-5 border-t border-border pt-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-night">
          <PlusCircle className="h-4 w-4" aria-hidden="true" />
          Ajouter un compte vendeur
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-muted">
            Nom du compte
            <input
              type="text"
              value={form.label}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
              required
              placeholder="Ex. Maxi Shop"
              className="focusable mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            Adresse e-mail du compte (facultatif)
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="vous@gmail.com"
              className="focusable mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            Identifiant client Jumia (Client ID)
            <input
              type="text"
              value={form.clientId}
              onChange={(event) => setForm({ ...form, clientId: event.target.value })}
              required
              placeholder="a3ec005d-…"
              className="focusable mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            Refresh token
            <input
              type="password"
              value={form.refreshToken}
              onChange={(event) => setForm({ ...form, refreshToken: event.target.value })}
              required
              autoComplete="off"
              className="focusable mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
         Ces deux valeurs se trouvent dans Vendor Center → Paramètres → Applications → votre
          application « Self Authorization ». Elles sont stockées chiffrées sur le serveur.
        </p>
        <button
          type="submit"
          disabled={status.kind === "loading"}
          className="focusable mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          Ajouter et vérifier
        </button>
      </form>

      {status.kind === "success" ? (
        <p role="status" className="mt-3 text-sm text-success">
          {status.message}
        </p>
      ) : null}
      {attachError ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {attachError}
        </p>
      ) : null}
      {status.kind === "error" ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
