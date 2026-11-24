import { listShopMembers } from "@/lib/insights";
import { ALL_PERMISSIONS, isRole, ROLE_PERMISSIONS } from "@/lib/permissions";
import { listUserShops } from "@/lib/shops";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const ROLES_AFFICHES = ["owner", "manager", "stock", "accountant", "assistant"] as const;

/**
 * Rôles : matrice des permissions par rôle (source de vérité du code) et nombre
 * réel de membres par rôle dans vos boutiques.
 */
export default async function RolesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const shops = await listUserShops(user.id);
  const rows = await listShopMembers(shops.map((shop) => shop.id));
  const parRole = new Map<string, number>();
  for (const row of rows) {
    if (!isRole(row.role)) continue;
    parRole.set(row.role, (parRole.get(row.role) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Rôles</h1>
        <p className="mt-1 text-sm text-muted">
          Permissions accordées à chaque rôle sur vos boutiques. Source : le code du projet,
          appliquée à chaque requête côté serveur.
        </p>
      </div>

      <section className="card p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Permission</th>
                {ROLES_AFFICHES.map((role) => (
                  <th key={role} className="py-2 text-center">
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_PERMISSIONS.map((permission) => (
                <tr key={permission} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs text-night">{permission}</td>
                  {ROLES_AFFICHES.map((role) => {
                    const granted =
                      (ROLE_PERMISSIONS[role] ?? []).includes("*") ||
                      (ROLE_PERMISSIONS[role] ?? []).includes(permission);
                    return (
                      <td key={role} className="py-2 text-center">
                        {granted ? (
                          <span className="badge badge-success" title={`${role} : autorisé`}>
                            oui
                          </span>
                        ) : (
                          <span className="text-muted" aria-label={`${role} : refusé`}>
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Le propriétaire dispose de toutes les permissions (« * »). Les rôles s&apos;appliquent par
          boutique.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Membres réels par rôle</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted" role="status">
            Aucun membre enregistré sur vos boutiques.
          </p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {ROLES_AFFICHES.map((role) => (
              <li key={role} className="flex justify-between gap-3">
                <span>{role}</span>
                <span className="font-medium text-night">{parRole.get(role) ?? 0}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
