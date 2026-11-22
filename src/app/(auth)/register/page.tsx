"use client";

import { Logo } from "@/components/logo";
import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        details?: string[];
      };
      if (!response.ok || !payload.ok) {
        setError(payload.details?.[0] ?? payload.error ?? "Inscription impossible.");
        return;
      }
      setSuccess(true);
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
            <h1 className="text-xl font-semibold text-night">Créer un compte</h1>
            <p className="text-sm text-muted">Commencez à gérer vos boutiques Jumia.</p>
          </div>

          {success ? (
            <div className="mt-6 space-y-4">
              <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
                Compte créé. Vous pouvez vous connecter.
              </p>
              <Link
                href="/login"
                className="block w-full rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-primary/90"
              >
                Aller à la connexion
              </Link>
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div>
                <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-night">
                  Nom complet
                </label>
                <input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Votre nom"
                />
              </div>

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

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-night">
                  Mot de passe
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="8 caractères minimum, avec un chiffre"
                />
              </div>

              {error ? (
                <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? "Création…" : "Créer mon compte"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-muted">
            Déjà un compte ?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
