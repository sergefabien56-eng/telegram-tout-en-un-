import { Logo } from "@/components/logo";
import { TelegramLinkButton } from "@/components/telegram-link-button";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-surface">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <span className="text-sm font-semibold text-night">TOUT EN UN</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{user.fullName}</span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-night hover:bg-surface"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-night">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted">
          Connecté en tant que <span className="font-medium text-night">{user.email}</span>.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Boutiques</p>
            <p className="mt-2 text-3xl font-semibold text-night">0</p>
            <p className="mt-1 text-xs text-muted">Aucune boutique connectée pour le moment.</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Commandes</p>
            <p className="mt-2 text-3xl font-semibold text-night">0</p>
            <p className="mt-1 text-xs text-muted">En attente de connexion d&apos;une boutique.</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Compte</p>
            <p className="mt-2 text-sm font-medium text-night">Actif</p>
            <p className="mt-1 text-xs text-muted">Authentification web opérationnelle.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TelegramLinkButton />
        </div>

        <div className="card mt-6 p-5">
          <h2 className="text-sm font-semibold text-night">Prochaines étapes</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              ·{" "}
              <a href="/boutiques" className="text-primary hover:underline">
                Connecter une boutique Jumia
              </a>{" "}
              et inviter ton équipe.
            </li>
            <li>· Activer le bot Telegram (Lot 4).</li>
            <li>· Inviter des vendeurs (permissions, Lot 5).</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
