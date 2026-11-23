import { AppShell, type ShellShop } from "@/components/app-shell";
import { listUserShops } from "@/lib/shops";
import { getSessionUser } from "@/lib/session";
import { isRole, ROLE_PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";

/**
 * Layout de l'espace connecté : sidebar + topbar, sur toutes les pages du
 * groupe `(app)`. Les permissions sont calculées côté serveur, une seule fois.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const shops = await listUserShops(user.id);

  // Union des permissions sur toutes les boutiques de l'utilisateur.
  const permissions = new Set<string>();
  for (const shop of shops) {
    if (isRole(shop.role)) {
      for (const permission of ROLE_PERMISSIONS[shop.role]) {
        permissions.add(permission);
      }
    }
  }
  // Un propriétaire de boutique a toutes les permissions de son espace.
  if (shops.some((shop) => shop.role === "owner")) permissions.add("*");

  const shellShops: ShellShop[] = shops.map((shop) => ({
    id: shop.id,
    name: shop.name,
    role: shop.role,
  }));

  return (
    <AppShell
      user={{ fullName: user.fullName, email: user.email }}
      shops={shellShops}
      permissions={[...permissions]}
    >
      {children}
    </AppShell>
  );
}
