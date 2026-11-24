import { Logo } from "@/components/logo";
import { configPresence, parseEnv } from "@/config/env";
import { NAV_ITEMS } from "@/navigation.config";

export const dynamic = "force-dynamic";

type StatusRow = { label: string; ready: boolean };

export default function HomePage() {
  const presence = configPresence(process.env);
  const env = parseEnv(process.env);

  const rows: StatusRow[] = [
    { label: "Base de données (PostgreSQL)", ready: presence.database },
    { label: "Chiffrement AES-256-GCM", ready: presence.encryptionKey },
    { label: "Sessions / JWT", ready: presence.sessionSecret },
    { label: "Bot Telegram", ready: presence.telegramBotToken },
    { label: "Webhook Telegram (secret)", ready: presence.telegramWebhookSecret },
    { label: "Stockage documents (R2)", ready: presence.storage },
    { label: "IA (MIMI)", ready: presence.aiKey },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="flex items-center justify-between">
        <Logo />
        <span className="badge bg-primary-50 text-primary-700">Phase 1 — Fondations</span>
      </header>

      <section className="mt-8">
        <h1 className="text-2xl font-bold text-night sm:text-3xl">TOUT EN UN Business Manager</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          ERP/SaaS de gestion multi-boutiques Jumia, accessible sur Telegram (bot + Mini App) et sur
          le web. Une seule application, une seule base de données.
        </p>
      </section>

      <section className="card mt-8 p-5" aria-labelledby="etat">
        <h2 id="etat" className="text-sm font-semibold uppercase tracking-wide text-muted">
          État réel de la configuration
        </h2>
        <ul className="mt-4 divide-y divide-border">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between py-2.5">
              <span className="text-sm">{row.label}</span>
              {row.ready ? (
                <span className="badge bg-green-50 text-success">Configuré</span>
              ) : (
                <span className="badge badge-neutral">Non configuré</span>
              )}
            </li>
          ))}
        </ul>
        {!env.ok && (
          <p className="mt-3 text-xs text-danger">
            Environnement invalide : {env.errors.slice(0, 3).join(" · ")}
          </p>
        )}
      </section>

      <section className="mt-8" aria-labelledby="modules">
        <h2 id="modules" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Modules
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_ITEMS.map((item) => (
            <div key={item.key} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{item.label}</span>
                {item.soon ? (
                  <span className="badge badge-neutral">Bientôt disponible</span>
                ) : (
                  <span className="badge bg-primary-50 text-primary-700">Actif</span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                {item.soon
                  ? "Aucune donnée fictive n'est affichée pour ce module."
                  : "Module en cours de fondation."}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a
          href="/login"
          className="rounded-lg bg-primary px-5 py-2.5 text-center text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          Se connecter
        </a>
        <a
          href="/register"
          className="rounded-lg border border-border bg-card px-5 py-2.5 text-center text-sm font-medium text-night transition hover:bg-surface"
        >
          Créer un compte
        </a>
        <a
          href="/dashboard"
          className="rounded-lg border border-border bg-card px-5 py-2.5 text-center text-sm font-medium text-night transition hover:bg-surface"
        >
          Tableau de bord
        </a>
      </section>

      <footer className="mt-10 border-t border-border pt-5 text-xs text-muted">
        Aucune donnée de démonstration en production. Les modules non livrés sont marqués « Bientôt
        disponible ».
      </footer>
    </main>
  );
}
