"use client";

import { Logo } from "@/components/logo";
import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setDevToken(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
        data?: { message?: string; devToken?: string };
      };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Demande impossible.");
        return;
      }
      setMessage(payload.data?.message ?? payload.message ?? "Demande enregistrée.");
      if (payload.data?.devToken) setDevToken(payload.data.devToken);
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-10 w-10" />
            <h1 className="text-xl font-semibold text-night">Mot de passe oublié</h1>
            <p className="text-center text-sm text-muted">
              Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.
            </p>
          </div>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-night">
                Adresse e-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="vous@exemple.ci"
              />
            </div>

            {error ? (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
            ) : null}
            {message ? (
              <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{message}</p>
            ) : null}
            {devToken ? (
              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
                <p className="mb-1 font-medium text-night">
                  Développement : aucun e-mail n&apos;est encore envoyé.
                </p>
                <Link href={`/reset-password?token=${encodeURIComponent(devToken)}`} className="text-primary hover:underline">
                  Ouvrir le lien de réinitialisation
                </Link>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Envoi…" : "Envoyer le lien"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Retour à la connexion
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
