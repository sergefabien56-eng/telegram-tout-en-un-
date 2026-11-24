import { Store, Users, ShieldCheck, ArrowRight } from "lucide-react";
import { TelegramLinkButton } from "@/components/telegram-link-button";
import { listMembers, listUserShops } from "@/lib/shops";
import { getSessionUser } from "@/lib/session";
import { getNavItems, type NavSection } from "@/navigation.config";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { UI_COOKIE } from "@/lib/cookies";

const SECTION_ORDER: { section: NavSection; label: string }[] = [
  { section: "B", label: "Ventes et commandes" },
  { section: "C", label: "Boutiques et plateformes" },
  { section: "D", label: "Catalogue et stocks" },
  { section: "E", label: "Finances et comptabilité" },
  { section: "F", label: "Analyses et rapports" },
  { section: "G", label: "Automatisation et IA" },
];

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // En Mini App, le compte est déjà lié par initData : inutile de proposer un code.
  const miniApp = (await cookies()).get(UI_COOKIE)?.value === "mini";

  const shops = await listUserShops(user.id);
  // Compte réel des membres (les permissions sont vérifiées dans `listMembers`).
  let memberCount = 0;
  for (const shop of shops) {
    const members = await listMembers(shop.id);
    memberCount += members.length;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted">
          Connecté en tant que <span className="font-medium text-night">{user.email}</span>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center gap-2 text-muted">
            <Store className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-medium uppercase tracking-wide">Boutiques</p>
          </div>
          <p className="mt-3 text-3xl font-semibold text-night">{shops.length}</p>
          <p className="mt-1 text-xs text-muted">
            {shops.length > 0 ? "Boutiques accessibles à ton compte." : "Aucune boutique connectée pour le moment."}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 text-muted">
            <Users className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-medium uppercase tracking-wide">Membres</p>
          </div>
          <p className="mt-3 text-3xl font-semibold text-night">{memberCount}</p>
          <p className="mt-1 text-xs text-muted">Toutes boutiques confondues.</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 text-muted">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-medium uppercase tracking-wide">Compte</p>
          </div>
          <p className="mt-3 text-sm font-medium text-success">Actif</p>
          <p className="mt-1 text-xs text-muted">Authentification web opérationnelle.</p>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Modules</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {SECTION_ORDER.map(({ section, label }) => {
            const items = getNavItems(section, new Set(["*"]));
            return (
              <li key={section} className="rounded-xl border border-border p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
                <ul className="mt-3 space-y-2">
                  {items.map((item) => (
                    <li key={item.key}>
                      {item.soon ? (
                        <span className="flex items-center gap-2 text-sm text-muted">
                          <span className="badge badge-neutral">Bientôt disponible</span>
                          <span>{item.label}</span>
                        </span>
                      ) : (
                        <Link
                          href={item.href}
                          className="focusable flex items-center justify-between rounded-lg px-1 py-1 text-sm text-night hover:text-primary-ink"
                        >
                          <span>{item.label}</span>
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-night">Prochaines étapes</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              ·{" "}
              <Link href="/boutiques" className="text-primary-ink hover:underline">
                Créer ta première boutique
              </Link>{" "}
              et inviter ton équipe.
            </li>
            <li>· Connecter Jumia (Phase 2, dès que l&apos;accès Vendor Center est disponible).</li>
            <li>· Inviter des vendeurs avec le rôle adapté.</li>
          </ul>
        </div>
        {miniApp ? null : <TelegramLinkButton />}
      </div>
    </div>
  );
}
