import { listShopMembers } from "@/lib/insights";
import { listUserShops } from "@/lib/shops";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Utilisateurs : uniquement les comptes membres d'une de vos boutiques.
 * Aucun compte extérieur à votre espace n'est listé.
 */
export default async function UtilisateursPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const shops = await listUserShops(user.id);
  const isAdmin = shops.some((shop) => shop.role === "owner" || shop.role === "manager");
  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Utilisateurs</h1>
        <p className="text-sm text-danger" role="status">
          Seuls les propriétaires et gestionnaires peuvent consulter la liste des comptes de leurs
          boutiques.
        </p>
      </div>
    );
  }

  const rows = await listShopMembers(shops.map((shop) => shop.id));

  // Un même compte peut appartenir à plusieurs boutiques : on regroupe.
  const parCompte = new Map<
    string,
    {
      email: string;
      fullName: string;
      twoFactorEnabled: boolean;
      lastLoginAt: Date | null;
      boutiques: string[];
    }
  >();
  for (const row of rows) {
    const entry = parCompte.get(row.userId) ?? {
      email: row.email,
      fullName: row.fullName,
      twoFactorEnabled: row.twoFactorEnabled,
      lastLoginAt: row.lastLoginAt,
      boutiques: [],
    };
    if (!entry.boutiques.includes(`${row.shopName} (${row.role})`)) {
      entry.boutiques.push(`${row.shopName} (${row.role})`);
    }
    parCompte.set(row.userId, entry);
  }
  const comptes = [...parCompte.entries()].sort((a, b) => a[1].email.localeCompare(b[1].email));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Utilisateurs</h1>
        <p className="mt-1 text-sm text-muted">
          Comptes membres de vos boutiques. Les adresses restent celles enregistrées à
          l&apos;inscription.
        </p>
      </div>

      <section className="card p-5">
        {comptes.length === 0 ? (
          <p className="text-sm text-muted" role="status">
            Aucun membre enregistré sur vos boutiques.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Compte</th>
                  <th className="py-2 pr-3">Boutiques (rôle)</th>
                  <th className="py-2 pr-3">2FA</th>
                  <th className="py-2 pr-3">Dernière connexion</th>
                </tr>
              </thead>
              <tbody>
                {comptes.map(([id, compte]) => (
                  <tr key={id} className="border-b border-border align-top last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-night">{compte.fullName}</p>
                      <p className="text-xs text-muted">{compte.email}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{compte.boutiques.join(", ") || "—"}</td>
                    <td className="py-2.5 pr-3">
                      {compte.twoFactorEnabled ? (
                        <span className="badge badge-success">Activé</span>
                      ) : (
                        <span className="badge badge-neutral">Désactivé</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      {compte.lastLoginAt
                        ? new Date(compte.lastLoginAt).toLocaleString("fr-FR")
                        : "Jamais"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
