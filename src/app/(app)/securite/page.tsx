"use client";

import { ShieldCheck, ShieldOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Setup = { secret: string; uri: string; qrDataUrl: string };

export default function SecuritePage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/2fa/status");
      const payload = (await response.json()) as { ok: boolean; data?: { enabled: boolean } };
      if (payload.ok) setEnabled(Boolean(payload.data?.enabled));
    } catch {
      setError("Statut indisponible.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function start() {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; data?: Setup; error?: string };
      if (!response.ok || !payload.ok || !payload.data) {
        setError(payload.error ?? "Paramétrage impossible.");
        return;
      }
      setSetup(payload.data);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!setup) return;
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/2fa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        data?: { recoveryCodes: string[] };
      };
      if (!response.ok || !payload.ok || !payload.data) {
        setError(payload.error ?? "Code incorrect.");
        return;
      }
      setRecoveryCodes(payload.data.recoveryCodes);
      setEnabled(true);
      setNotice("Double authentification activée.");
      setSetup(null);
      setCode("");
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Désactivation impossible.");
        return;
      }
      setEnabled(false);
      setPassword("");
      setNotice("Double authentification désactivée.");
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Sécurité du compte</h1>
        <p className="mt-1 text-sm text-muted">
          Double authentification (TOTP) et codes de secours. Le secret est stocké chiffré.
        </p>
      </div>

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {notice ? <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{notice}</p> : null}

      <section className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              {enabled ? (
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              ) : (
                <ShieldOff className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            <div>
              <p className="text-sm font-semibold text-night">Double authentification</p>
              <p className="text-xs text-muted">
                {enabled === null
                  ? "Chargement…"
                  : enabled
                    ? "Activée — un code est demandé à chaque connexion."
                    : "Désactivée — seul le mot de passe est demandé."}
              </p>
            </div>
          </div>
          {enabled === false ? (
            <button type="button" onClick={start} disabled={loading} className="focusable rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">
              {loading ? "Préparation…" : "Activer"}
            </button>
          ) : null}
        </div>

        {/* Paramétrage */}
        {setup ? (
          <div className="mt-5 grid gap-5 border-t border-border pt-5 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium text-night">1 · Scanne ce QR code</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qrDataUrl}
                alt="QR code de configuration de la double authentification"
                className="h-52 w-52 rounded-xl border border-border bg-white p-2"
              />
              <p className="text-xs text-muted">Application recommandée : Google Authenticator, Authy ou FreeOTP.</p>
              <div>
                <p className="text-xs font-medium text-muted">Ou saisis cette clé manuellement :</p>
                <code className="mt-1 block break-all rounded-lg bg-surface px-3 py-2 text-xs text-night">
                  {setup.secret}
                </code>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-night">2 · Saisis le premier code</p>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="focusable w-full rounded-lg border border-border bg-card px-3 py-2.5 text-center text-lg tracking-[0.4em] text-night outline-none focus:border-primary-ink"
              />
              <button
                type="button"
                onClick={confirm}
                disabled={loading || code.length !== 6}
                className="focusable w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {loading ? "Vérification…" : "Confirmer et activer"}
              </button>
            </div>
          </div>
        ) : null}

        {/* Codes de secours */}
        {recoveryCodes ? (
          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm font-semibold text-night">3 · Conserve tes codes de secours</p>
            <p className="mt-1 text-xs text-muted">
              Ils ne seront plus jamais affichés. Chacun ne fonctionne qu&apos;une seule fois.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {recoveryCodes.map((item) => (
                <li key={item}>
                  <code className="block rounded-lg border border-border px-3 py-2 text-center text-sm tracking-wider text-night">
                    {item}
                  </code>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setRecoveryCodes(null)}
              className="mt-4 text-sm text-primary-ink hover:underline"
            >
              J&apos;ai enregistré mes codes — continuer
            </button>
          </div>
        ) : null}

        {/* Désactivation */}
        {enabled ? (
          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm font-semibold text-night">Désactiver la double authentification</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Ton mot de passe"
                className="focusable w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night outline-none focus:border-primary-ink sm:max-w-xs"
              />
              <button
                type="button"
                onClick={disable}
                disabled={loading || !password}
                className="focusable rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
              >
                Désactiver
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
